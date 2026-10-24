// Skapar roller, demoanvändare och exempeldata. Kör `npm run seed` för att återställa.
import { pathToFileURL } from 'node:url';
import { db, run, get, tx } from './db.js';
import { hashPassword, PERMISSION_KEYS, encrypt, randomToken } from './security.js';
import { migrateCompanies } from './services/companies.js';

export const DEMO_PASSWORD = 'Demo1234!';

const ROLES = [
  ['Administratör', 'Full åtkomst till allt, inklusive användare, roller och integrationer.', PERMISSION_KEYS],
  ['Säljchef', 'Ser och fördelar teamets leads, ser rapporter och styr automatiseringar.',
    ['leads.view_all', 'leads.edit_own', 'leads.edit_all', 'leads.assign', 'leads.export', 'prospecting.use', 'products.manage', 'reports.view', 'automation.manage', 'audit.view']],
  ['Säljare', 'Arbetar med egna och otilldelade leads.', ['leads.edit_own']],
  ['Läsbehörighet', 'Kan se leads, affärer och rapporter men inte ändra något.', ['leads.view_all', 'reports.view']],
];

const USERS = [
  ['Johan Blomdahl', 'admin@leadflow.se', 0, '#6366f1'],
  ['Sofia Ahlgren', 'sofia@leadflow.se', 1, '#0ea5e9'],
  ['Marcus Holm', 'marcus@leadflow.se', 2, '#10b981'],
  ['Emma Lind', 'emma@leadflow.se', 2, '#f59e0b'],
  ['Ali Hassan', 'ali@leadflow.se', 3, '#ec4899'],
];

const FIRST = ['Anna', 'Erik', 'Maja', 'Lars', 'Sara', 'Oskar', 'Elin', 'Karl', 'Linnea', 'Viktor', 'Ida', 'Albin', 'Hanna', 'Nils', 'Klara', 'Gustav', 'Ebba', 'Axel', 'Wilma', 'Hugo'];
const LAST = ['Lindqvist', 'Berg', 'Nyström', 'Holm', 'Sjöberg', 'Ek', 'Forsberg', 'Wallin', 'Engström', 'Lund', 'Strand', 'Dahl', 'Sandberg', 'Björk'];
const COMPANIES = ['Nordlys AB', 'Solberga Bygg', 'Kvarnen Media', 'Tallhöjden Fastigheter', 'Ljusa Tandvård', 'Fjällstugan Resor', 'Brunnsviken Konsult', 'Hamnens Café', 'Ekdahl Juridik', 'Granit Design', 'Sjöbris Event', 'Vindö Energi', null, null];
const CITIES = ['Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Västerås', 'Örebro', 'Linköping', 'Umeå'];
const SOURCES = [['facebook', 34], ['instagram', 26], ['email', 22], ['webform', 14], ['manual', 4]];
const DETAILS = {
  facebook: ['Vårkampanj – Lead Ads', 'Gratis konsultation', 'Retargeting · Offertformulär'],
  instagram: ['Story-annons · Lead Ads', 'Direktmeddelande', 'Reels-kampanj'],
  email: ['Förfrågan: Offert önskas', 'Kontakt via hemsidan', 'Fråga om priser'],
  webform: ['Kontaktformulär', 'Boka demo', 'Nyhetsbrev'],
  manual: ['Mässa', 'Telefon'],
};
const MESSAGES = [
  'Hej! Vi vill gärna ha en offert för ert paket.', 'Kan ni ringa mig imorgon förmiddag?', 'Intresserad av en demo för vårt team på 12 personer.',
  'Vad kostar det per månad?', 'Såg er annons och vill veta mer.', null, null,
];

