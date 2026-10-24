// Produktionsläge styrs av NODE_ENV=production (sätts av render.yaml).
// I produktion skapas aldrig demodata, cookies kräver https och första administratören skapas via en setup-sida.
export const PROD = process.env.NODE_ENV === 'production';

// E-postadressen som får skapa det första administratörskontot. Krävs i produktion.
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase() || null;

// Antal proxysteg framför appen som får ange klientens IP (X-Forwarded-For). Render dokumenterar inte antalet,
// så det går att justera med TRUST_PROXY – se "Kontrollera klient-IP" i DEPLOY.md. Standard: 1.
export const TRUST_PROXY = PROD ? Math.max(1, Number(process.env.TRUST_PROXY) || 1) : 'loopback';

// APP_SECRET: 64 hextecken eller en slumpad sträng på minst 32 tecken (t.ex. Renders generateValue).
// Avbryt tidigt vid en för kort nyckel i stället för att kryptera med en svag nyckel.
if (process.env.APP_SECRET && !/^[0-9a-fA-F]{64}$/.test(process.env.APP_SECRET) && process.env.APP_SECRET.length < 32) {
  console.error('APP_SECRET är för kort. Använd minst 32 slumpade tecken, t.ex.: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
