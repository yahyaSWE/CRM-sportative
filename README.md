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

**Publicera:** se [DEPLOY.md](DEPLOY.md) för Render (`render.yaml` finns i repot). I produktion (`NODE_ENV=production`) skapas ingen demodata – första administratören skapas via en setup-sida av e-postadressen i `ADMIN_EMAIL`.

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

- **Min dag** (startsidan): dagens möten, möten utan utfall, försenade och dagens uppgifter, nya leads att ringa, affärer utan nästa steg och leads att kontakta igen – med Ring-knappar direkt i listan. Diagrammen finns under **Översikt**.
- **Sök (Ctrl + K)**: hittar kunder, leads och affärer på namn, företag, telefon (oavsett format: 070…, +4670…), e-post och domän, ort, org.nr, kampanj och taggar. Affärer hittas även via kontaktperson. Enter visar alla resultat.
- **Kunder**: alla kontakter med vunna affärer, med vunnet och pågående värde, nästa steg och "Mina kunder".
- **Leads**: snabbflikarna *Nya att ringa*, *Kontakta igen*, *Kunder* och *Arkiv*, samt kolumnen *Nästa steg* med senaste kontakt. Leads med status *Ej aktuell* ligger i **Arkiv** – de syns inte under *Alla* men hittas i sökningen (märkta *Arkiverad*). Byt status för att plocka tillbaka ett lead.
- **Utfall på samtal och mejl**: när du loggar ett samtal väljer du *Svarade* eller *Inget svar*; mejl står som *Inväntar svar* tills du klickar på märkningen i tidslinjen och ändrar till *Svarade*. I uppföljningsrutan finns *Fick svar*.
- **Kontaktresultat** (Översikt): tratten *Kontaktade → Svarade → Kvalificerade* för vald period, svarsfrekvens per kanal (telefon/mejl) och – för chefer – per säljare. Leads som kvalificerats eller fått en affär räknas som svarade.
- **Uppföljningsrytm**: när ett lead är *Kontaktat* och inte svarar dyker det upp under *Kontakta igen* efter valt antal dagar (Inställningar → Uppföljning av kontaktade leads, t.ex. 3 dagar och 2 uppföljningar). Varje loggat samtal, mejl eller möte räknas som ett försök och startar om klockan – i leadet finns snabbknapparna *Ringt, inget svar*, *Mejlat igen* och *Ej aktuell*. När uppföljningarna är slut utan svar markeras leadet automatiskt *Ej aktuell* (går att stänga av). Leads med öppen uppgift eller bokat möte har redan ett nästa steg och räknas inte.
- **Pipeline**: sökruta och listvy (sorterbar, med äldre avslutade affärer). Tavlan visar avslutade affärer från de senaste 30 dagarna.

## Mallar

Under **Mallar** sparar teamet texter som används ofta: **e-post** (ämnesrad och text), **meddelanden** (SMS, LinkedIn) och **samtalsmanus**. Alla i arbetsytan kan använda mallarna; den som har rätt att skapa leads kan skapa egna, och säljchefer och administratörer kan ändra alla.

- **Kopiera** text eller ämnesrad med ett klick direkt från fliken. *Duplicera* gör en egen variant.
- **Fält** som `{förnamn}`, `{företag}`, `{min_namn}` och `{mitt_företag}` infogas med knapparna under texten.
- **Från ett lead:** knappen *Mall* fyller i fälten med kontaktens och dina uppgifter. Sedan kopierar du, öppnar mejlet i ditt e-postprogram eller loggar det direkt i tidslinjen. Fält som saknar värde markeras innan du skickar.
- De mest använda mallarna visas först. Claude kan också läsa mallarna via MCP-kopplingen.

### Skicka e-post från appen (Gmail)

Säljare med Google Workspace eller Gmail kopplar sin brevlåda under **Inställningar → E-post → Koppla Gmail** (samma Google-koppling som kalendern). Därefter öppnar **Mejla** och **Mall** på ett lead en skriv-ruta där mallen fylls i och allt går att redigera innan man klickar **Skicka**.

- Mejlet skickas från säljarens egen adress och hamnar i hens Skickat-mapp; svar kommer till den vanliga inkorgen.
- Det loggas automatiskt i tidslinjen (med ämne och text), leadet markeras som *Kontaktad* och utskicket syns i aktivitetsloggen.
- Utan kopplad Gmail fungerar *Kopiera* och *Öppna i e-post* som tidigare.
- Appen begär bara rätten att **skicka** e-post (gmail.send) – den kan inte läsa säljarens inkorg. Högst 100 mejl per säljare och timme.

## Företag och kontaktpersoner

