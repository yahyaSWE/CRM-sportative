# Publicera LeadFlow på Render

LeadFlow körs som en vanlig Node-server med databasen (SQLite) på en beständig disk. Repot innehåller en Render Blueprint, [`render.yaml`](render.yaml), som sätter upp allt utom två värden du fyller i själv.

**Kostnad:** diskar kräver en betald instans – den minsta (0,5 CPU / 512 MB) plus 1 GB disk. Gratisinstanser fungerar inte: de saknar disk (all data försvinner) och somnar vid inaktivitet, vilket stoppar e-posthämtning och påminnelser.

## 1. Skapa tjänsten från Blueprinten

1. Logga in på [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint**.
2. Koppla GitHub och välj repot `CRM-sportative`. Render läser `render.yaml`.
3. Fyll i värdena Render frågar efter:
   - `ADMIN_EMAIL` – din e-postadress (bara den får skapa första administratörskontot)
   - `PUBLIC_URL` – adressen tjänsten får, t.ex. `https://leadflow-crm.onrender.com` (utan `/` på slutet). Byt senare om du kopplar egen domän.
4. **Apply**. Render bygger (`npm ci && npm run build`) och startar (`npm start`).

Blueprinten ställer in:

| Inställning | Värde |
|---|---|
| Region | Frankfurt |
| Disk | 1 GB monterad på `/var/data` (kan utökas, inte minskas) |
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` (krävs för den inbyggda SQLite-databasen) |
| `DATA_DIR` | `/var/data` |
| `APP_SECRET` | genereras automatiskt av Render |
| Health check | `/api/health` |
| Automatisk driftsättning | vid varje push till GitHub |

> **Spara `APP_SECRET`:** öppna tjänsten → *Environment* → kopiera värdet till din lösenordshanterare. Om det ändras går sparade integrationslösenord och tokens inte att läsa.

## 2. Första inloggningen

Öppna adressen. Databasen är tom, så **Välkommen till LeadFlow** visas – skapa administratörskontot med e-postadressen i `ADMIN_EMAIL` (lösenord minst 10 tecken). Ingen demodata och inga demokonton skapas i produktion.

Därefter:

1. **Team & behörigheter** → lägg till säljarna.
2. **Produkter & offerter → Offertinställningar** → fyll i era företagsuppgifter och villkor.
3. **Integrationer** → koppla e-post, Facebook, Instagram och webbformulär.

## 3. Egen domän (valfritt)

Tjänsten → *Settings → Custom Domains* → lägg till t.ex. `crm.dittforetag.se` och skapa CNAME-posten hos din domänleverantör. Render ordnar https-certifikatet. Uppdatera sedan `PUBLIC_URL` under *Environment*.

## 4. Uppdatera adresser hos andra tjänster

| Tjänst | Adress att ange |
|---|---|
| Meta (Facebook/Instagram) webhook | `https://<din-adress>/api/webhooks/meta` |
| Google OAuth (kalender) – omdirigerings-URI | `https://<din-adress>/api/calendar/google/callback` |
| Webbformulär och e-postvidarebefordran | de nya adresserna som visas under Integrationer |

## 5. Kontrollera klient-IP (rekommenderas)

Kundens IP-adress används i spärren mot lösenordsgissning och i signaturbeviset på offerter. Render dokumenterar inte hur många proxysteg som ligger framför appen, så kontrollera en gång:

1. Öppna `https://<din-adress>/api/health?ip=1` i webbläsaren.
2. Jämför `ip` med din egen IP-adress (sök "vad är min ip").
3. Stämmer den inte: se `forwardedFor`-listan, räkna din adress plats från höger (sista = 1) och sätt `TRUST_PROXY` till den siffran under *Environment*. Ladda om och kontrollera igen.

## Säkerhetskopior

- Appen sparar varje dag en konsistent kopia av databasen i `/var/data/backups` (de senaste 14 behålls).
- **Inställningar → Säkerhetskopior → Ladda ned** ger en färsk kopia att spara utanför Render – gör det regelbundet.
- Render tar även egna ögonblicksbilder av disken dagligen (sparas 7 dagar), men Render avråder från att återställa databaser från dem – använd hellre appens kopior.
- Återställning: tjänsten → *Shell* → ersätt `/var/data/crm.db` med en kopia från `/var/data/backups` och starta om tjänsten.

## Bra att veta

- **Kort avbrott vid uppdatering:** med disk stoppar Render den gamla versionen innan den nya startar, så appen är nere några sekunder vid varje driftsättning.
- **En instans:** en tjänst med disk kan inte skalas till flera instanser. Behövs mer kraft väljer du en större instanstyp.
- **Säkerhet i produktion:** ingen demodata (`npm run seed` är spärrat), inloggningscookien är `Secure`, `HttpOnly` och `SameSite=Lax`, och säkerhetshuvuden (HSTS, nosniff, referrer-policy, skydd mot inramning) skickas.
- **Uppdateringar:** varje push till `master` driftsätts automatiskt. Databasen ligger kvar på disken och nya tabeller och kolumner läggs till automatiskt vid start.
