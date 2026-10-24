// Prospektering: hitta företag (Google Places) → berika (hemsida + Bolagsverket) → granska → importera som leads.
import { all, get, run, parseJSON, audit } from '../db.js';
import { encrypt, decrypt } from '../security.js';
import { broadcast } from '../events.js';
import { ingestLead, notify } from '../services/leads.js';
import { searchPlaces, demoPlaces } from './google.js';
import { enrichFromWebsite } from './website.js';
import { lookupOrganisation, validOrgNr, formatOrgNr } from './bolagsverket.js';

const CONFIG_KEY = 'prospecting:config';

// Arbete som avbröts av en omstart tas upp igen.
run("UPDATE prospects SET enrich_status = 'pending' WHERE enrich_status = 'running'");
run("UPDATE prospect_searches SET status = 'idle' WHERE status = 'running'");
export const RETENTION_DAYS = 30;

export function getConfig() {
  return decrypt(get('SELECT value FROM settings WHERE key = ?', CONFIG_KEY)?.value);
}
export function saveConfig(patch) {
  const cfg = { ...getConfig() };
  for (const [k, v] of Object.entries(patch)) {
    if (['googleApiKey', 'bvClientSecret'].includes(k) && (v === '••••••••' || v === undefined)) continue;
    cfg[k] = v;
  }
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', CONFIG_KEY, encrypt(cfg));
  return cfg;
}
export const hasBolagsverket = (cfg) => !!(cfg.bvClientId && cfg.bvClientSecret);

export const hydrateProspect = (p) => p && { ...p, company: parseJSON(p.company, {}), demo: !!p.demo };
export const hydrateSearch = (s) => s && { ...s, filters: parseJSON(s.filters, {}) };

const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; } };
const phoneTail = (p) => (p ? p.replace(/\D/g, '').slice(-9) : null);

// Finns företaget redan som lead? Matchar på e-post, telefon, org.nr, hemsidans domän eller exakt företagsnamn.
function findExistingLead(p) {
  if (p.email) { const l = get('SELECT id FROM leads WHERE email = ?', p.email); if (l) return l.id; }
  const tail = phoneTail(p.phone);
  if (tail?.length >= 7) { const l = get("SELECT id FROM leads WHERE phone IS NOT NULL AND substr(replace(replace(phone,'+',''),' ',''), -9) = ?", tail); if (l) return l.id; }
  if (p.org_nr) { const l = get("SELECT id FROM leads WHERE json_extract(fields, '$.org_nr') = ?", p.org_nr); if (l) return l.id; }
  const dom = domainOf(p.website);
  if (dom) { const l = get("SELECT id FROM leads WHERE email LIKE ? OR json_extract(fields, '$.hemsida') LIKE ?", `%@${dom}`, `%${dom}%`); if (l) return l.id; }
  if (p.name) { const l = get('SELECT id FROM leads WHERE lower(company) = lower(?)', p.name); if (l) return l.id; }
  return null;
}

function passesFilters(p, f) {
  if (f.excludeClosed !== false && p.business_status && p.business_status !== 'OPERATIONAL') return false;
  if (f.requireWebsite && !p.website) return false;
  if (f.requirePhone && !p.phone) return false;
  if (f.minRating && (p.rating ?? 0) < Number(f.minRating)) return false;
  if (f.minReviews && (p.reviews ?? 0) < Number(f.minReviews)) return false;
  if (f.exclude) {
    const words = String(f.exclude).toLowerCase().split(',').map((w) => w.trim()).filter(Boolean);
    if (words.some((w) => (p.name || '').toLowerCase().includes(w))) return false;
  }
  return true;
}

const running = new Set();

