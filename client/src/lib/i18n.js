// Språkstöd: texterna i koden är svenska och fungerar själva som nycklar. Engelska slås upp i en ordlista.
// Språket läses en gång när appen startar; vid byte sparas det och sidan laddas om, så att även texter
// som beräknas när en modul laddas (t.ex. listor med etiketter) får rätt språk.
import EN from './i18n.en.js';

export const LANGUAGES = [
  { code: 'sv', label: 'Svenska', locale: 'sv-SE' },
  { code: 'en', label: 'English', locale: 'en-GB' },
];
const STORAGE_KEY = 'lf_lang';

function initial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch { /* lagring kan vara spärrad */ }
  // Innan någon loggat in: webbläsarens språk (svenska för sv, annars engelska).
  return navigator.language?.toLowerCase().startsWith('sv') ? 'sv' : 'en';
}

let current = initial();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const getLanguage = () => current;
export const locale = () => LANGUAGES.find((l) => l.code === current).locale;

const missing = new Set();
export function t(text, vars) {
  let out = text;
  if (current === 'en') {
    out = EN[text];
    if (out === undefined) {
      out = text;
      if (import.meta.env?.DEV && !missing.has(text)) { missing.add(text); console.warn('[i18n] saknar engelsk översättning:', JSON.stringify(text)); }
    }
  }
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : out;
}