let seedRand = 42;
const rand = () => ((seedRand = (seedRand * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rand() * a.length)];
const weighted = (list) => { let x = rand() * list.reduce((s, [, w]) => s + w, 0); for (const [v, w] of list) if ((x -= w) <= 0) return v; return list[0][0]; };
const ts = (daysAgo, hours = 0) => new Date(Date.now() - daysAgo * 864e5 + hours * 36e5).toISOString().slice(0, 19).replace('T', ' ');
// Förfallotid för uppgifter: en given dag kl 07–10 UTC (förmiddag i Sverige).
const dueAt = (daysAhead) => { const d = new Date(Date.now() + daysAhead * 864e5); d.setUTCHours(7 + Math.floor(rand() * 4), 0, 0, 0); return d.toISOString().slice(0, 19).replace('T', ' '); };

export function seed({ reset = false } = {}) {
  tx(() => {
    if (reset) for (const t of ['notifications', 'ingest_log', 'quotes', 'deal_items', 'products', 'meetings', 'google_accounts', 'prospects', 'prospect_searches', 'activities', 'deals', 'leads', 'companies', 'automation_rules', 'integrations', 'audit_log', 'settings', 'users', 'roles']) db.exec(`DELETE FROM ${t}`);
    const roleIds = ROLES.map(([name, desc, perms], i) =>
      Number(run('INSERT INTO roles (name, description, permissions, is_system) VALUES (?,?,?,?)', name, desc, JSON.stringify(perms), i < 4 ? 1 : 0).lastInsertRowid));
    const pw = hashPassword(DEMO_PASSWORD);
    const userIds = USERS.map(([name, email, role, color]) =>
      Number(run('INSERT INTO users (name, email, password_hash, role_id, color) VALUES (?,?,?,?,?)', name, email, pw, roleIds[role], color).lastInsertRowid));
    const sellers = [userIds[1], userIds[2], userIds[3]];

    // Integrationer (utan riktiga inloggningsuppgifter – fylls i under Integrationer)
    const integ = {
      webform: Number(run('INSERT INTO integrations (type, name, token, config, status) VALUES (?,?,?,?,?)', 'webform', 'Hemsidans kontaktformulär', randomToken(), encrypt({ redirectUrl: '' }), 'ok').lastInsertRowid),
      email: Number(run('INSERT INTO integrations (type, name, token, config, status) VALUES (?,?,?,?,?)', 'email', 'info@-inkorgen (vidarebefordran)', randomToken(), encrypt({ mode: 'forward' }), 'ok').lastInsertRowid),
    };

    run('INSERT INTO automation_rules (name, match, conditions, actions, position, runs) VALUES (?,?,?,?,?,?)',
      'Fördela sociala leads rättvist', 'any',
      JSON.stringify([{ field: 'source', op: 'equals', value: 'facebook' }, { field: 'source', op: 'equals', value: 'instagram' }]),
      JSON.stringify([{ type: 'round_robin', users: [userIds[2], userIds[3]] }, { type: 'create_task', value: 'Ring upp ny lead från sociala medier', hours: 2 }]), 1, 48);
    run('INSERT INTO automation_rules (name, match, conditions, actions, position, runs) VALUES (?,?,?,?,?,?)',
      'Företagsleads till säljchef', 'all',
      JSON.stringify([{ field: 'company', op: 'is_not_empty', value: '' }, { field: 'source', op: 'equals', value: 'webform' }]),
      JSON.stringify([{ type: 'assign_user', value: userIds[1] }, { type: 'add_tag', value: 'B2B' }, { type: 'add_score', value: 15 }]), 2, 11);
    run('INSERT INTO automation_rules (name, match, conditions, actions, position, runs) VALUES (?,?,?,?,?,?)',
      'Märk brådskande förfrågningar', 'any',
      JSON.stringify([{ field: 'message', op: 'contains', value: 'offert' }, { field: 'message', op: 'contains', value: 'ring' }]),
      JSON.stringify([{ type: 'add_tag', value: 'Het' }, { type: 'add_score', value: 10 }]), 3, 23);

    for (let i = 0; i < 140; i++) {
      const daysAgo = Math.floor(60 * (1 - Math.sqrt(rand()))); // jämn tillväxt mot idag
      const source = weighted(SOURCES);
      const first = pick(FIRST), last = pick(LAST), company = pick(COMPANIES);
      const email = `${first}.${last}${i}`.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o') + '@exempel.se';
      const status = daysAgo < 2 ? 'new' : weighted([['new', 20], ['contacted', 30], ['qualified', 20], ['unqualified', 12], ['converted', 18]]);
      const owner = status === 'new' && rand() < 0.4 ? null : pick(sellers);
      const msg = pick(MESSAGES);
      const tags = [];
      if (msg?.includes('offert') || msg?.includes('ring')) tags.push('Het');
      if (company && rand() < 0.4) tags.push('B2B');
      const score = Math.min(100, 30 + Math.floor(rand() * 55) + (tags.includes('Het') ? 10 : 0));
      const created = ts(daysAgo, -Math.floor(rand() * 10));
      const leadId = Number(run(`INSERT INTO leads (first_name, last_name, email, phone, company, title, city, source, source_detail, external_id,
        status, score, owner_id, tags, message, created_at, updated_at, last_activity_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        first, last, email, '+4670' + Math.floor(1000000 + rand() * 8999999), company, company ? pick(['VD', 'Inköpschef', 'Marknadschef', 'Ägare']) : null,
        pick(CITIES), source, pick(DETAILS[source]), source === 'manual' ? null : `seed-${i}`, status, score, owner, JSON.stringify(tags), msg,
        created, created, created).lastInsertRowid);
      run("INSERT INTO activities (lead_id, type, content, created_at) VALUES (?, 'system', ?, ?)", leadId,
        `Lead skapad automatiskt via ${{ facebook: 'Facebook', instagram: 'Instagram', email: 'e-post', webform: 'webbformulär', manual: 'manuellt' }[source]}`, created);
      if (['facebook', 'instagram', 'email', 'webform'].includes(source)) {
        run('INSERT INTO ingest_log (integration_id, source, result, lead_id, summary, created_at) VALUES (?,?,?,?,?,?)',
          source === 'webform' ? integ.webform : source === 'email' ? integ.email : null, source, 'created', leadId, `Ny lead: ${first} ${last}`, created);
      }
      if (status !== 'new') {
        run("INSERT INTO activities (lead_id, user_id, type, content, created_at) VALUES (?, ?, 'call', ?, ?)", leadId, owner,
          pick(['Pratade med kunden, intresserad. Skickar info.', 'Ingen svarade, lämnade röstmeddelande.', 'Bra samtal – vill ha offert.']), ts(daysAgo, 3 + rand() * 20));
      }
      if (owner && rand() < 0.35) {
        run("INSERT INTO activities (lead_id, user_id, type, content, due_at, done, created_at) VALUES (?, ?, 'task', ?, ?, ?, ?)", leadId, owner,
          pick(['Följ upp offert', 'Boka demo', 'Skicka avtal', 'Ring tillbaka']), dueAt(Math.floor(rand() * 6) - 1), rand() < 0.3 ? 1 : 0, created);
      }
      if (status === 'converted' || (status === 'qualified' && rand() < 0.5)) {
        const stage = status === 'qualified' ? pick(['qualified', 'contact']) : weighted([['proposal', 3], ['negotiation', 2], ['won', 4], ['lost', 2], ['contact', 1]]);
        const value = Math.round((5 + rand() * 120)) * 1000;
        const dealOwner = owner || pick(sellers);
        const changed = ts(Math.max(0, Math.floor(daysAgo * rand())));
        const dealId = Number(run(`INSERT INTO deals (title, value, stage, lead_id, owner_id, expected_close, created_at, updated_at, closed_at, stage_changed_at, lost_reason)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          `${company || `${first} ${last}`} – ${pick(['Årsavtal', 'Startpaket', 'Premium', 'Konsultuppdrag', 'Licens'])}`, value, stage, leadId, dealOwner,
          ts(-Math.floor(rand() * 45)).slice(0, 10), created, created, ['won', 'lost'].includes(stage) ? changed : null, changed,
          stage === 'lost' ? weighted([['Pris', 4], ['Valde en konkurrent', 3], ['Ingen respons', 3], ['Fel tidpunkt', 1]]) : null).lastInsertRowid);
        run("INSERT INTO activities (lead_id, deal_id, user_id, type, content, created_at) VALUES (?, ?, ?, 'system', ?, ?)", leadId, dealId, dealOwner, 'Konverterad till affär', created);
        if (!['won', 'lost'].includes(stage)) {
          run("INSERT INTO activities (lead_id, deal_id, user_id, type, content, created_at) VALUES (?, ?, ?, 'meeting', ?, ?)", leadId, dealId, dealOwner,
            pick(['Genomgång av behov, de vill se ett upplägg för 10 användare.', 'Visade demo – positiva, beslutsfattare är VD.', 'Gick igenom offerten rad för rad.']), changed);
          if (rand() < 0.75) run("INSERT INTO activities (lead_id, deal_id, user_id, type, content, due_at, created_at) VALUES (?, ?, ?, 'task', ?, ?, ?)", leadId, dealId, dealOwner,
            pick(['Skicka offert', 'Följ upp offerten', 'Boka uppföljningsmöte', 'Skicka avtal för signering']), dueAt(Math.floor(rand() * 6) - 2), changed);
        }
      }
    }
    run(`UPDATE integrations SET leads_count = (SELECT count(*) FROM ingest_log g WHERE g.integration_id = integrations.id AND g.result = 'created')`);
    // Företag: leads med samma företagsnamn blir kontaktpersoner på samma företag.
    migrateCompanies();
    const orgNrs = ['556677-8899', '559012-3457', '556123-4567', '556987-6543', '559201-4428'];
    db.prepare('SELECT id FROM companies ORDER BY id LIMIT 5').all().forEach((c, i) => run('UPDATE companies SET org_nr = ? WHERE id = ?', orgNrs[i], c.id));

    // Produktkatalog och produktrader på affärerna (affärens värde = summan av raderna).
    const PRODUCTS = [
      ['Startpaket', 'LF-START', 'Uppsättning, utbildning och 3 månaders support', 'st', 15000, 'none'],
      ['Licens Pro', 'LF-PRO', 'Per användare och månad', 'användare/mån', 450, 'monthly'],
      ['Licens Premium', 'LF-PREM', 'Per användare och månad, inkl. integrationer', 'användare/mån', 790, 'monthly'],
      ['Konsulttimme', 'LF-KONS', 'Anpassning och projektledning', 'tim', 1250, 'none'],
      ['Årsavtal support', 'LF-SUP', 'Prioriterad support, 12 månader', 'st', 24000, 'yearly'],
    ];
    const productIds = PRODUCTS.map(([name, sku, desc, unit, price, rec]) =>
      Number(run('INSERT INTO products (name, sku, description, unit, price, recurring) VALUES (?,?,?,?,?,?)', name, sku, desc, unit, price, rec).lastInsertRowid));
    for (const d of db.prepare("SELECT id FROM deals WHERE stage NOT IN ('lost')").all()) {
      const lines = [[0, 1, 0], [1 + Math.floor(rand() * 2), 5 + Math.floor(rand() * 20), rand() < 0.3 ? 10 : 0], ...(rand() < 0.5 ? [[3, 4 + Math.floor(rand() * 16), 0]] : [])];
      lines.forEach(([pi, qty, disc], pos) => {
        const [name, , desc, unit, price, rec] = PRODUCTS[pi];
        run('INSERT INTO deal_items (deal_id, product_id, name, description, quantity, unit, unit_price, discount, recurring, position) VALUES (?,?,?,?,?,?,?,?,?,?)',
          d.id, productIds[pi], name, desc, qty, unit, price, disc, rec, pos);
      });
      run('UPDATE deals SET value = (SELECT round(sum(quantity * unit_price * (1 - discount / 100.0))) FROM deal_items WHERE deal_id = ?) WHERE id = ?', d.id, d.id);
    }

    // Demomöten: öppna affärer får möten den här och nästa vecka (och några passerade som väntar på utfall).
    const MEETING_TYPES = ['Demo', 'Behovsanalys', 'Offertgenomgång', 'Uppstartsmöte', 'Avtalsgenomgång'];
    const openDeals = db.prepare("SELECT d.*, l.email, l.first_name, l.last_name FROM deals d JOIN leads l ON l.id = d.lead_id WHERE d.stage IN ('contact','proposal','negotiation')").all();
    openDeals.forEach((d, i) => {
      const day = new Date(); day.setUTCDate(day.getUTCDate() + (i % 12) - 3);
      if ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 2);
      day.setUTCHours(7 + (i * 3) % 8, i % 2 ? 30 : 0, 0, 0);
      const start = day.toISOString().slice(0, 19).replace('T', ' ');
      const end = new Date(day.getTime() + (i % 3 ? 60 : 45) * 60000).toISOString().slice(0, 19).replace('T', ' ');
      const past = day < new Date();
      run(`INSERT INTO meetings (title, location, video_url, start_at, end_at, owner_id, lead_id, deal_id, attendees, status, outcome, reminder_sent, followup_sent)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, `${pick(MEETING_TYPES)} – ${d.first_name} ${d.last_name}`, i % 3 === 0 ? 'Kundens kontor' : null,
        i % 3 === 0 ? null : 'https://meet.google.com/abc-defg-hij', start, end, d.owner_id, d.lead_id, d.id,
        JSON.stringify([{ email: d.email, name: `${d.first_name} ${d.last_name}` }]),
        past && i % 2 ? 'done' : 'scheduled', past && i % 2 ? 'Bra möte, de vill ha en offert.' : null, past ? 1 : 0, past && i % 2 ? 1 : 0);
    });
    run("INSERT INTO notifications (user_id, text, link) VALUES (?, 'Välkommen till LeadFlow! Koppla in dina kanaler under Integrationer.', '/integrations')", userIds[0]);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  seed({ reset: process.argv.includes('--reset') || !!get('SELECT 1 FROM users LIMIT 1') });
  console.log(`Klart. Logga in med admin@leadflow.se / ${DEMO_PASSWORD}`);
}