- **Företag** samlar alla kontaktpersoner (VD, inköpare, ekonomi …), affärer och en gemensam tidslinje för organisationen. Flikar: Alla, Kunder, Med öppna affärer, Prospekt.
- Leads kopplas automatiskt till rätt företag via org.nr, företagets e-postdomän (inte Gmail/Hotmail m.fl.) eller namnet ("Nordlys AB" = "nordlys aktiebolag"). Kopplingen kan ändras i leadet.
- Dubbletter slås ihop från företagspanelen. Med Bolagsverket-nycklar kan adress och bransch hämtas via org.nr.
- **Inköpsinformation** (på företaget/föreningen och i leadets flik *Företagsinfo*): beslutsfattare och materialansvarig (välj bland kontaktpersonerna eller skriv fritt), befintlig leverantör, avtalsutgång, nästa inköp med vad som ska köpas, och en anteckning. Datum som närmar sig markeras, och **Min dag** visar *Avtal och inköp på gång* (från en vecka sedan till 45 dagar framåt) för dina företag. Mejlutkastet och Claude (verktygen `get_company` och `update_purchasing_info`) använder uppgifterna.

## Produkter, offerter och e-signering

1. Administratören lägger in produkter (pris, enhet, moms, engång/per månad/per år) och era företagsuppgifter och standardvillkor under **Produkter & offerter**.
2. På en affär, fliken **Produkter & offert**: lägg till produkter eller fria rader, ändra antal, pris och rabatt. Affärens värde följer summan exkl. moms.
3. **Skapa offert** → välj mottagare och giltighetstid → **Mejla kunden** eller kopiera länken. Affären flyttas till *Offert skickad*.
4. Kunden öppnar länken (säljaren får en notis), läser offerten och signerar genom att rita sin signatur och godkänna villkoren – eller tackar nej med en kommentar.
5. Vid signering markeras affären som vunnen och kontakten som kund. *Signaturbevis* visar namn, e-post, tid, IP-adress och en kontrollsumma av offerten.

Signaturen är en enkel elektronisk underskrift. För avancerad underskrift med BankID behöver en tjänst som Scrive, Oneflow eller Signicat kopplas in. 

**Offertens utseende och PDF:** under *Produkter & offerter → Offertinställningar* (eller *Inställningar → Offerter*) fyller ni i företagsuppgifter och villkor, laddar upp er **logga** (PNG, JPG, SVG eller WebP – den skalas och sparas automatiskt), väljer **accentfärg** och skriver en **sidfot** (t.ex. bankgiro, momsreg.nr och F-skatt). Loggan, färgen och sidfoten används på kundens offertsida och i PDF:en. Varje offert har knappen **PDF** för att ladda ned en A4-PDF att bifoga i ett eget mejl, och kunden kan ladda ned samma PDF från offertsidan. En signerad offert får signaturen, namnet, tidpunkten och kontrollsumman med i PDF:en.

## Arbetsytor (flera bolag)

Har du flera bolag eller varumärken får varje bolag en egen **arbetsyta** med helt egna kunder, leads, affärer, produkter, offertinställningar, integrationer (egna e-post-, Facebook- och Instagramkopplingar, formuläradresser), Google-kalenderkopplingar, automatiseringar, roller och aktivitetslogg. Inget delas mellan arbetsytorna.

- **Byta:** klicka på arbetsytans namn högst upp i sidomenyn och välj bolag. Appen kommer ihåg ditt senaste val.
- **Skapa:** samma meny → *Ny arbetsyta* (kräver att du hanterar användare). Du blir administratör i den nya arbetsytan.
- **Bjuda in:** under *Team & behörigheter* i respektive arbetsyta. Har personen redan ett konto i en annan arbetsyta läggs kontot till med sitt befintliga lösenord – samma inloggning, men egen roll per arbetsyta. Att inaktivera någon gäller bara den arbetsytan.
- **Konton:** namn, e-post, lösenord och språk hör till kontot. En administratör kan bara ändra dem för personer som enbart finns i arbetsytor där hen själv är administratör.
- **Claude:** en koppling kan nå flera arbetsytor – du kryssar i vilka när du godkänner den (se nedan).

Tekniskt har varje arbetsyta en egen databasfil (`data/workspaces/ws-<id>.db`; den ursprungliga `crm.db` blir arbetsyta 1), och en gemensam `accounts.db` håller konton, medlemskap och AI-kopplingar. En befintlig installation flyttas över automatiskt vid första start.

## Språk

Varje användare väljer **svenska eller engelska** under *Inställningar → Språk*. Valet sparas på kontot och gäller på alla enheter. Innan inloggning går språket att välja uppe till höger på inloggningssidan.

- Gränssnittet, datum och belopp, serverns felmeddelanden, tidslinjens systemhändelser och notiser visas på valt språk.
- Det användarna själva skriver (anteckningar, uppgifter, företagsnamn) och data från kanalerna visas som det skrevs.
- Kundens offertsida är på svenska oavsett säljarens språk.

För utvecklare: texterna i koden är svenska och fungerar som nycklar – omslut nya texter med `tr("…")` (från `client/src/lib/i18n.js`) och lägg till översättningen i `client/src/lib/i18n.en.js`. I utvecklingsläge varnar konsolen för texter som saknar engelsk översättning.

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

## Berika företag (AI-sammanfattning)

Knappen **Berika** på ett lead (eller i företagets vy) tar fram en kort bild av bolaget inför första kontakten. Inget hämtas automatiskt – bara när någon klickar.

