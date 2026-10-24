# Publicera LeadFlow på Railway

LeadFlow körs som en vanlig Node-server med databasen (SQLite) på en beständig disk. Räkna med cirka 5–10 USD/månad på Railways Hobby-plan.

## 1. Skapa tjänsten

1. Logga in på [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → välj `CRM-sportative`.
2. Railway känner igen Node-projektet och kör automatiskt `npm run build` (bygger gränssnittet) och `npm start`. Node 22.13 eller senare krävs (anges i `package.json`).

## 2. Lägg till en beständig disk (viktigt)

Utan disk försvinner all data vid varje ny version.

1. I tjänsten: **⋯ / högerklick → Attach Volume** (eller *Settings → Volumes*).
2. **Mount path:** `/data`

## 3. Miljövariabler

Under **Variables** (se även `.env.example`):

| Variabel | Värde |
|---|---|
| `NODE_ENV` | `production` |
| `ADMIN_EMAIL` | din e-postadress – bara den får skapa första administratörskontot |
| `APP_SECRET` | 64 hextecken, skapa med `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DATA_DIR` | `/data` |
| `PUBLIC_URL` | den publika adressen, t.ex. `https://crm.dittforetag.se` (utan `/` på slutet) |

Spara `APP_SECRET` på ett säkert ställe (t.ex. lösenordshanteraren). Byts den ut går sparade integrationslösenord och tokens inte att läsa.

## 4. Adress och https

*Settings → Networking → Generate Domain* ger en `…up.railway.app`-adress direkt. För egen domän: *Custom Domain* och lägg till CNAME-posten hos din domänleverantör. Railway sköter https-certifikatet. Uppdatera `PUBLIC_URL` till den slutliga adressen.

Valfritt: *Settings → Deploy → Healthcheck Path* = `/api/health`.

## 5. Första inloggningen

Öppna adressen. Eftersom databasen är tom visas **Välkommen till LeadFlow** – skapa administratörskontot med e-postadressen i `ADMIN_EMAIL` (lösenord minst 10 tecken). Ingen demodata och inga demokonton skapas i produktion.

Därefter:

1. **Team & behörigheter** → lägg till säljarna.
2. **Produkter & offerter → Offertinställningar** → fyll i era företagsuppgifter och villkor.
3. **Integrationer** → koppla e-post, Facebook, Instagram och webbformulär.

## 6. Uppdatera adresser hos andra tjänster

| Tjänst | Adress att ange |
|---|---|
| Meta (Facebook/Instagram) webhook | `https://<din-adress>/api/webhooks/meta` |
| Google OAuth (kalender) – omdirigerings-URI | `https://<din-adress>/api/calendar/google/callback` |
| Webbformulär och e-postvidarebefordran | de nya adresserna som visas under Integrationer |

## Säkerhetskopior

- En kopia av databasen sparas automatiskt varje dag i `/data/backups` (de senaste 14 behålls).
- **Inställningar → Säkerhetskopior → Ladda ned** ger en färsk kopia att spara utanför Railway – gör det regelbundet.
- Återställning: stoppa tjänsten, ersätt `/data/crm.db` med kopian (t.ex. via `railway ssh`) och starta igen.

## Det här är inställt för produktion

- Ingen demodata; `npm run seed` är spärrat när `NODE_ENV=production`.
- Inloggningscookien är `Secure`, `HttpOnly` och `SameSite=Lax`; servern litar på Railways proxy för https och klientens IP-adress (används för spärren mot lösenordsgissning).
- Säkerhetshuvuden (HSTS, nosniff, referrer-policy, skydd mot inramning).

## Uppdateringar

Varje push till `master` på GitHub driftsätts automatiskt. Databasen ligger kvar på volymen, och nya tabeller och kolumner läggs till automatiskt vid start.
