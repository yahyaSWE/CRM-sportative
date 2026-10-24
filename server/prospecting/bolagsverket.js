// Bolagsverkets API för värdefulla datamängder (kostnadsfritt, kräver registrerad klient på Bolagsverkets API-portal).
// API:t slår upp ett känt organisationsnummer – det går inte att söka på bransch eller ort.
const ENV = {
  prod: { api: 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1', token: 'https://portal.api.bolagsverket.se/oauth2/token' },
  test: { api: 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1', token: 'https://portal-accept2.api.bolagsverket.se/oauth2/token' },
};
const SCOPE = 'vardefulla-datamangder:read vardefulla-datamangder:ping';
let cached = { key: null, token: null, exp: 0 };

async function token(cfg) {
  const env = ENV[cfg.bvEnv === 'test' ? 'test' : 'prod'];
  const key = `${cfg.bvEnv}:${cfg.bvClientId}`;
  if (cached.key === key && cached.exp > Date.now() + 30000) return cached.token;
  const res = await fetch(env.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.bvClientId, client_secret: cfg.bvClientSecret, scope: SCOPE }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(body.error_description || body.error || `Bolagsverket: inloggning misslyckades (${res.status})`);
  cached = { key, token: body.access_token, exp: Date.now() + (body.expires_in || 3600) * 1000 };
  return cached.token;
}

export async function ping(cfg) {
  const env = ENV[cfg.bvEnv === 'test' ? 'test' : 'prod'];
  const res = await fetch(`${env.api}/isalive`, { headers: { Authorization: `Bearer ${await token(cfg)}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Bolagsverket svarade ${res.status}`);
  return { ok: true };
}

// Plockar ut fält defensivt – svaret är djupt nästlat och kan variera mellan versioner.
const first = (...vals) => vals.find((v) => v != null && v !== '');
function parseOrganisation(o) {
  if (!o) return null;
  const name = first(o.organisationsnamn?.organisationsnamnLista?.[0]?.namn, o.organisationsnamn?.namn, typeof o.organisationsnamn === 'string' ? o.organisationsnamn : null);
  const addr = first(o.postadressOrganisation?.postadress, o.postadress, {}) || {};
  const sni = (first(o.naringsgrenOrganisation?.sni, o.sni, []) || []).filter((s) => s?.kod).map((s) => ({ kod: s.kod, text: s.klartext || s.beskrivning || '' }));
  return {
    name: name || null,
    form: first(o.organisationsform?.klartext, o.juridiskForm?.klartext) || null,
    registered: first(o.organisationsdatum?.registreringsdatum, o.registreringsdatum) || null,
    deregistered: !!first(o.avregistreradOrganisation?.avregistreringsdatum, o.avregistreringsdatum),
    address: [first(addr.utdelningsadress, addr.adress), [addr.postnummer, addr.postort].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null,
    city: addr.postort || null,
    sni,
    description: first(o.verksamhetsbeskrivning?.beskrivning, o.verksamhetsbeskrivning) || null,
  };
}

export async function lookupOrganisation(cfg, orgNr) {
  const env = ENV[cfg.bvEnv === 'test' ? 'test' : 'prod'];
  const res = await fetch(`${env.api}/organisationer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${await token(cfg)}` },
    body: JSON.stringify({ identitetsbeteckning: orgNr.replace(/\D/g, '') }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || body.title || `Bolagsverket svarade ${res.status}`);
  return parseOrganisation(body.organisationer?.[0] || body);
}

// Kontrollerar organisationsnummer: 10 siffror, tredje siffran ≥ 2 och korrekt kontrollsiffra (Luhn).
export function validOrgNr(s) {
  const d = String(s).replace(/\D/g, '');
  if (d.length !== 10 || Number(d[2]) < 2) return false;
  const sum = [...d].reduce((acc, ch, i) => { let n = Number(ch) * (i % 2 === 0 ? 2 : 1); if (n > 9) n -= 9; return acc + n; }, 0);
  return sum % 10 === 0;
}
export const formatOrgNr = (s) => { const d = String(s).replace(/\D/g, ''); return `${d.slice(0, 6)}-${d.slice(6)}`; };