1. Organisationsnummer och hemsida letas fram från företaget och dess kontakter (fält, meddelande och e-postdomän).
2. Uppgifter hämtas från **Bolagsverket** (om nycklarna finns under Prospektering → Datakällor) och från företagets **hemsida** (startsidan och en "om oss"-sida; robots.txt respekteras).
3. En AI-modell via **OpenRouter** sammanfattar: vad bolaget gör, bransch, erbjudande, kunder, storlek, något aktuellt, en **säljvinkel** utifrån era produkter och en **inledningsfras** att kopiera.

Resultatet sparas på **företaget** och visas i fliken **Företagsinfo** på alla dess kontakter, med källor och datum; *Uppdatera* hämtar på nytt. Tomma fält på företaget (bransch, hemsida, org.nr, ort) fylls i.

`**Inställning:** en administratör lägger in en API-nyckel från [openrouter.ai/keys](https://openrouter.ai/keys) under **Inställningar → AI-berikning** (per arbetsyta, eller för alla via miljövariabeln `OPENROUTER_API_KEY`). Standardmodellen är *Claude Haiku 5.5* (`anthropic/claude-haiku-5.5`) – bra på svenska och kostar ungefär en hundradels krona per berikning; modellen går att byta.
`
`**Vårt erbjudande:** under **Inställningar → Vårt erbjudande** beskriver ni per arbetsyta vad ni säljer – vad ni gör, målgrupp, problem ni löser, varför er, referenser, målet med första kontakten och tonläge. Knappen *Fyll i från vår hemsida* låter AI:n föreslå texterna. Erbjudandet styr säljvinkeln i berikningen och används av Claude (verktyget `get_our_offer`) när Claude skriver säljtexter.

**Skriv första mejlet:** i fliken Företagsinfo skriver AI:n ett kort, personligt första mejl utifrån erbjudandet, företagsinfon, kontaktens roll och tidigare kontakt. Utkastet öppnas i skriv-rutan där du redigerar och sedan skickar (Gmail), kopierar eller loggar det.

**Via Claude:** med Claude-kopplingen kan du i stället säga "berika Hagab Industri" – Claude söker själv på webben och sparar sammanfattningen med verktyget `save_company_summary`. Det kostar inget extra utöver Claude.

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

## Claude och AI-assistenter (MCP)

LeadFlow har en inbyggd MCP-server, så att Claude (webben, skrivbordsappen, mobilen och Claude Code) kan arbeta i CRM:et åt dig.

**Koppla in:** I Claude → *Inställningar → Connectors → Lägg till anpassad connector* och ange `https://<din-adress>/mcp` (adressen finns att kopiera under *Inställningar* i LeadFlow). Claude skickar dig till LeadFlow, där du loggar in och godkänner kopplingen. För Claude Code: `claude mcp add --transport http leadflow https://<din-adress>/mcp` och sedan `/mcp` för att logga in.

**Vad Claude kan göra:**

| Läsa | Skriva |
|---|---|
| Söka kunder, kontakter och affärer | Skapa och uppdatera leads |
| Min dag: möten, uppgifter, nya leads, affärer som står still | Logga samtal, anteckningar, mejl och möten |
| Visa lead, företag och affär med hela tidslinjen | Skapa och klarmarkera uppgifter |
| Pipeline per steg med affärer som står still | Skapa affärer (från lead eller företag) och flytta steg, med förlustorsak |
| Översikt och statistik, uppgifter, möten, produkter, teamet | Boka möten (synkas till Google Kalender), lägga till produkter och skapa offerter |

Det finns inga verktyg för att radera.

**Flera bolag:** har du flera arbetsytor kryssar du vid godkännandet i vilka kopplingen ska nå (förvalt: alla där din roll får koppla AI). Den arbetsyta du stod i blir standard. Varje verktyg tar då ett valfritt *workspace* (bolagets namn eller id), verktyget `list_workspaces` visar bolagen och din roll i varje, och varje svar börjar med vilket bolag det gäller. Säg t.ex. "visa pipelinen för Sportative" eller "jämför veckans nya leads i alla bolag". Länkar från Claude öppnar rätt arbetsyta i appen. En administratör som kopplar bort någon annans koppling tar bara bort sin egen arbetsyta ur den.

**Säkerhet:** Inloggningen sker med OAuth 2.1 och PKCE; Claude får aldrig ditt lösenord. Claude har exakt samma behörigheter som din roll – en säljare med läsbehörighet får bara läsverktygen, och en säljare ser bara det den får se i appen. Allt som görs märks *via Claude* i tidslinjen och i aktivitetsloggen. Du kopplar bort under *Inställningar → Claude och AI-assistenter*, och administratörer ser och kan koppla bort allas kopplingar där. Rätten att koppla in styrs av behörigheten *Koppla Claude och andra AI-assistenter (MCP)* under Team & behörigheter. Åtkomsttoken gäller en timme och förnyas automatiskt; en koppling som inte används på 90 dagar måste godkännas igen.

Tider tolkas som svensk tid (ändra med miljövariabeln `DEFAULT_TIMEZONE`).

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
