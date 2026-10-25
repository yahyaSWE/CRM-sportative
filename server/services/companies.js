// Företag: en organisation med flera kontaktpersoner och affärer.
// Kontakter kopplas automatiskt via org.nr, företagets e-postdomän eller namn.
import { all, get, run, onWorkspaceOpen } from '../db.js';
import { can } from '../security.js';

// Domäner som är privata e-posttjänster och därför aldrig pekar ut ett företag.
const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.se', 'outlook.com', 'outlook.se', 'live.se', 'live.com', 'yahoo.com', 'yahoo.se',
  'icloud.com', 'me.com', 'msn.com', 'telia.com', 'spray.se', 'bredband.net', 'comhem.se', 'protonmail.com', 'proton.me', 'aol.com', 'exempel.se']);

export const domainFromEmail = (email) => {
  const d = String(email || '').split('@')[1]?.toLowerCase().trim();
  return d && !FREE_MAIL.has(d) ? d : null;
};
export const domainFromUrl = (url) => {
  if (!url || !String(url).trim()) return null;
  try { return new URL(/^https?:/.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; }
};
// "Nordlys AB" och "nordlys aktiebolag" räknas som samma namn.
export const normalizeName = (s) => String(s || '').toLowerCase()
  .replace(/\b(aktiebolag|ab|hb|kb|ek\.? ?för\.?|i sverige|sverige|sweden)\b/g, '').replace(/[^a-z0-9åäö]+/g, ' ').trim();

export function findCompany({ name, org_nr, domain }) {
  if (org_nr) { const c = get('SELECT id FROM companies WHERE replace(org_nr, \'-\', \'\') = ?', org_nr.replace(/\D/g, '')); if (c) return c.id; }
  if (domain) { const c = get('SELECT id FROM companies WHERE domain = ?', domain); if (c) return c.id; }
  const norm = normalizeName(name);
  if (norm) {
    const c = all('SELECT id, name FROM companies WHERE sv_lower(name) LIKE ?', `%${norm.split(' ')[0]}%`).find((x) => normalizeName(x.name) === norm);
    if (c) return c.id;
  }
  return null;
}

/** Hittar eller skapar företaget för en kontakt. Returnerar företagets id, eller null för privatpersoner. */
export function findOrCreateCompany({ name, org_nr, website, email, city, phone, address, industry, owner_id }) {
  const domain = domainFromUrl(website) || domainFromEmail(email);
  const existing = findCompany({ name, org_nr, domain });
  if (existing) {
    // Fyll på uppgifter som saknas, skriv aldrig över det som redan finns.
    run(`UPDATE companies SET org_nr = coalesce(org_nr, ?), website = coalesce(website, ?), domain = coalesce(domain, ?), city = coalesce(city, ?),
      address = coalesce(address, ?), industry = coalesce(industry, ?), owner_id = coalesce(owner_id, ?) WHERE id = ?`,
    org_nr || null, website || null, domain, city || null, address || null, industry || null, owner_id || null, existing);
    return existing;
  }
  if (!name?.trim()) return null;
  const r = run(`INSERT INTO companies (name, org_nr, website, domain, phone, email, address, city, industry, owner_id) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    name.trim(), org_nr || null, website || null, domain, phone || null, null, address || null, city || null, industry || null, owner_id || null);
  return Number(r.lastInsertRowid);
}

/** Kopplar ett lead till rätt företag utifrån dess uppgifter och håller företagsnamnet på leadet i synk. */
export function linkLeadToCompany(leadId) {
  const l = get('SELECT * FROM leads WHERE id = ?', leadId);
  if (!l) return null;
  const f = JSON.parse(l.fields || '{}');
  const companyId = findOrCreateCompany({
    name: l.company, org_nr: f.org_nr, website: f.hemsida, email: l.email, city: l.city, address: f.adress, industry: f.bransch, owner_id: l.owner_id,
  });
  if (companyId && companyId !== l.company_id) {
    const c = get('SELECT name FROM companies WHERE id = ?', companyId);
    run('UPDATE leads SET company_id = ?, company = ? WHERE id = ?', companyId, c.name, leadId);
    run('UPDATE deals SET company_id = ? WHERE lead_id = ? AND company_id IS NULL', companyId, leadId);
  }
  return companyId;
}

// Engångsmigrering: befintliga leads med företagsnamn får ett företag.
// Körs när en arbetsyta öppnas: kopplar leads och affärer som saknar företag.
onWorkspaceOpen(migrateCompanies);

export function migrateCompanies() {
  for (const l of all("SELECT id FROM leads WHERE company_id IS NULL AND (company IS NOT NULL OR json_extract(fields, '$.org_nr') IS NOT NULL)")) linkLeadToCompany(l.id);
  run('UPDATE deals SET company_id = (SELECT company_id FROM leads WHERE leads.id = deals.lead_id) WHERE company_id IS NULL AND lead_id IS NOT NULL');
}

// Ett företag syns för den som ser alla, äger det, eller har en kontakt eller affär där.
export function companyVisibilitySql(user, a = 'c') {
  if (can(user, 'leads.view_all')) return { sql: '1=1', params: [] };
  return {
    sql: `(${a}.owner_id = ? OR EXISTS (SELECT 1 FROM leads vl WHERE vl.company_id = ${a}.id AND (vl.owner_id = ? OR vl.owner_id IS NULL))
      OR EXISTS (SELECT 1 FROM deals vd WHERE vd.company_id = ${a}.id AND vd.owner_id = ?))`,
    params: [user.id, user.id, user.id],
  };
}

export const COMPANY_STATS = (a = 'c') => `
  (SELECT count(*) FROM leads WHERE company_id = ${a}.id) AS contact_count,
  (SELECT coalesce(sum(value),0) FROM deals WHERE company_id = ${a}.id AND stage = 'won') AS won_value,
  (SELECT count(*) FROM deals WHERE company_id = ${a}.id AND stage = 'won') AS won_count,
  (SELECT coalesce(sum(value),0) FROM deals WHERE company_id = ${a}.id AND stage NOT IN ('won','lost')) AS open_value,
  (SELECT count(*) FROM deals WHERE company_id = ${a}.id AND stage NOT IN ('won','lost')) AS open_count,
  (SELECT min(closed_at) FROM deals WHERE company_id = ${a}.id AND stage = 'won') AS customer_since,
  (SELECT max(x.created_at) FROM activities x LEFT JOIN leads xl ON xl.id = x.lead_id
    WHERE (x.company_id = ${a}.id OR xl.company_id = ${a}.id) AND x.type IN ('call','email','meeting','note')) AS last_contact_at`;