export async function runSearch(searchId, { notifyUserId } = {}) {
  if (running.has(searchId)) return { skipped: true };
  const s = hydrateSearch(get('SELECT * FROM prospect_searches WHERE id = ?', searchId));
  if (!s) throw new Error('Sökningen finns inte');
  running.add(searchId);
  run("UPDATE prospect_searches SET status = 'running', last_error = NULL WHERE id = ?", s.id);
  broadcast('prospects', { searchId: s.id, status: 'running' });
  try {
    const cfg = getConfig();
    const textQuery = [s.query, s.location && `i ${s.location}`].filter(Boolean).join(' ');
    const places = cfg.googleApiKey ? await searchPlaces(cfg.googleApiKey, textQuery, Number(s.filters.max) || 60) : demoPlaces(s.query, s.location);
    let added = 0, skipped = 0;
    for (const p of places) {
      if (!passesFilters(p, s.filters)) { skipped++; continue; }
      if (get('SELECT 1 FROM prospects WHERE place_id = ?', p.place_id)) { skipped++; continue; } // redan sedd tidigare
      run(`INSERT INTO prospects (search_id, place_id, name, category, address, city, phone, website, rating, reviews, maps_url, business_status, demo, duplicate_lead_id, enrich_status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, s.id, p.place_id, p.name, p.category, p.address, p.city, p.phone, p.website, p.rating, p.reviews,
        p.maps_url, p.business_status, p.demo ? 1 : 0, findExistingLead(p), p.website || hasBolagsverket(cfg) ? 'pending' : 'done');
      added++;
    }
    run("UPDATE prospect_searches SET status = 'idle', last_run_at = datetime('now'), found_count = found_count + ? WHERE id = ?", added, s.id);
    broadcast('prospects', { searchId: s.id, status: 'idle', added });
    if (notifyUserId && added) notify(notifyUserId, `Sparad sökning "${s.name}" hittade ${added} nya företag att granska`, `/prospecting?search=${s.id}`);
    processQueue();
    return { added, skipped, demo: !cfg.googleApiKey };
  } catch (e) {
    run("UPDATE prospect_searches SET status = 'error', last_error = ? WHERE id = ?", String(e.message).slice(0, 500), s.id);
    broadcast('prospects', { searchId: s.id, status: 'error' });
    throw e;
  } finally {
    running.delete(searchId);
  }
}

// ---------- Berikning i bakgrunden ----------
let active = 0;
const CONCURRENCY = 3;

function demoEnrich(p) {
  const dom = domainOf(p.website);
  // Påhittat men giltigt organisationsnummer (5590…) för demoläget.
  let base = `5590${String(Math.abs([...p.place_id].reduce((s, c) => s * 31 + c.charCodeAt(0), 7)) % 100000).padStart(5, '0')}`;
  const digits = [...base].map(Number);
  const sum = digits.reduce((acc, n, i) => { let x = n * (i % 2 === 0 ? 2 : 1); if (x > 9) x -= 9; return acc + x; }, 0);
  const orgNr = formatOrgNr(base + ((10 - (sum % 10)) % 10));
  return {
    email: dom ? `info@${dom}` : null, org_nr: dom ? orgNr : null,
    company: dom ? { name: `${p.name} AB`, form: 'Aktiebolag', registered: '2016-03-14', city: p.city, sni: [{ kod: '00000', text: p.category || 'Verksamhet' }], source: 'demo' } : {},
    note: dom ? null : 'Ingen hemsida att läsa',
  };
}

async function enrichOne(p) {
  const cfg = getConfig();
  const out = { email: p.email, org_nr: p.org_nr, company: parseJSON(p.company, {}), notes: [] };
  if (p.demo) {
    const d = demoEnrich(p);
    Object.assign(out, { email: d.email, org_nr: d.org_nr, company: d.company }); if (d.note) out.notes.push(d.note);
  } else {
    if (p.website && (!out.email || !out.org_nr)) {
      const w = await enrichFromWebsite(p.website);
      out.email ||= w.email; out.org_nr ||= w.orgNr;
      if (w.note) out.notes.push(w.note);
      else if (!w.email && !w.orgNr) out.notes.push('Hittade ingen e-post eller org.nr på hemsidan');
    }
    if (out.org_nr && hasBolagsverket(cfg)) {
      try {
        const org = await lookupOrganisation(cfg, out.org_nr);
        if (org) out.company = { ...org, source: 'bolagsverket' };
        else out.notes.push('Org.nr hittades inte hos Bolagsverket');
        if (org?.deregistered) out.notes.push('Bolaget är avregistrerat');
      } catch (e) { out.notes.push(`Bolagsverket: ${e.message}`); }
    }
  }
  const merged = { ...p, email: out.email, org_nr: out.org_nr };
  run(`UPDATE prospects SET email = ?, org_nr = ?, company = ?, enrich_status = 'done', enrich_note = ?, duplicate_lead_id = coalesce(duplicate_lead_id, ?),
    updated_at = datetime('now') WHERE id = ?`, out.email, out.org_nr, JSON.stringify(out.company), out.notes.join(' · ') || null, findExistingLead(merged), p.id);
  broadcast('prospect', hydrateProspect(get('SELECT * FROM prospects WHERE id = ?', p.id)));
}

export function processQueue() {
  while (active < CONCURRENCY) {
    const p = get(`SELECT * FROM prospects WHERE enrich_status = 'pending' ORDER BY id LIMIT 1`);
    if (!p) return;
    run("UPDATE prospects SET enrich_status = 'running' WHERE id = ?", p.id);
    active++;
    enrichOne(p)
      .catch((e) => run("UPDATE prospects SET enrich_status = 'done', enrich_note = ? WHERE id = ?", String(e.message).slice(0, 300), p.id))
      .finally(() => { active--; processQueue(); });
  }
}

export async function setOrgNr(id, orgNr) {
  if (!validOrgNr(orgNr)) throw new Error('Ogiltigt organisationsnummer');
  run("UPDATE prospects SET org_nr = ?, enrich_status = 'pending' WHERE id = ?", formatOrgNr(orgNr), id);
  processQueue();
}

// ---------- Import ----------
export function importProspects(ids, user, { ownerId } = {}) {
  let created = 0, duplicates = 0;
  const leadIds = [];
  for (const id of ids) {
    const p = hydrateProspect(get('SELECT * FROM prospects WHERE id = ?', id));
    if (!p || p.status === 'imported') continue;
    const existing = p.duplicate_lead_id || findExistingLead(p);
    if (existing) {
      run("UPDATE prospects SET status = 'duplicate', duplicate_lead_id = ? WHERE id = ?", existing, p.id);
      duplicates++; continue;
    }
    const search = get('SELECT name FROM prospect_searches WHERE id = ?', p.search_id);
    const c = p.company || {};
    const r = ingestLead({
      source: 'prospecting', sourceDetail: search?.name || 'Prospektering', externalId: p.place_id,
      raw: {
        company: c.name || p.name, phone: p.phone, email: p.email, city: p.city || c.city,
        hemsida: p.website, org_nr: p.org_nr, bransch: c.sni?.map((s) => s.text).join(', ') || p.category,
        bolagsform: c.form, adress: p.address, google_betyg: p.rating ? `${p.rating} (${p.reviews} omdömen)` : null,
      },
    });
    if (r.result === 'created') {
      const leadId = r.lead.id;
      run(`UPDATE leads SET tags = json_insert(tags, '$[#]', 'Kall lead'), owner_id = coalesce(owner_id, ?) WHERE id = ?`, ownerId || null, leadId);
      run("UPDATE prospects SET status = 'imported', lead_id = ? WHERE id = ?", leadId, p.id);
      leadIds.push(leadId); created++;
    } else {
      run("UPDATE prospects SET status = 'duplicate', duplicate_lead_id = ? WHERE id = ?", r.lead?.id ?? null, p.id);
      duplicates++;
    }
  }
  audit(user.id, 'prospects.import', 'lead', null, { count: created });
  if (ownerId && ownerId !== user.id && created) notify(ownerId, `${user.name} gav dig ${created} nya prospekt att bearbeta`, '/leads?source=prospecting&owner=me');
  broadcast('refresh', { entity: 'leads' });
  return { created, duplicates, leadIds };
}

// Googles villkor: platsdata (utom place_id) får inte lagras permanent. Ej importerade prospekt rensas efter 30 dagar,
// men place_id sparas så att samma företag inte dyker upp igen.
export function cleanup() {
  run(`UPDATE prospects SET name = NULL, category = NULL, address = NULL, city = NULL, phone = NULL, website = NULL, email = NULL,
      rating = NULL, reviews = NULL, maps_url = NULL, company = '{}', status = CASE WHEN status = 'new' THEN 'expired' ELSE status END
    WHERE demo = 0 AND status IN ('new', 'rejected', 'duplicate') AND name IS NOT NULL AND created_at < datetime('now', ?)`, `-${RETENTION_DAYS} days`);
}

export function scheduledTick() {
  cleanup();
  for (const s of all("SELECT * FROM prospect_searches WHERE schedule = 'weekly' AND status != 'running' AND (last_run_at IS NULL OR last_run_at < datetime('now', '-7 days'))")) {
    runSearch(s.id, { notifyUserId: s.created_by }).catch(() => {});
  }
  processQueue();
}
