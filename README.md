# LeadFlow CRM

Ett modernt CRM byggt kring **automatisk leadinsamling** från e-post, Facebook och Instagram, med team, roller och behörigheter.

## Kom igång

```bash
npm install
npm run dev        # API på :4000 + gränssnitt på http://localhost:5173
```

Första gången skapas en databas (`data/crm.db`) med demodata. Demokonton (lösenord `Demo1234!`):

| Roll | E-post |
|---|---|
| Administratör | admin@leadflow.se |
| Säljchef | sofia@leadflow.se |
| Säljare | marcus@leadflow.se / emma@leadflow.se |
| Läsbehörighet | ali@leadflow.se |

`npm run seed` återställer demodatan (bara i utvecklingsläge).

**Publicera:** se [DEPLOY.md](DEPLOY.md) för Railway. I produktion (`NODE_ENV=production`) skapas ingen demodata – första administratören skapas via en setup-sida av e-postadressen i `ADMIN_EMAIL`.

## Analys: vad de ledande CRM-tjänsterna gör

| Funktion | HubSpot | Pipedrive | Salesforce | Zoho CRM | LeadFlow |
|---|---|---|---|---|---|
| Leads från Facebook/Instagram Lead Ads | ✓ (Marketing Hub) | ✓ (LeadBooster/integration) | ✓ (via AppExchange) | ✓ | ✓ inbyggt |
| Instagram/Messenger-DM som leads | ✓ (Inbox) | – | Tillägg | ✓ (Social) | ✓ |
| E-postinkorg → leads | ✓ | ✓ (Smart BCC/inkorg) | ✓ | ✓ | ✓ IMAP + vidarebefordran |
| Webbformulär/API | ✓ | ✓ (Web Forms) | ✓ (Web-to-Lead) | ✓ | ✓ |
| Automatisk fördelning (round-robin) | ✓ (betalnivå) | ✓ | ✓ | ✓ | ✓ |
| Leadpoäng | ✓ | ✓ | ✓ (Einstein) | ✓ | ✓ regelbaserad |
| Dubblettkontroll | ✓ | ✓ | ✓ | ✓ | ✓ e-post/telefon/externt id |
| Kanban-pipeline | ✓ | ✓ (kärnfunktion) | ✓ | ✓ | ✓ dra-och-släpp |
| Roller & behörigheter | ✓ | ✓ | ✓ (mycket detaljerat) | ✓ | ✓ egna roller, behörighetsmatris |
| Aktivitetslogg/revision | ✓ | ✓ | ✓ | ✓ | ✓ |
| Realtidsnotiser | ✓ | ✓ | ✓ | ✓ | ✓ (Server-Sent Events) |

Gemensamt mönster som LeadFlow följer: **alla kanaler matas in i en och samma pipeline** → normalisering → dubblettkontroll → poäng → regler (fördela/tagga/skapa uppgift) → notis till ansvarig säljare.

## Säljarens vardag

- **Min dag** (startsidan): dagens möten, möten utan utfall, försenade och dagens uppgifter, nya leads att ringa, affärer utan nästa steg och leads som behöver följas upp – med Ring-knappar direkt i listan. Diagrammen finns under **Översikt**.
- **Sök (Ctrl + K)**: hittar kunder, leads och affärer på namn, företag, telefon (oavsett format: 070…, +4670…), e-post och domän, ort, org.nr, kampanj och taggar. Affärer hittas även via kontaktperson. Enter visar alla resultat.
- **Kunder**: alla kontakter med vunna affärer, med vunnet och pågående värde, nästa steg och "Mina kunder".
- **Leads**: snabbflikarna *Nya att ringa*, *Behöver uppföljning* (kontaktade utan uppgift eller bokat möte) och *Kunder*, samt kolumnen *Nästa steg* med senaste kontakt.
- **Pipeline**: sökruta och listvy (sorterbar, med äldre avslutade affärer). Tavlan visar avslutade affärer från de senaste 30 dagarna.

## Företag och kontaktpersoner

- **Företag** samlar alla kontaktpersoner (VD, inköpare, ekonomi …), affärer och en gemensam tidslinje för organisationen. Flikar: Alla, Kunder, Med öppna affärer, Prospekt.
- Leads kopplas automatiskt till rätt företag via org.nr, företagets e-postdomän (inte Gmail/Hotmail m.fl.) eller namnet ("Nordlys AB" = "nordlys aktiebolag"). Kopplingen kan ändras i leadet.
- Dubbletter slås ihop från företagspanelen. Med Bolagsverket-nycklar kan adress och bransch hämtas via org.nr.

