// Inköpsinformation på företag/föreningar: vem som beslutar och ansvarar för material, nuvarande leverantör,
// när avtalet går ut och när nästa inköp sker. Sparas som JSON på företaget och delas av alla dess kontakter.
import { get, run, all, audit, parseJSON } from '../db.js';
import { broadcast } from '../events.js';
import { leadName } from './leads.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, max = 300) => (v == null ? null : String(v).trim().slice(0, max) || null);

/** Inköpsinformationen med namn, roll och kontaktuppgifter för valda kontaktpersoner. */
export function presentPurchasing(company) {
  const p = parseJSON(company?.purchasing, null);
  if (!p) return null;
  const person = (id, fallback) => {
    const l = id ? get('SELECT id, first_name, last_name, title, email, phone FROM leads WHERE id = ? AND company_id = ?', id, company.id) : null;
    return l ? { id: l.id, name: leadName(l), title: l.title, email: l.email, phone: l.phone } : fallback ? { name: fallback } : null;
  };
  return { ...p, decision_maker_contact: person(p.decision_maker_id, p.decision_maker), material_contact: person(p.material_id, p.material) };
}

/** Kort text för AI (mejlutkast) och Claude. */
export function purchasingText(company) {
  const p = presentPurchasing(company);
  if (!p) return null;
  const who = (c) => (c ? [c.name, c.title].filter(Boolean).join(', ') : null);
  return [
    who(p.decision_maker_contact) && `Beslutsfattare: ${who(p.decision_maker_contact)}`,
    who(p.material_contact) && `Materialansvarig: ${who(p.material_contact)}`,
    p.supplier && `Befintlig leverantör: ${p.supplier}`,
    p.contract_end && `Avtalet går ut: ${p.contract_end}`,
    p.next_purchase && `Nästa inköp: ${p.next_purchase}${p.next_purchase_note ? ` (${p.next_purchase_note})` : ''}`,
    p.notes && `Anteckning: ${p.notes}`,
  ].filter(Boolean).join('\n') || null;
}

/** Sparar inköpsinformationen. Kontaktpersoner måste höra till företaget; annars sparas namnet som fritext. */
export function savePurchasing(company, user, b) {
  const contactId = (id) => (id && get('SELECT 1 FROM leads WHERE id = ? AND company_id = ?', Number(id), company.id) ? Number(id) : null);
  const date = (v) => (v && DATE.test(String(v)) ? String(v) : null);
  const data = {
    decision_maker_id: contactId(b.decision_maker_id), decision_maker: text(b.decision_maker, 120),
    material_id: contactId(b.material_id), material: text(b.material, 120),
    supplier: text(b.supplier, 200), contract_end: date(b.contract_end),
    next_purchase: date(b.next_purchase), next_purchase_note: text(b.next_purchase_note, 300),
    notes: text(b.notes, 2000), updated_at: new Date().toISOString(), updated_by: user?.name || null,
  };
  // Vald kontaktperson går före fritext.
  if (data.decision_maker_id) data.decision_maker = null;
  if (data.material_id) data.material = null;
  const empty = !Object.entries(data).some(([k, v]) => !['updated_at', 'updated_by'].includes(k) && v);
  run("UPDATE companies SET purchasing = ?, updated_at = datetime('now') WHERE id = ?", empty ? null : JSON.stringify(data), company.id);
  run("INSERT INTO activities (company_id, user_id, type, content) VALUES (?, ?, 'system', 'Inköpsinformation uppdaterad')", company.id, user?.id ?? null);
  audit(user?.id, 'company.purchasing', 'company', company.id);
  broadcast('refresh', { entity: 'companies' });
  return presentPurchasing(get('SELECT * FROM companies WHERE id = ?', company.id));
}

/** Avtal som löper ut och inköp som närmar sig (från en vecka sedan till `days` dagar framåt). */
export function upcomingPurchasing(visibility, days = 45) {
  const from = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  const rows = all(`SELECT c.id, c.name, c.purchasing FROM companies c WHERE c.purchasing IS NOT NULL AND ${visibility.sql}
    AND ((json_extract(c.purchasing, '$.contract_end') BETWEEN ? AND ?) OR (json_extract(c.purchasing, '$.next_purchase') BETWEEN ? AND ?))`,
  ...visibility.params, from, to, from, to);
  const items = [];
  for (const c of rows) {
    const p = parseJSON(c.purchasing, {});
    if (p.contract_end >= from && p.contract_end <= to) items.push({ company_id: c.id, company: c.name, kind: 'contract', date: p.contract_end, supplier: p.supplier });
    if (p.next_purchase >= from && p.next_purchase <= to) items.push({ company_id: c.id, company: c.name, kind: 'purchase', date: p.next_purchase, note: p.next_purchase_note });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
