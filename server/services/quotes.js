// Produktrader, offerter och e-signering.
import crypto from 'node:crypto';
import { all, get, run, tx, parseJSON, audit } from '../db.js';
import { randomToken } from '../security.js';
import { broadcast } from '../events.js';
import { notify, getLead, leadName } from './leads.js';
import { PROD } from '../config.js';

const PROFILE_KEY = 'sales:profile';
// I produktion är företagsuppgifterna tomma tills de fylls i under Produkter & offerter → Offertinställningar.
const DEMO_COMPANY = PROD ? { name: '', org_nr: '', address: '', email: '', phone: '', website: '' }
  : { name: 'LeadFlow Demo AB', org_nr: '559000-0000', address: 'Storgatan 1, 111 22 Stockholm', email: 'offert@leadflow.se', phone: '08-123 456 78', website: 'leadflow.se' };
export const DEFAULT_PROFILE = {
  ...DEMO_COMPANY, validity_days: 30,
  terms: 'Priser anges exklusive moms. Betalningsvillkor 30 dagar netto. Licenser faktureras kvartalsvis i förskott. Avtalet löper i 12 månader och förlängs därefter med 12 månader om det inte sägs upp senast 3 månader före avtalstidens slut.',
};
export const getProfile = () => ({ ...DEFAULT_PROFILE, ...parseJSON(get('SELECT value FROM settings WHERE key = ?', PROFILE_KEY)?.value, {}) });
export function saveProfile(p) {
  const next = { ...getProfile(), ...p };
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', PROFILE_KEY, JSON.stringify(next));
  return next;
}

// ---------- Belopp ----------
const round2 = (n) => Math.round(n * 100) / 100;
export const lineTotal = (i) => round2(i.quantity * i.unit_price * (1 - (i.discount || 0) / 100));
export function totals(items) {
  const subtotal = round2(items.reduce((s, i) => s + lineTotal(i), 0));
  const vatByRate = {};
  for (const i of items) vatByRate[i.vat_rate] = round2((vatByRate[i.vat_rate] || 0) + lineTotal(i) * i.vat_rate / 100);
  const vat = round2(Object.values(vatByRate).reduce((s, v) => s + v, 0));
  const discount = round2(items.reduce((s, i) => s + i.quantity * i.unit_price * (i.discount || 0) / 100, 0));
  return { subtotal, vat, vatByRate, total: round2(subtotal + vat), discount };
}

export const dealItems = (dealId) => all('SELECT * FROM deal_items WHERE deal_id = ? ORDER BY position, id', dealId);

// Affärens värde följer produktraderna (exkl. moms) så snart det finns rader.
export function syncDealValue(dealId) {
  const items = dealItems(dealId);
  if (items.length) run("UPDATE deals SET value = ?, updated_at = datetime('now') WHERE id = ?", Math.round(totals(items).subtotal), dealId);
}

// ---------- Offerter ----------
function nextNumber() {
  const year = new Date().getFullYear();
  const key = `quote_seq:${year}`;
  const n = Number(get('SELECT value FROM settings WHERE key = ?', key)?.value || 0) + 1;
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(n));
  return `Q-${year}-${String(n).padStart(4, '0')}`;
}

export function quoteStatus(q) {
  if (['accepted', 'declined'].includes(q.status)) return q.status;
  if (q.valid_until && q.valid_until < new Date().toISOString().slice(0, 10)) return 'expired';
  return q.status;
}
export const presentQuote = (q) => q && { ...q, status: quoteStatus(q), content: parseJSON(q.content, {}), signature: undefined, has_signature: !!q.signature };