## Produkter, offerter och e-signering

1. Administratören lägger in produkter (pris, enhet, moms, engång/per månad/per år) och era företagsuppgifter och standardvillkor under **Produkter & offerter**.
2. På en affär, fliken **Produkter & offert**: lägg till produkter eller fria rader, ändra antal, pris och rabatt. Affärens värde följer summan exkl. moms.
3. **Skapa offert** → välj mottagare och giltighetstid → **Mejla kunden** eller kopiera länken. Affären flyttas till *Offert skickad*.
4. Kunden öppnar länken (säljaren får en notis), läser offerten och signerar genom att rita sin signatur och godkänna villkoren – eller tackar nej med en kommentar.
5. Vid signering markeras affären som vunnen och kontakten som kund. *Signaturbevis* visar namn, e-post, tid, IP-adress och en kontrollsumma av offerten.

Signaturen är en enkel elektronisk underskrift. För avancerad underskrift med BankID behöver en tjänst som Scrive, Oneflow eller Signicat kopplas in. Kunden kan skriva ut eller spara offerten som PDF via webbläsaren.

## Från lead till affär

1. **Lead** (personen/förfrågan) kommer in automatiskt och kvalificeras: Ny → Kontaktad → Kvalificerad.
2. **Konvertera till affär** skapar en affär i pipelinen, gärna med en första uppgift (t.ex. ”Boka första mötet”).
3. **Affären** drivs i pipelinen. Klick på ett kort öppnar affärsvyn med stegrad, värde, nästa steg, kontaktuppgifter och ursprunglig förfrågan.
4. **Gemensam tidslinje:** anteckningar, samtal och uppgifter syns både på leadet och i affären (märkta med affärens namn).
5. **Avslut:** Förlorad kräver en orsak (sammanställs på Översikten per kanal). Vunnen märker kontakten som *Kund*.

Korten i pipelinen varnar när en affär saknar nästa steg, har en försenad uppgift eller stått still i 14+ dagar.

## Kalender och Google Kalender

- **Kalender** (vecka/månad) visar dina möten; säljchefer kan se hela teamet. Klicka i en tom ruta för att boka.
- **Boka möte** finns på leads och affärer: kunden blir deltagare, mötet loggas på tidslinjen och en affär i *Kvalificerad* flyttas till *Möte bokat*.
- Påminnelse som notis 15 minuter innan. Efter mötet: "Hur gick det?" – utfallet loggas och nästa steg blir en uppgift.

**Full tvåvägssynk med Google Kalender** (rekommenderat):

1. Admin: Google Cloud Console → aktivera *Google Calendar API* → OAuth-medgivandeskärm (*Intern* för Google Workspace) → skapa *OAuth-klient-id* av typen Webbapplikation med omdirigerings-URI:n som visas i appen (`<PUBLIC_URL>/api/calendar/google/callback`).
2. Admin: Kalender → kugghjulet vid Google Kalender → klistra in klient-id och hemlighet.
3. Varje säljare: Kalender → **Koppla Google Kalender**.

Möten bokade i LeadFlow skapas i Google (valfritt med Meet-länk och inbjudan till kunden). Möten bokade, flyttade eller avbokade i Google hämtas varje minut; har en deltagare samma e-post som ett lead kopplas mötet automatiskt till kunden.

**iCal-prenumeration** (reserv, bara läsning): varje användare har en personlig länk under Kalender som kan läggas till i Google, Outlook eller Apple Kalender. Kalenderappen hämtar ändringar med fördröjning.

## Prospektering (kalla leads)

Under **Prospektering** söker du företag efter bransch och ort, granskar listan och importerar de du vill bearbeta.

1. **Hitta:** Google Places API (New) – samma data som Google Maps via officiellt API (max 60 träffar per sökning). Filter för betyg, antal omdömen, telefon/hemsida och uteslutna namn.
2. **Berika:** företagets hemsida läses varsamt (startsida + kontaktsida, respekterar robots.txt) för e-post och org.nr. Har du Bolagsverket-nycklar verifieras bolaget (bolagsform, SNI, avregistrering).
3. **Granska:** företag som redan finns i CRM:et flaggas (e-post, telefon, org.nr, domän eller namn). Avvisade dyker inte upp igen.
4. **Importera:** blir leads med källan *Prospektering*, taggen *Kall lead* och lägre startpoäng. Fördelas via automatiseringsregler eller till vald säljare.
5. **Bevaka:** en sökning kan köras automatiskt varje vecka; nya träffar hamnar i granskningslistan och du får en notis.

