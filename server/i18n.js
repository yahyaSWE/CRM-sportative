// Översätter felmeddelanden i API-svar till användarens språk. Meddelandena i koden är på svenska;
// språket kommer från den inloggade användaren eller rubriken X-Language (före inloggning).
const EN = {
  'Affären hittades inte': 'Deal not found',
  'Ange en giltig e-postadress': 'Enter a valid email address',
  'Ange en rubrik för mötet': 'Enter a title for the meeting',
  'Ange företagets namn': 'Enter the company name',
  'Ange minst namn, e-post, telefon eller företag': 'Enter at least a name, email, phone or company',
  'Ange namn och e-post': 'Enter name and email',
  'Ange organisationsnummer först': 'Enter an organisation number first',
  'Ange produktens namn': 'Enter the product name',
  'Ange vad du söker efter, t.ex. "tandläkare"': 'Enter what you are looking for, e.g. "dentist"',
  'Ange varför affären förlorades': 'Enter why the deal was lost',
  'Anslutningen misslyckades: {0}': 'Connection failed: {0}',
  'Bolagsverket svarade {0}': 'Bolagsverket responded {0}',
  'Bolagsverket: inloggning misslyckades ({0})': 'Bolagsverket: login failed ({0})',
  'Bolagsverket är inte uppsatt. En administratör lägger in nycklar under Prospektering → Datakällor.': 'Bolagsverket is not set up. An administrator adds keys under Prospecting → Data sources.',
  'Det finns redan ett administratörskonto. Logga in i stället.': 'An administrator account already exists. Log in instead.',
  'Det måste finnas minst en aktiv administratör': 'There must be at least one active administrator',
  'Du behöver godkänna offerten och villkoren': 'You need to accept the quote and the terms',
  'Du kan inte redigera denna affär': 'You can’t edit this deal',
  'Du kan inte redigera detta lead': 'You can’t edit this lead',
  'Du kan inte redigera företaget': 'You can’t edit this company',
  'Du kan inte ändra affären': 'You can’t change this deal',
  'Du kan inte ändra detta möte': 'You can’t change this meeting',
  'Du har inte behörighet att tilldela leads till andra': 'You don’t have permission to assign leads to others',
  'Du saknar behörighet att radera': 'You don’t have permission to delete',
  'Du saknar behörighet att tilldela': 'You don’t have permission to assign',
  'Du saknar behörighet för detta': 'You don’t have permission for this',
  'E-postadressen används redan': 'The email address is already in use',
  'En roll med det namnet finns redan': 'A role with that name already exists',
  'En signerad offert kan inte tas bort': 'A signed quote can’t be deleted',
  'Endast e-postadressen i ADMIN_EMAIL får skapa det första kontot.': 'Only the email address in ADMIN_EMAIL may create the first account.',
  'Ett annat företag har redan det organisationsnumret – slå ihop dem i stället': 'Another company already has that organisation number – merge them instead',
  'Ett oväntat fel inträffade': 'An unexpected error occurred',
  'Fel e-post eller lösenord': 'Wrong email or password',
  'För många försök. Vänta en stund och försök igen.': 'Too many attempts. Wait a while and try again.',
  'Företaget finns redan': 'The company already exists',
  'Företaget hittades inte': 'Company not found',
  'Google Kalender svarade {0}': 'Google Calendar responded {0}',
  'Google Places svarade {0}': 'Google Places responded {0}',
  'Google svarade {0}': 'Google responded {0}',
  'Google gav ingen offline-åtkomst. Ta bort LeadFlow under myaccount.google.com/permissions och försök igen.': 'Google did not grant offline access. Remove LeadFlow under myaccount.google.com/permissions and try again.',
  'Hittades inte': 'Not found',
  'Ingen Facebook/Instagram-integration för sida {0}': 'No Facebook/Instagram integration for page {0}',
  'Inte inloggad': 'Not logged in',
  'Integrationen finns inte': 'The integration does not exist',
  'Lead hittades inte': 'Lead not found',
  'Lägg till minst en produktrad innan du skapar en offert': 'Add at least one product line before creating a quote',
  'Lösenordet måste vara minst 10 tecken': 'The password must be at least 10 characters',
  'Lösenordet måste vara minst 8 tecken': 'The password must be at least 8 characters',
  'Mötet hittades inte': 'Meeting not found',
  'Mötet måste sluta efter att det börjar': 'The meeting must end after it starts',
  'Namn krävs': 'Name is required',
  'Namn och giltig e-post krävs': 'Name and a valid email are required',
  'Namn och minst en åtgärd krävs': 'Name and at least one action are required',
  'Nuvarande lösenord stämmer inte': 'The current password is incorrect',
  'Nytt lösenord måste vara minst 8 tecken': 'The new password must be at least 8 characters',
  'Offerten finns inte': 'The quote does not exist',
  'Offerten finns inte eller har tagits bort': 'The quote does not exist or has been removed',
  'Offerten är redan signerad': 'The quote is already signed',
  'Ogiltig aktivitet': 'Invalid activity',
  'Ogiltig tid': 'Invalid time',
  'Ogiltigt organisationsnummer': 'Invalid organisation number',
  'Ogiltigt utfall': 'Invalid outcome',
  'Okänd endpoint': 'Unknown endpoint',
  'Okänd integrationstyp': 'Unknown integration type',
  'Okänt språk': 'Unknown language',
  'Organisationsnumret finns inte hos Bolagsverket': 'The organisation number does not exist at Bolagsverket',
  'Raden finns inte': 'The line does not exist',
  'Rollen används av användare': 'The role is used by users',
  'Saknar behörighet': 'Permission denied',
  'Saknar behörighet att tilldela': 'No permission to assign',
  'Server, användarnamn och lösenord krävs': 'Server, username and password are required',
  'Sid-ID och sidtoken krävs': 'Page ID and page token are required',
  'Sidans åtkomsttoken saknas': 'The page access token is missing',
  'Systemroller kan inte raderas': 'System roles can’t be deleted',
  'Sätt miljövariabeln ADMIN_EMAIL till din e-postadress och starta om tjänsten.': 'Set the environment variable ADMIN_EMAIL to your email address and restart the service.',
  'Sökningen finns inte': 'The search does not exist',
  'Sökningen misslyckades: {0}': 'The search failed: {0}',
  'Titel krävs': 'Title is required',
  'Välj en produkt eller skriv en rad': 'Choose a product or type a line',
  'Välj en roll': 'Choose a role',
  'Välj ett annat företag att slå ihop med': 'Choose another company to merge with',
  'Välj minst ett företag': 'Choose at least one company',
  'Kopplingen har gått ut – koppla Google Kalender igen': 'The connection has expired – connect Google Calendar again',
  'Google är inte konfigurerat ännu': 'Google is not configured yet',
  'Förfrågan har gått ut. Starta kopplingen igen från Claude.': 'The request has expired. Start the connection again from Claude.',
  'Arbetsytan finns inte': 'The workspace does not exist',
  'Ange namn och text för mallen': 'Enter a name and text for the template',
  'Mallen finns inte': 'The template does not exist',
  'Du kan bara ändra dina egna mallar': 'You can only change your own templates',
  'Ange ett namn på arbetsytan': 'Enter a name for the workspace',
  'Du har inte tillgång till någon arbetsyta': 'You do not have access to any workspace',
  'Kontot finns även i en arbetsyta du inte administrerar. Personen ändrar själv namn, e-post och lösenord.': 'The account also belongs to a workspace you do not administer. The person changes their own name, email and password.',
};

// Meddelanden med inbakade värden ({0}) matchas som mönster; det inbakade värdet översätts också om det går.
const PATTERNS = Object.entries(EN).filter(([k]) => k.includes('{0}')).map(([sv, en]) => ({
  re: new RegExp('^' + sv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{0\\}', '(.+)') + '$', 's'),
  en,
}));

export function translateMessage(msg, lang) {
  if (lang !== 'en' || typeof msg !== 'string') return msg;
  if (EN[msg]) return EN[msg];
  for (const p of PATTERNS) {
    const m = msg.match(p.re);
    if (m) return p.en.replace('{0}', translateMessage(m[1], lang));
  }
  return msg;
}

// Middleware: översätter { error } i alla JSON-svar.
export function translateErrors(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    const lang = req.user?.language || req.get('x-language');
    if (body && typeof body.error === 'string' && lang === 'en') body = { ...body, error: translateMessage(body.error, lang) };
    return json(body);
  };
  next();
}
