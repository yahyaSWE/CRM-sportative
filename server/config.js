// Produktionsläge styrs av NODE_ENV=production (sätts på Railway).
// I produktion skapas aldrig demodata, cookies kräver https och första administratören skapas via en setup-sida.
export const PROD = process.env.NODE_ENV === 'production';

// E-postadressen som får skapa det första administratörskontot. Krävs i produktion.
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase() || null;

// Avbryt tidigt vid felaktig nyckel i stället för att kryptera med en trasig nyckel.
if (process.env.APP_SECRET && !/^[0-9a-fA-F]{64}$/.test(process.env.APP_SECRET)) {
  console.error('APP_SECRET måste vara 64 hexadecimala tecken (32 byte). Skapa en med: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
