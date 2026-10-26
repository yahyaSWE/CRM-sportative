// Läser företagets egen hemsida (startsida + kontaktsida) för att hitta e-post och organisationsnummer.
// Varsamt: respekterar robots.txt, högst ett par sidor per företag, korta timeouts och begränsad storlek.
import { validOrgNr, formatOrgNr } from './bolagsverket.js';

const UA = 'LeadFlowCRM/1.0 (+kontaktuppgifter for foretagsprospektering)';
const CONTACT_PATHS = ['/kontakt', '/kontakta-oss', '/contact', '/om-oss'];
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const ORGNR_RE = /(?:org(?:anisations)?\.?\s*(?:nr|nummer)?\.?|corporate\s*id)[\s:.-]*(\d{6}\s?-?\s?\d{4})/gi;
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp)$|example\.|sentry|wixpress|@domain|@email|noreply|no-reply|godaddy|wordpress/i;

async function get(url, maxBytes = 400_000) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || '';
  if (!/text\/(html|plain)/.test(type)) return null;
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.length;
    if (size > maxBytes) { await reader.cancel(); break; }
  }
  return { text: Buffer.concat(chunks).toString('utf8'), url: res.url || url };
}

async function allowedByRobots(origin) {
  try {
    const r = await get(`${origin}/robots.txt`, 50_000);
    if (!r) return true;
    let applies = false;
    for (const raw of r.text.split(/\r?\n/)) {
      const line = raw.split('#')[0].trim();
      const [k, ...rest] = line.split(':');
      const v = rest.join(':').trim();
      if (/^user-agent$/i.test(k)) applies = v === '*' || /leadflow/i.test(v);
      else if (applies && /^disallow$/i.test(k) && v === '/') return false;
    }
    return true;
  } catch { return true; }
}

function extract(html, host) {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ');
  const decoded = text.replace(/&#64;|&commat;|\s?\[at\]\s?|\s?\(at\)\s?/gi, '@');
  const emails = [...new Set((decoded.match(EMAIL_RE) || []).map((e) => e.toLowerCase().replace(/^mailto:/, '')))].filter((e) => !BAD_EMAIL.test(e));
  // Föredra adresser på företagets egen domän och allmänna adresser (info@, kontakt@) framför personliga.
  const domain = host.replace(/^www\./, '');
  emails.sort((a, b) => (b.endsWith(domain) - a.endsWith(domain)) || (/^(info|kontakt|hej|hello|contact)@/.test(b) - /^(info|kontakt|hej|hello|contact)@/.test(a)));
  const plain = text.replace(/<[^>]+>/g, ' ');
  const org = [...plain.matchAll(ORGNR_RE)].map((m) => m[1]).find(validOrgNr);
  return { emails, orgNr: org ? formatOrgNr(org) : null };
}

export async function enrichFromWebsite(website) {
  let base;
  try { base = new URL(website); } catch { return { note: 'Ogiltig hemsida' }; }
  // Läs bara publika webbadresser – aldrig interna nätverk.
  if (!/^https?:$/.test(base.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[|0\.)/.test(base.hostname) || !base.hostname.includes('.')) {
    return { note: 'Hemsidan hoppades över' };
  }
  if (!(await allowedByRobots(base.origin))) return { note: 'Hemsidan tillåter inte automatisk läsning (robots.txt)' };
  const found = { emails: [], orgNr: null };
  const pages = [base.href, ...CONTACT_PATHS.map((p) => base.origin + p)];
  let read = 0;
  for (const url of pages) {
    if (read >= 3 || (found.emails.length && found.orgNr)) break;
    try {
      const r = await get(url);
      if (!r) continue;
      read++;
      const x = extract(r.text, base.hostname);
      for (const e of x.emails) if (!found.emails.includes(e)) found.emails.push(e);
      found.orgNr ||= x.orgNr;
    } catch { /* sidan svarade inte – prova nästa */ }
  }
  return { email: found.emails[0] || null, orgNr: found.orgNr, note: read ? null : 'Hemsidan svarade inte' };
}

// ---------- Text för AI-berikning ----------
const ABOUT_LINK = /href=["']([^"'#]*(?:om-oss|om_oss|\/om\/?|about|foretaget|företaget|vilka-vi-ar|verksamhet)[^"'#]*)["']/i;
const toText = (html) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, ' ')
  .replace(/<(br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const meta = (html, name) => html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1]
  || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'))?.[1] || null;

/** Läser startsidan och (om den finns) en "om oss"-sida. Returnerar titel, beskrivning och text (begränsad längd). */
export async function readWebsiteText(website, maxChars = 6000) {
  let base;
  try { base = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`); } catch { return { note: 'Ogiltig hemsida' }; }
  if (!/^https?:$/.test(base.protocol) || /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[|0\.)/.test(base.hostname) || !base.hostname.includes('.')) {
    return { note: 'Hemsidan hoppades över' };
  }
  if (!(await allowedByRobots(base.origin))) return { note: 'Hemsidan tillåter inte automatisk läsning (robots.txt)' };
  const home = await get(base.href).catch(() => null);
  if (!home) return { note: 'Hemsidan svarade inte' };
  const pages = [{ url: home.url, text: toText(home.text).slice(0, maxChars) }];
  const about = home.text.match(ABOUT_LINK)?.[1];
  if (about) {
    try {
      const url = new URL(about, home.url);
      if (url.hostname === new URL(home.url).hostname) {
        const r = await get(url.href);
        if (r) pages.push({ url: r.url, text: toText(r.text).slice(0, maxChars) });
      }
    } catch { /* ingen om-sida */ }
  }
  return {
    url: home.url, title: home.text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null,
    description: meta(home.text, 'description') || meta(home.text, 'og:description'), pages,
  };
}
