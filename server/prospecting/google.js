// Google Places API (New) – Text Search. Officiellt API i stället för att skrapa Google Maps.
// Obs: Googles villkor tillåter att place_id sparas permanent, men övrig platsdata bara tillfälligt (se cleanup i service.js).
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents', 'places.nationalPhoneNumber',
  'places.internationalPhoneNumber', 'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.googleMapsUri',
  'places.primaryTypeDisplayName', 'places.businessStatus', 'nextPageToken',
].join(',');

function toProspect(p) {
  const comp = (type) => p.addressComponents?.find((c) => c.types?.includes(type))?.longText;
  return {
    place_id: p.id,
    name: p.displayName?.text || null,
    category: p.primaryTypeDisplayName?.text || null,
    address: p.formattedAddress || null,
    city: comp('postal_town') || comp('locality') || null,
    phone: p.internationalPhoneNumber || p.nationalPhoneNumber || null,
    website: p.websiteUri || null,
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? null,
    maps_url: p.googleMapsUri || null,
    business_status: p.businessStatus || null,
  };
}

/** Söker upp till `max` företag (Google ger högst 60 per sökning, 20 per sida). */
export async function searchPlaces(apiKey, textQuery, max = 60) {
  const out = [];
  let pageToken;
  do {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify({ textQuery, languageCode: 'sv', regionCode: 'SE', pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error?.message || `Google Places svarade ${res.status}`);
    out.push(...(body.places || []).map(toProspect));
    pageToken = body.nextPageToken;
  } while (pageToken && out.length < max);
  return out.slice(0, max);
}

export async function testKey(apiKey) {
  const r = await searchPlaces(apiKey, 'kafé Stockholm', 1);
  return { ok: true, sample: r[0]?.name };
}

// Exempeldata när ingen API-nyckel finns, så att flödet kan provas. Märks tydligt som demo i gränssnittet.
const DEMO_PREFIX = ['Nord', 'Sjö', 'Berg', 'Ljus', 'Ek', 'Fjäll', 'Strand', 'Älv', 'Gran', 'Lind'];
const DEMO_SUFFIX = ['gruppen', 'partner', 'huset', 'kompaniet', 'service', 'center', 'studion', 'byrån'];
export function demoPlaces(query, location, count = 18) {
  const city = location || query.split(/\s+i\s+|\s+/).pop() || 'Stockholm';
  const cat = query.replace(new RegExp(`\\s*(i\\s+)?${city}\\s*$`, 'i'), '').trim() || 'Företag';
  const seed = [...query].reduce((s, c) => s + c.charCodeAt(0), 0);
  return Array.from({ length: count }, (_, i) => {
    const n = (seed + i * 7) % 97;
    const name = `${DEMO_PREFIX[(seed + i) % DEMO_PREFIX.length]}${DEMO_SUFFIX[(n + i) % DEMO_SUFFIX.length]} ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
    return {
      place_id: `demo-${seed}-${i}`, name, category: cat, city,
      address: `${['Storgatan', 'Kungsgatan', 'Drottninggatan', 'Hamngatan', 'Skolgatan'][i % 5]} ${(n % 40) + 1}, ${city}`,
      phone: `+46 ${10 + (n % 80)} ${100 + n} ${10 + (i % 89)} ${20 + (n % 70)}`,
      website: i % 4 === 3 ? null : `https://www.${name.split(' ')[0].toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o')}.se`,
      rating: Math.round((3.4 + ((n % 16) / 10)) * 10) / 10, reviews: 5 + ((n * 13) % 300),
      maps_url: null, business_status: 'OPERATIONAL', demo: true,
    };
  });
}