export function createQuote(user, deal, b) {
  const items = dealItems(deal.id);
  if (!items.length) throw Object.assign(new Error('Lägg till minst en produktrad innan du skapar en offert'), { status: 400 });
  const profile = getProfile();
  const lead = deal.lead_id ? getLead(deal.lead_id) : null;
  const company = deal.company_id ? get('SELECT * FROM companies WHERE id = ?', deal.company_id) : null;
  const recipient = b.recipient_id ? get('SELECT * FROM leads WHERE id = ?', Number(b.recipient_id)) : lead;
  const owner = get('SELECT name, email FROM users WHERE id = ?', deal.owner_id || user.id);
  const validUntil = b.valid_until || new Date(Date.now() + Number(profile.validity_days || 30) * 864e5).toISOString().slice(0, 10);
  const content = {
    seller: { name: profile.name, org_nr: profile.org_nr, address: profile.address, email: profile.email, phone: profile.phone, website: profile.website },
    contact: { name: owner?.name, email: owner?.email },
    customer: {
      company: company?.name || lead?.company || null, org_nr: company?.org_nr || null, address: [company?.address, company?.city].filter(Boolean).join(', ') || null,
      name: recipient ? leadName(recipient) : null, email: recipient?.email || null,
    },
    items: items.map((i) => ({ name: i.name, description: i.description, quantity: i.quantity, unit: i.unit, unit_price: i.unit_price, discount: i.discount, vat_rate: i.vat_rate, recurring: i.recurring, total: lineTotal(i) })),
    totals: totals(items),
    currency: 'SEK',
  };
  const json = JSON.stringify(content);
  const ins = run(`INSERT INTO quotes (deal_id, number, token, title, intro, terms, valid_until, recipient_name, recipient_email, content, content_hash, total, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, deal.id, nextNumber(), randomToken(24), b.title?.trim() || deal.title, b.intro || null, b.terms ?? profile.terms,
  validUntil, content.customer.name, content.customer.email, json, crypto.createHash('sha256').update(json).digest('hex'), content.totals.subtotal, user.id);
  const q = get('SELECT * FROM quotes WHERE id = ?', ins.lastInsertRowid);
  run("INSERT INTO activities (lead_id, deal_id, user_id, type, content) VALUES (?, ?, ?, 'system', ?)", deal.lead_id, deal.id, user.id,
    `Offert ${q.number} skapad (${Math.round(q.total).toLocaleString('sv-SE')} kr exkl. moms)`);
  audit(user.id, 'quote.create', 'quote', q.id);
  return q;
}

export function markSent(user, q) {
  if (q.status !== 'draft') return;
  run("UPDATE quotes SET status = 'sent', sent_at = datetime('now') WHERE id = ?", q.id);
  const d = get('SELECT * FROM deals WHERE id = ?', q.deal_id);
  run("INSERT INTO activities (lead_id, deal_id, user_id, type, content) VALUES (?, ?, ?, 'system', ?)", d.lead_id, d.id, user.id, `Offert ${q.number} skickad till ${q.recipient_name || q.recipient_email || 'kunden'}`);
  // En skickad offert flyttar affären till "Offert skickad" om den ligger tidigare i pipelinen.
  if (['qualified', 'contact'].includes(d.stage)) {
    run("UPDATE deals SET stage = 'proposal', stage_changed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", d.id);
    run("INSERT INTO activities (lead_id, deal_id, user_id, type, content) VALUES (?, ?, ?, 'system', ?)", d.lead_id, d.id, user.id, `Affären "${d.title}" flyttad till Offert skickad`);
  }
  broadcast('refresh', { entity: 'deals' });
}

// ---------- Kundens sida (publik, nås via hemlig länk) ----------
export function publicView(token, { track } = {}) {
  const q = get('SELECT * FROM quotes WHERE token = ?', token);
  if (!q) return null;
  if (track && !['accepted', 'declined'].includes(q.status)) {
    const first = !q.viewed_at;
    run(`UPDATE quotes SET view_count = view_count + 1, viewed_at = coalesce(viewed_at, datetime('now')), status = CASE WHEN status IN ('draft','sent') THEN 'viewed' ELSE status END WHERE id = ?`, q.id);
    if (first) {
      const d = get('SELECT * FROM deals WHERE id = ?', q.deal_id);
      run("INSERT INTO activities (lead_id, deal_id, type, content) VALUES (?, ?, 'system', ?)", d.lead_id, d.id, `${q.recipient_name || 'Kunden'} öppnade offert ${q.number}`);
      notify(d.owner_id, `${q.recipient_name || 'Kunden'} öppnade offerten ${q.number} (${d.title})`, `/pipeline/${d.id}`);
      broadcast('refresh', { entity: 'deals' });
    }
  }
  const fresh = get('SELECT * FROM quotes WHERE id = ?', q.id);
  return {
    number: fresh.number, title: fresh.title, intro: fresh.intro, terms: fresh.terms, valid_until: fresh.valid_until, status: quoteStatus(fresh),
    created_at: fresh.created_at, content: parseJSON(fresh.content, {}), content_hash: fresh.content_hash,
    signed: fresh.signed_at ? { at: fresh.signed_at, name: fresh.signer_name, email: fresh.signer_email, title: fresh.signer_title, signature: fresh.signature } : null,
    declined: fresh.declined_at ? { at: fresh.declined_at, reason: fresh.decline_reason } : null,
    // Logga, färg och sidfot hämtas från de aktuella offertinställningarna (de ingår inte i det signerade innehållet).
    branding: (({ logo, accent, footer }) => ({ logo: logo || null, accent: accent || null, footer: footer || null }))(getProfile()),
  };
}

export function signQuote(token, { name, email, title, signature, accept }, meta) {
  const q = get('SELECT * FROM quotes WHERE token = ?', token);
  if (!q) throw Object.assign(new Error('Offerten finns inte'), { status: 404 });
  const st = quoteStatus(q);
  if (st === 'accepted') throw Object.assign(new Error('Offerten är redan signerad'), { status: 409 });
  if (st === 'declined') throw Object.assign(new Error('Offerten har redan avböjts'), { status: 409 });
  if (st === 'expired') throw Object.assign(new Error('Offerten har gått ut. Kontakta oss för en ny.'), { status: 410 });
  if (!accept) throw Object.assign(new Error('Du behöver godkänna offerten och villkoren'), { status: 400 });
  if (!name?.trim() || name.trim().length < 3) throw Object.assign(new Error('Skriv ditt fullständiga namn'), { status: 400 });
  if (!/.+@.+\..+/.test(email || '')) throw Object.assign(new Error('Ange en giltig e-postadress'), { status: 400 });
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature || '') || signature.length > 300_000) throw Object.assign(new Error('Rita din signatur i rutan'), { status: 400 });
  // Innehållet får inte ha ändrats sedan offerten skapades.
  if (crypto.createHash('sha256').update(q.content).digest('hex') !== q.content_hash) throw Object.assign(new Error('Offerten har ändrats och kan inte signeras'), { status: 409 });

  const d = get('SELECT * FROM deals WHERE id = ?', q.deal_id);
  tx(() => {
    run(`UPDATE quotes SET status = 'accepted', signed_at = datetime('now'), signer_name = ?, signer_email = ?, signer_title = ?, signer_ip = ?, signer_agent = ?, signature = ? WHERE id = ?`,
      name.trim(), email.trim().toLowerCase(), title?.trim() || null, meta.ip, String(meta.agent || '').slice(0, 300), signature, q.id);
    run(`UPDATE deals SET stage = 'won', value = ?, closed_at = datetime('now'), stage_changed_at = datetime('now'), lost_reason = NULL, updated_at = datetime('now') WHERE id = ?`, Math.round(q.total), d.id);
    run("INSERT INTO activities (lead_id, deal_id, type, content) VALUES (?, ?, 'system', ?)", d.lead_id, d.id,
      `Offert ${q.number} signerad av ${name.trim()}${title ? `, ${title.trim()}` : ''} (${email.trim()}). Affären markerad som vunnen.`);
    if (d.lead_id) {
      run(`UPDATE leads SET status = 'converted', tags = CASE WHEN EXISTS (SELECT 1 FROM json_each(tags) WHERE value = 'Kund') THEN tags
        ELSE json_insert(tags, '$[#]', 'Kund') END WHERE id = ?`, d.lead_id);
    }
  });
  notify(d.owner_id, `🎉 ${name.trim()} signerade offerten ${q.number} – ${d.title} är vunnen!`, `/pipeline/${d.id}`);
  audit(null, 'quote.signed', 'quote', q.id, { signer: email });
  broadcast('refresh', { entity: 'deals' });
  return publicView(token);
}

export function declineQuote(token, reason) {
  const q = get('SELECT * FROM quotes WHERE token = ?', token);
  if (!q) throw Object.assign(new Error('Offerten finns inte'), { status: 404 });
  if (['accepted', 'declined'].includes(quoteStatus(q))) throw Object.assign(new Error('Offerten är redan besvarad'), { status: 409 });
  run("UPDATE quotes SET status = 'declined', declined_at = datetime('now'), decline_reason = ? WHERE id = ?", String(reason || '').slice(0, 1000) || null, q.id);
  const d = get('SELECT * FROM deals WHERE id = ?', q.deal_id);
  run("INSERT INTO activities (lead_id, deal_id, type, content) VALUES (?, ?, 'system', ?)", d.lead_id, d.id, `Kunden avböjde offert ${q.number}${reason ? `: ${reason}` : ''}`);
  notify(d.owner_id, `Offerten ${q.number} avböjdes${reason ? `: ${reason}` : ''}`, `/pipeline/${d.id}`);
  broadcast('refresh', { entity: 'deals' });
  return publicView(token);
}