Utan Google-nyckel körs **demoläge** med påhittade exempelföretag. Nycklar läggs in under *Prospektering → Datakällor* (kräver behörigheten Hantera integrationer).

- Allabolag och Google Maps tillåter inte skrapning, därför används officiella API:er.
- Googles villkor: platsdata får inte lagras permanent – ej importerade prospekt rensas efter 30 dagar (place_id sparas så att de inte visas igen).
- Bolagsverkets kostnadsfria API slår bara upp ett känt org.nr; det går inte att söka på bransch/ort. Endpoints är implementerade efter API:ts publicerade struktur men inte verifierade mot ett riktigt konto – testa med *Spara och testa*.
- GDPR: enskilda firmor och namngivna personer är personuppgifter. Informera om källan vid första kontakt och respektera nej tack.

## Koppla in kanaler (Integrationer i appen)

Alla inställningar görs under **Integrationer**. Lösenord och tokens lagras krypterat (AES-256-GCM). Knappen **Testlead** skickar en låtsaslead genom hela flödet så att du kan se hur det fungerar innan riktiga konton är kopplade.

### E-post
- **IMAP** (rekommenderat): ange server, e-post och lösenord. Inkorgen kontrolleras automatiskt (standard varannan minut). Gmail kräver ett *app-lösenord*. Mejl från kontaktformulär (”Namn: … / E-post: …”) tolkas automatiskt, autosvar filtreras bort.
- **Vidarebefordran**: peka Mailgun, SendGrid Inbound Parse, Postmark eller CloudMailin mot den unika webhook-adressen.

### Facebook & Instagram (Meta)
1. Skapa en Meta-app (typ Business) och lägg till **Webhooks** (+ Messenger / Instagram).
2. Prenumerera på `leadgen` (Lead Ads) och `messages` för sidan/Instagram-kontot med callback-URL `https://<din-domän>/api/webhooks/meta` och verifieringstoken från appen.
3. Skapa en långlivad sidåtkomsttoken med `leads_retrieval`, `pages_manage_metadata`, `pages_show_list` (+ `pages_messaging` / `instagram_basic`, `instagram_manage_messages`).
4. Klistra in sid-ID, token och App Secret. **Testa anslutning**.

Webhooks verifieras med `X-Hub-Signature-256`. Lead Ads från Instagram känns igen via fältet `platform` och sorteras som Instagram-leads. Reservhämtning läser formulärens leads var 15:e minut ifall en webhook missas.

Meta kräver en publik https-adress. Lokalt kan du använda t.ex. ngrok och sätta `PUBLIC_URL=https://xxxx.ngrok.app` så visas rätt adresser i appen.

### Webbformulär / Zapier
POST:a formulärdata eller JSON till formulärets adress. Fält som `namn`, `epost`, `telefon`, `foretag`, `meddelande` (eller engelska motsvarigheter) känns igen; övriga fält sparas som formulärsvar. Ett dolt fält `_gotcha` fungerar som spamskydd.

## Behörigheter

| Behörighet | Admin | Säljchef | Säljare | Läs |
|---|:-:|:-:|:-:|:-:|
| Se alla leads | ✓ | ✓ | – (egna + otilldelade) | ✓ |
| Redigera egna / alla | ✓/✓ | ✓/✓ | ✓/– | –/– |
| Tilldela, radera, exportera | ✓ | tilldela, exportera | – | – |
| Rapporter | ✓ | ✓ | – (egen statistik) | ✓ |
| Integrationer, användare | ✓ | – | – | – |
| Automatiseringar, logg | ✓ | ✓ | – | – |

Administratörer kan skapa egna roller och ändra behörighetsmatrisen under **Team & behörigheter**.

## Teknik

- **Server:** Node.js 22+ (inbyggd `node:sqlite`), Express, ImapFlow/Mailparser. Ingen extern databas krävs.
- **Klient:** React 19, Vite, Tailwind CSS 4, Recharts, Lucide.
- Struktur: `server/` (API, integrationer, lead-pipeline i `services/leads.js`) och `client/` (gränssnitt).

| Miljövariabel | Beskrivning |
|---|---|
| `API_PORT` / `PORT` | Port för API:t (dev: 4000) / produktionsport med `npm start` |
| `PUBLIC_URL` | Publik adress som visas för webhooks |
| `APP_SECRET` | 64 hex-tecken; annars genereras `data/secret.key` |
| `DATA_DIR` | Var databasen lagras |