// ---------- Texter som servern sparat (tidslinjens systemhändelser och notiser) ----------
// De lagras på svenska och översätts när de visas, utifrån samma mallar som servern använder.
const SRC_EN = { 'e-post': 'email', 'webbformulär': 'web form', manuellt: 'manually', prospektering: 'prospecting', import: 'import' };
const src = (s) => SRC_EN[s] ?? s;
const STORED = [
  [/^Lead skapad automatiskt via (\S+)(?: \((.+?)\))?(?:\. Regler: (.+))?$/s, (m) => `Lead created automatically via ${src(m[1])}${m[2] ? ` (${m[2]})` : ''}${m[3] ? `. Rules: ${m[3]}` : ''}`],
  [/^Lead skapad av (.+)$/s, (m) => `Lead created by ${m[1]}`],
  [/^Ny förfrågan via (\S+)(?: \((.+?)\))?(?::\n([\s\S]*))?$/, (m) => `New enquiry via ${src(m[1])}${m[2] ? ` (${m[2]})` : ''}${m[3] ? `:\n${m[3]}` : ''}`],
  [/^Status ändrad till (.+)$/s, (m) => `Status changed to ${t(m[1])}`],
  [/^Tilldelning borttagen$/, () => 'Assignment removed'],
  [/^Tilldelad (.+)$/s, (m) => `Assigned to ${m[1]}`],
  [/^Konverterad till affär(?: \((.+) kr\))?$/s, (m) => `Converted to deal${m[1] ? ` (SEK ${m[1]})` : ''}`],
  [/^Affären "(.+)" flyttad till (.+?)(?: – anledning: (.+?)(?: \((.+)\))?)?$/s, (m) => `Deal "${m[1]}" moved to ${t(m[2])}${m[3] ? ` – reason: ${t(m[3])}${m[4] ? ` (${m[4]})` : ''}` : ''}`],
  [/^Offert (\S+) skapad \((.+) kr exkl\. moms\)$/s, (m) => `Quote ${m[1]} created (SEK ${m[2]} excl. VAT)`],
  [/^Offert (\S+) skickad till (.+)$/s, (m) => `Quote ${m[1]} sent to ${m[2] === 'kunden' ? 'the customer' : m[2]}`],
  [/^(.+) öppnade offert (\S+)$/s, (m) => `${m[1] === 'Kunden' ? 'The customer' : m[1]} opened quote ${m[2]}`],
  [/^Offert (\S+) signerad av (.+) \((.+)\)\. Affären markerad som vunnen\.$/s, (m) => `Quote ${m[1]} signed by ${m[2]} (${m[3]}). Deal marked as won.`],
  [/^Kunden avböjde offert (\S+)(?:: (.+))?$/s, (m) => `The customer declined quote ${m[1]}${m[2] ? `: ${m[2]}` : ''}`],
  [/^Sammanslaget med (.+)$/s, (m) => `Merged with ${m[1]}`],
  [/^Möte bokat i Google Kalender: (.+)$/s, (m) => `Meeting booked in Google Calendar: ${m[1]}`],
  [/^Möte bokat: (.+)$/s, (m) => `Meeting booked: ${m[1]}`],
  [/^Mötet "(.+)" avbokades i Google Kalender$/s, (m) => `Meeting "${m[1]}" was cancelled in Google Calendar`],
  [/^Mötet "(.+)" avbokades$/s, (m) => `Meeting "${m[1]}" was cancelled`],
  [/^Mötet "(.+)" flyttades i Google Kalender till (.+)$/s, (m) => `Meeting "${m[1]}" was moved in Google Calendar to ${m[2]}`],
  [/^Mötet "(.+)" flyttat till (.+)$/s, (m) => `Meeting "${m[1]}" moved to ${m[2]}`],
  [/^(.+): kunden dök inte upp(?:\. (.+))?$/s, (m) => `${m[1]}: the customer didn’t show up${m[2] ? `. ${m[2]}` : ''}`],
  [/^(.+) genomfört$/s, (m) => `${m[1]} completed`],
  [/^Uppgifter hämtade från Bolagsverket: (.+)$/s, (m) => `Details fetched from the company registry: ${m[1]}`],
  [/^Företagsinfo hämtad: (.+)$/s, (m) => `Company info fetched: ${m[1]}`],
  [/^Ej aktuell – inget svar efter (\d+) uppföljningar?$/, (m) => `Not relevant – no reply after ${m[1]} follow-up${m[1] === '1' ? '' : 's'}`],
  [/^Ej aktuell – inget svar$/, () => 'Not relevant – no reply'],
  [/^Inköpsinformation uppdaterad$/, () => 'Purchasing information updated'],
  // Notiser
  [/^Ny lead tilldelad dig: (.+) \((.+)\)$/s, (m) => `New lead assigned to you: ${m[1]} (${src(m[2])})`],
  [/^(.+) har hört av sig igen via (.+)$/s, (m) => `${m[1]} got in touch again via ${src(m[2])}`],
  [/^(.+) tilldelade dig (\d+) leads?$/s, (m) => `${m[1]} assigned you ${m[2]} lead${m[2] === '1' ? '' : 's'}`],
  [/^(.+) tilldelade dig (.+)$/s, (m) => `${m[1]} assigned you ${m[2]}`],
  [/^Möte om (\d+) min: (.+)$/s, (m) => `Meeting in ${m[1]} min: ${m[2]}`],
  [/^Hur gick mötet "(.+)"\? Logga utfallet och boka nästa steg\.$/s, (m) => `How did the meeting "${m[1]}" go? Log the outcome and book the next step.`],
  [/^(.+) bokade ett möte åt dig: (.+)$/s, (m) => `${m[1]} booked a meeting for you: ${m[2]}`],
  [/^(.+) öppnade offerten (\S+) \((.+)\)$/s, (m) => `${m[1] === 'Kunden' ? 'The customer' : m[1]} opened quote ${m[2]} (${m[3]})`],
  [/^🎉 (.+) signerade offerten (\S+) – (.+) är vunnen!$/s, (m) => `🎉 ${m[1]} signed quote ${m[2]} – ${m[3]} is won!`],
  [/^Offerten (\S+) avböjdes(?:: (.+))?$/s, (m) => `Quote ${m[1]} was declined${m[2] ? `: ${m[2]}` : ''}`],
  [/^Sparad sökning "(.+)" hittade (\d+) nya företag att granska$/s, (m) => `Saved search "${m[1]}" found ${m[2]} new companies to review`],
  [/^(.+) gav dig (\d+) nya prospekt att bearbeta$/s, (m) => `${m[1]} gave you ${m[2]} new prospects to work`],
  [/^Välkommen till LeadFlow! Koppla in dina kanaler under Integrationer\.$/, () => 'Welcome to LeadFlow! Connect your channels under Integrations.'],
];

export function translateStored(text) {
  if (current !== 'en' || !text) return text;
  for (const [re, fn] of STORED) { const m = text.match(re); if (m) return fn(m); }
  return text;
}

// I komponenterna heter funktionen `tr` – `t` används redan som variabelnamn på många ställen.
export const tr = t;

/** Byter språk. Returnerar true om sidan laddas om (språket ändrades). */
export function applyLanguage(code, { reload = true } = {}) {
  if (!LANGUAGES.some((l) => l.code === code)) return false;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* inte kritiskt */ }
  if (code === current) return false;
  if (reload) window.location.reload();
  else current = code;
  return true;
}
