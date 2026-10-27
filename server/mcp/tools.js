// MCP-verktygen. Varje verktyg anropar appens vanliga API som den inloggade användaren, så samma behörigheter,
// synlighet, automatiseringar, notiser och realtidsuppdateringar gäller som när säljaren klickar i appen.
// Allt märks "via Claude" i aktivitetsloggen och tidslinjen. En koppling kan nå flera arbetsytor (bolag); varje
// verktyg tar då ett valfritt "workspace" och körs i den arbetsytan.
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { COOKIE } from '../middleware.js';
import { signSession, loadUser, can } from '../security.js';
import { APP_URL } from '../config.js';
import { central, withWorkspace } from '../db.js';

const TZ = process.env.DEFAULT_TIMEZONE || 'Europe/Stockholm';
let apiBase = null;
export const setApiPort = (port) => { apiBase = `http://127.0.0.1:${port}/api`; };

class ToolError extends Error {}

// Arbetsytan för det pågående verktygsanropet: { ws, name, multi }.
const toolCtx = new AsyncLocalStorage();

async function api(auth, method, path, body) {
  const ws = toolCtx.getStore()?.ws ?? auth.extra.workspaceId;
  const cookie = `${COOKIE}=${encodeURIComponent(signSession(auth.extra.userId, 1 / 96, { via: 'claude', cid: auth.clientId, ws }))}`;
  const res = await fetch(apiBase + path, {
    method,
    headers: { cookie, ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ToolError(data?.error || `HTTP ${res.status}`);
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return p.size ? `?${p}` : '';
};

// ---------- Tider: databasen lagrar UTC ("YYYY-MM-DD HH:MM:SS"), användaren tänker i svensk tid ----------
function tzOffsetMs(date, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(date).map((p) => [p.type, p.value]));
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** ISO-tid med tidszon används som den är; utan tidszon tolkas den som lokal tid (Europe/Stockholm). */
function toUtc(input) {
  if (!input) return null;
  const s = String(input).trim().replace(' ', 'T');
  let d;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) d = new Date(s);
  else {
    const m = s.match(/^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d))?)?$/);
    if (!m) throw new ToolError(`Ogiltig tid: ${input}. Använd t.ex. 2026-10-27T14:00`);
    const guess = Date.UTC(m[1], m[2] - 1, m[3], m[4] ?? 9, m[5] ?? 0, m[6] ?? 0);
    d = new Date(guess - tzOffsetMs(new Date(guess), TZ));
    d = new Date(guess - tzOffsetMs(d, TZ));
  }
  if (isNaN(d)) throw new ToolError(`Ogiltig tid: ${input}`);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

const SQL_TIME = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/;
function localTime(v) {
  const d = new Date(`${v.replace(' ', 'T')}Z`);
  const local = new Date(d.getTime() + tzOffsetMs(d, TZ));
  return local.toISOString().slice(0, 16).replace('T', ' ');
}
// Alla tidsstämplar i svaren visas i lokal tid; tomma fält och interna fält tas bort så svaren blir kompakta.
const HIDDEN = new Set(['owner_color', 'user_color', 'color', 'position', 'fields', 'google_event_id', 'google_updated', 'reminder_sent', 'followup_sent', 'content_hash', 'token', 'signature', 'has_signature', 'canEdit', 'lostReasons']);
function clean(v) {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === null || x === undefined || x === '' || HIDDEN.has(k) || (Array.isArray(x) && !x.length)) continue;
      out[k] = typeof x === 'string' && SQL_TIME.test(x) ? localTime(x) : clean(x);
    }
    return out;
  }
  return v;
}

// Med flera arbetsytor börjar varje svar med vilken arbetsyta det gäller.
const ok = (data, note) => {
  const ctx = toolCtx.getStore();
  const head = ctx?.multi ? `Arbetsyta: ${ctx.name}\n` : '';
  return { content: [{ type: 'text', text: head + (note ? `${note}\n\n` : (head ? '\n' : '')) + JSON.stringify(clean(data), null, 1) }] };
};
// Länkar öppnar rätt arbetsyta i appen (?ws=), även om användaren står i en annan.
const link = (path) => {
  const ctx = toolCtx.getStore();
  return ctx?.multi ? `${APP_URL}${path}${path.includes('?') ? '&' : '?'}ws=${ctx.ws}` : `${APP_URL}${path}`;
};

const STAGES = { qualified: 'Kvalificerad', contact: 'Möte bokat', proposal: 'Offert skickad', negotiation: 'Förhandling', won: 'Vunnen', lost: 'Förlorad' };
const LOST_REASONS = ['Pris', 'Valde en konkurrent', 'Ingen respons', 'Fel målgrupp', 'Fel tidpunkt', 'Annat'];
const leadName = (l) => [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || l.company || `Lead ${l.id}`;

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const id = (what) => z.number().int().positive().describe(`${what}s id`);
const time = (what) => z.string().describe(`${what}, ISO 8601. Utan tidszon tolkas tiden som ${TZ}, t.ex. "2026-10-27T14:00".`);

function todayBounds() {
  const date = localTime(new Date().toISOString().slice(0, 19).replace('T', ' ')).slice(0, 10);
  const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return { from: toUtc(`${date}T00:00`), to: toUtc(`${next.toISOString().slice(0, 10)}T00:00`) };
}

function stalled(deal) {
  const overdue = deal.next_task?.due_at && deal.next_task.due_at < new Date().toISOString().slice(0, 19).replace('T', ' ');
  const idleDays = Math.floor((Date.now() - new Date(`${(deal.last_contact_at || deal.stage_changed_at || deal.created_at).replace(' ', 'T')}Z`)) / 864e5);
  const reasons = [];
  if (!deal.next_task) reasons.push('inget nästa steg');
  else if (overdue) reasons.push('försenad uppgift');
  if (idleDays >= 14) reasons.push(`ingen kontakt på ${idleDays} dagar`);
  return reasons;
}

const dealSummary = (d) => ({
  id: d.id, title: d.title, value: d.value, stage: STAGES[d.stage] || d.stage, company: d.company, contact: d.first_name || d.last_name ? leadName(d) : null,
  owner: d.owner_name, expected_close: d.expected_close, next_task: d.next_task, last_contact_at: d.last_contact_at, lost_reason: d.lost_reason, url: link(`/pipeline/${d.id}`),
});

export const INSTRUCTIONS = `LeadFlow är ett CRM för säljare. Du agerar som den inloggade användaren och har exakt dennes behörigheter.
Börja ofta med get_my_day (dagens möten, uppgifter, nya leads och affärer som står still) eller search för att hitta kunder, kontakter och affärer.
Begrepp: "lead" = kontaktperson (kan höra till ett företag), "affär" (deal) = möjlighet i pipelinen med steg ${Object.values(STAGES).join(' → ')}.
Tider i svaren är lokal tid (${TZ}). Belopp är i kronor exkl. moms. Allt du skapar loggas som användaren "via Claude".
Bekräfta med användaren innan du flyttar en affär till Vunnen/Förlorad, skapar en offert eller bokar möten med inbjudningar till kunden.
När du skriver säljmejl, säljvinklar eller samtalsmanus: läs get_our_offer först och anpassa efter vad bolaget säljer och dess ton.`;

const WORKSPACE_INSTRUCTIONS = (list, def) => `
Kopplingen når flera arbetsytor (separata bolag med helt egna kunder, leads och affärer): ${list.map((w) => `"${w.name}"`).join(', ')}.
Utan argumentet workspace används standardarbetsytan "${def.name}". Ange workspace (namn eller id) när användaren talar om ett annat bolag,
och fråga om det är oklart vilket bolag som avses innan du skapar eller ändrar något. Id:n för leads, affärer m.m. gäller bara inom sin arbetsyta.
Varje svar börjar med vilken arbetsyta det gäller. list_workspaces visar arbetsytorna och din roll i varje.`;

export function buildServer(auth) {
  const workspaces = (auth.extra.workspaces || [auth.extra.workspaceId]).map((id) => ({
    id, name: central.get('SELECT name FROM workspaces WHERE id = ?', id)?.name || `Arbetsyta ${id}`,
    user: withWorkspace(id, () => loadUser(auth.extra.userId)),
  })).filter((w) => w.user);
  const def = workspaces.find((w) => w.id === auth.extra.workspaceId) || workspaces[0];
  const multi = workspaces.length > 1;
  const user = def.user;
  const server = new McpServer({ name: 'leadflow-crm', title: 'LeadFlow CRM', version: '1.1.0' }, { instructions: INSTRUCTIONS + (multi ? WORKSPACE_INSTRUCTIONS(workspaces, def) : '') });

  function resolveWorkspace(arg) {
    if (arg === undefined || arg === null || String(arg).trim() === '') return def;
    const q = String(arg).trim().toLowerCase();
    const hit = workspaces.find((w) => String(w.id) === q || w.name.toLowerCase() === q)
      || (() => { const partial = workspaces.filter((w) => w.name.toLowerCase().includes(q)); return partial.length === 1 ? partial[0] : null; })();
    if (!hit) throw new ToolError(`Okänd arbetsyta "${arg}". Kopplingen når: ${workspaces.map((w) => `${w.name} (id ${w.id})`).join(', ')}`);
    return hit;
  }

  const tool = (name, config, fn) => server.registerTool(name, {
    ...config,
    inputSchema: multi ? { ...config.inputSchema, workspace: z.string().optional().describe(`Arbetsyta (bolag), namn eller id. Standard: ${def.name}`) } : config.inputSchema,
  }, async (args) => {
    try {
      const { workspace, ...rest } = args || {};
      const ws = resolveWorkspace(workspace);
      return await toolCtx.run({ ws: ws.id, name: ws.name, multi, user: ws.user }, () => fn(rest));
    } catch (e) {
      if (!(e instanceof ToolError)) console.error(`[mcp] ${name}`, e);
      return { isError: true, content: [{ type: 'text', text: e instanceof ToolError ? e.message : 'Ett oväntat fel inträffade' }] };
    }
  });
  // Skrivverktygen finns om användaren får ändra i någon av arbetsytorna; varje anrop kontrolleras ändå av appen.
  const canWrite = (u) => can(u, 'leads.edit_own') || can(u, 'leads.edit_all');
  const writes = workspaces.some((w) => canWrite(w.user));

  server.registerTool('list_workspaces', {
    title: 'Arbetsytor',
    description: 'Visar arbetsytorna (bolagen) som kopplingen når, din roll i varje och vilken som är standard.',
    inputSchema: {}, annotations: READ,
  }, async () => ok(workspaces.map((w) => ({ id: w.id, name: w.name, role: w.user.role, can_edit: canWrite(w.user), default: w.id === def.id || undefined }))));

  // ---------- Läsa ----------
  tool('whoami', { title: 'Vem är jag', description: 'Visar den inloggade användaren, arbetsytan (bolaget) kopplingen gäller, rollen och vad den får göra i LeadFlow.', inputSchema: {}, annotations: READ }, async () =>
    (() => { const c = toolCtx.getStore(); return ok({ name: c.user.name, email: c.user.email, workspace: c.name, role: c.user.role, permissions: c.user.permissions, can_edit: canWrite(c.user), workspaces: multi ? workspaces.map((w) => w.name) : undefined, app: APP_URL }); })());

  tool('search', {
    title: 'Sök i CRM:et',
    description: 'Söker bland företag, kontakter/leads och affärer på namn, företag, e-post, telefon, org.nr, ort eller affärens titel.',
    inputSchema: { query: z.string().min(2).describe('Sökord, minst 2 tecken') },
    annotations: READ,
  }, async ({ query }) => {
    const r = await api(auth, 'GET', `/search${qs({ q: query, all: 1 })}`);
    return ok({
      companies: r.companies.map((c) => ({ ...c, url: link(`/companies/${c.id}`) })),
      leads: r.leads.map((l) => ({ id: l.id, name: leadName(l), company: l.company, email: l.email, phone: l.phone, city: l.city, status: l.status, owner: l.owner_name, url: link(`/leads/${l.id}`) })),
      deals: r.deals.map((d) => ({ id: d.id, title: d.title, value: d.value, stage: STAGES[d.stage], company: d.company, owner: d.owner_name, url: link(`/pipeline/${d.id}`) })),
      counts: r.counts,
    });
  });

  tool('get_my_day', {
    title: 'Min dag',
    description: 'Dagens möten, möten som saknar utfall, uppgifter att göra (inkl. försenade), nya leads att ringa, affärer som står still och kontakter som behöver uppföljning.',
    inputSchema: {},
    annotations: READ,
  }, async () => {
    const r = await api(auth, 'GET', `/today${qs(todayBounds())}`);
    return ok({
      meetings: r.meetings.map((m) => ({ id: m.id, title: m.title, start_at: m.start_at, end_at: m.end_at, location: m.location, video_url: m.video_url, contact: m.first_name ? leadName(m) : null, company: m.company, deal: m.deal_title })),
      meetings_missing_outcome: r.outcomes,
      tasks: r.tasks.map((t) => ({ id: t.id, content: t.content, due_at: t.due_at, contact: t.first_name ? leadName(t) : null, company: t.company, phone: t.phone, deal: t.deal_title, lead_id: t.lead_id, deal_id: t.deal_id })),
      new_leads_to_call: r.newLeads.map((l) => ({ id: l.id, name: leadName(l), company: l.company, phone: l.phone, email: l.email, source: l.source, score: l.score, assigned_to_me: !!l.owner_id, created_at: l.created_at })),
      stalled_deals: r.stuckDeals.map(dealSummary),
      followups: r.followups.map((l) => ({ id: l.id, name: leadName(l), company: l.company, phone: l.phone, last_contact_at: l.last_contact_at })),
    });
  });

  tool('list_leads', {
    title: 'Lista leads',
    description: 'Listar leads/kontakter med filter. Synligheten följer användarens roll.',
    inputSchema: {
      view: z.enum(['all', 'new', 'followup', 'customers', 'archived']).optional().describe('new = nya att ringa, followup = kontakta igen (kontaktade utan svar inom uppföljningstiden), customers = kunder, archived = arkiv (Ej aktuell). all visar inte arkiverade.'),
      status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'converted']).optional(),
      source: z.enum(['email', 'facebook', 'instagram', 'webform', 'prospecting', 'manual', 'import']).optional(),
      owner: z.string().optional().describe('"me", "none" (otilldelade) eller en användares id'),
      query: z.string().optional(),
      sort: z.enum(['created_at', 'score', 'last_activity_at', 'last_contact_at', 'name', 'company']).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: READ,
  }, async ({ view, status, source, owner, query, sort, limit = 25 }) => {
    const r = await api(auth, 'GET', `/leads${qs({ view: view === 'all' ? '' : view, status, source, owner, q: query, sort, limit })}`);
    return ok({
      total: r.total, counts: r.counts,
      leads: r.rows.map((l) => ({ id: l.id, name: leadName(l), company: l.company, email: l.email, phone: l.phone, status: l.status, source: l.source, score: l.score, owner: l.owner_name, tags: l.tags, next_step: l.next_step, last_contact_at: l.last_contact_at, created_at: l.created_at })),
    });
  });

  tool('get_lead', {
    title: 'Visa lead',
    description: 'Visar ett lead/en kontakt med uppgifter, affärer och hela tidslinjen (anteckningar, samtal, uppgifter, mejl, möten).',
    inputSchema: { lead_id: id('Leadet'), timeline_limit: z.number().int().min(1).max(200).optional().describe('Antal tidslinjehändelser, standard 40') },
    annotations: READ,
  }, async ({ lead_id, timeline_limit = 40 }) => {
    const l = await api(auth, 'GET', `/leads/${lead_id}`);
    const { activities, deals, ...lead } = l;
    return ok({
      ...lead, name: leadName(l), can_edit: l.canEdit, url: link(`/leads/${l.id}`),
      deals: deals.map((d) => ({ id: d.id, title: d.title, value: d.value, stage: STAGES[d.stage], owner: d.owner_name })),
      timeline: activities.slice(0, timeline_limit).map(activityRow),
    });
  });

  tool('get_company', {
    title: 'Visa företag',
    description: 'Visar ett företag med kontaktpersoner, affärer och gemensam tidslinje.',
    inputSchema: { company_id: id('Företaget'), timeline_limit: z.number().int().min(1).max(200).optional() },
    annotations: READ,
  }, async ({ company_id, timeline_limit = 40 }) => {
    const c = await api(auth, 'GET', `/companies/${company_id}`);
    const { contacts, deals, activities, ...company } = c;
    return ok({
      ...company, can_edit: c.canEdit, url: link(`/companies/${c.id}`),
      contacts: contacts.map((l) => ({ id: l.id, name: leadName(l), title: l.title, email: l.email, phone: l.phone, status: l.status, owner: l.owner_name })),
      deals: deals.map((d) => ({ id: d.id, title: d.title, value: d.value, stage: STAGES[d.stage], owner: d.owner_name, contact: d.first_name ? leadName(d) : null })),
      timeline: activities.slice(0, timeline_limit).map(activityRow),
    });
  });

  tool('get_deal', {
    title: 'Visa affär',
    description: 'Visar en affär med kontakt, företag, produktrader, offerter och gemensam tidslinje.',
    inputSchema: { deal_id: id('Affären'), timeline_limit: z.number().int().min(1).max(200).optional() },
    annotations: READ,
  }, async ({ deal_id, timeline_limit = 40 }) => {
    const [d, items] = await Promise.all([api(auth, 'GET', `/deals/${deal_id}`), api(auth, 'GET', `/deals/${deal_id}/items`)]);
    return ok({
      ...dealSummary(d), created_at: d.created_at, stage_changed_at: d.stage_changed_at, closed_at: d.closed_at, can_edit: d.canEdit,
      lead: d.lead && { id: d.lead.id, name: leadName(d.lead), email: d.lead.email, phone: d.lead.phone, title: d.lead.title },
      company: d.company, other_contacts: d.contacts?.map((l) => ({ id: l.id, name: leadName(l), title: l.title, email: l.email, phone: l.phone })),
      products: items.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, unit_price: i.unit_price, discount: i.discount, recurring: i.recurring, total: i.total })),
      totals: items.totals,
      quotes: items.quotes.map(quoteRow),
      timeline: d.activities.slice(0, timeline_limit).map(activityRow),
    });
  });

  tool('get_pipeline', {
    title: 'Pipeline',
    description: 'Sammanställer pipelinen per steg (antal och värde) och listar öppna affärer, med de som står still markerade (inget nästa steg, försenad uppgift eller ingen kontakt på 14 dagar).',
    inputSchema: {
      owner: z.string().optional().describe('"me" för bara mina affärer, annars en användares id. Utelämna för alla användaren får se.'),
      include_closed: z.boolean().optional().describe('Ta med vunna och förlorade affärer'),
    },
    annotations: READ,
  }, async ({ owner, include_closed }) => {
    let deals = await api(auth, 'GET', '/deals');
    if (owner === 'me') deals = deals.filter((d) => d.owner_id === user.id);
    else if (owner) deals = deals.filter((d) => String(d.owner_id) === String(owner));
    const stages = Object.entries(STAGES).map(([key, label]) => {
      const list = deals.filter((d) => d.stage === key);
      return { stage: label, count: list.length, value: list.reduce((s, d) => s + (d.value || 0), 0) };
    });
    const open = deals.filter((d) => !['won', 'lost'].includes(d.stage));
    return ok({
      stages,
      open_value: open.reduce((s, d) => s + (d.value || 0), 0),
      deals: (include_closed ? deals : open).map((d) => ({ ...dealSummary(d), stalled: ['won', 'lost'].includes(d.stage) ? undefined : stalled(d).join(', ') || undefined })),
    });
  });

  tool('get_overview_stats', {
    title: 'Översikt och statistik',
    description: 'Nyckeltal för en period: nya leads, konvertering, pipelinevärde, vunnet, vinstgrad, svarstid, leads per källa, förlustorsaker och (för chefer) topplista.',
    inputSchema: { days: z.number().int().min(7).max(365).optional().describe('Periodens längd i dagar, standard 30') },
    annotations: READ,
  }, async ({ days = 30 }) => {
    const r = await api(auth, 'GET', `/dashboard${qs({ days })}`);
    return ok({ team_wide: r.team, days: r.days, kpi: r.kpi, by_source: r.bySource, by_status: r.byStatus, stages: r.stages, lost_reasons: r.lostReasons, leaderboard: r.leaderboard });
  });

  tool('list_tasks', {
    title: 'Lista uppgifter',
    description: 'Listar uppgifter (att göra), sorterade på förfallotid.',
    inputSchema: { scope: z.enum(['mine', 'all']).optional().describe('all = hela teamet (kräver rätt att se alla)'), include_done: z.boolean().optional() },
    annotations: READ,
  }, async ({ scope, include_done }) => {
    const r = await api(auth, 'GET', `/tasks${qs({ scope, done: include_done ? 'all' : undefined })}`);
    return ok(r.slice(0, 100).map((t) => ({ id: t.id, content: t.content, due_at: t.due_at, done: !!t.done, assignee: t.user_name, contact: t.first_name ? leadName(t) : null, company: t.company, deal: t.deal_title, lead_id: t.lead_id, deal_id: t.deal_id })));
  });

  tool('list_meetings', {
    title: 'Lista möten',
    description: 'Listar möten i kalendern inom ett tidsintervall (standard: idag och sju dagar framåt).',
    inputSchema: { from: time('Från').optional(), to: time('Till').optional(), lead_id: id('Leadet').optional(), deal_id: id('Affären').optional() },
    annotations: READ,
  }, async ({ from, to, lead_id, deal_id }) => {
    const b = todayBounds();
    const r = await api(auth, 'GET', `/meetings${qs({ from: from ? toUtc(from) : lead_id || deal_id ? undefined : b.from, to: to ? toUtc(to) : lead_id || deal_id ? undefined : toUtc(new Date(Date.now() + 8 * 864e5).toISOString()), lead_id, deal_id })}`);
    return ok(r.map((m) => ({ id: m.id, title: m.title, start_at: m.start_at, end_at: m.end_at, status: m.status, outcome: m.outcome, location: m.location, video_url: m.video_url, owner: m.owner_name, contact: m.first_name ? leadName(m) : null, company: m.company, deal: m.deal_title, attendees: m.attendees })));
  });

  tool('list_products', {
    title: 'Produkter och priser',
    description: 'Listar aktiva produkter med pris (kr exkl. moms), enhet, moms och om de är återkommande.',
    inputSchema: {},
    annotations: READ,
  }, async () => ok((await api(auth, 'GET', '/products')).map(({ used, active, created_at, ...p }) => p)));

  tool('list_templates', {
    title: 'Mallar',
    description: 'Teamets sparade mallar för e-post, meddelanden (SMS/LinkedIn) och samtalsmanus. Fält som {förnamn}, {företag}, {min_namn} och {mitt_företag} ska ersättas med kontaktens och användarens uppgifter när mallen används.',
    inputSchema: { type: z.enum(['email', 'message', 'call']).optional().describe('email = e-post, message = SMS/meddelande, call = samtalsmanus') },
    annotations: READ,
  }, async ({ type }) => ok((await api(auth, 'GET', `/templates${qs({ type })}`)).map((t) => ({ id: t.id, type: t.type, name: t.name, subject: t.subject, body: t.body, uses: t.use_count }))));

  tool('get_our_offer', {
    title: 'Vårt erbjudande',
    description: 'Vad användarens eget bolag säljer: vad vi gör, målgrupp, problem vi löser, varför oss, referenser, målet med första kontakten och tonläge. Läs detta innan du skriver säljmejl, säljvinklar eller samtalsmanus, och följ tonen.',
    inputSchema: {},
    annotations: READ,
  }, async () => {
    const r = await api(auth, 'GET', '/ai/offer');
    const products = await api(auth, 'GET', '/products');
    return ok({ company: r.company, website: r.website, ...r.offer, products: products.map((p) => p.name) },
      Object.values(r.offer || {}).some(Boolean) ? null : 'Erbjudandet är inte ifyllt än – det fylls i under Inställningar → Vårt erbjudande i LeadFlow.');
  });

  tool('list_team', {
    title: 'Teamet',
    description: 'Listar aktiva användare (för att tilldela leads, affärer och möten).',
    inputSchema: {},
    annotations: READ,
  }, async () => ok((await api(auth, 'GET', '/users')).filter((u) => u.active !== 0).map((u) => ({ id: u.id, name: u.name, role: u.role }))));

  if (!writes) return server;

  // ---------- Skriva ----------
  tool('create_lead', {
    title: 'Skapa lead',
    description: 'Skapar ett nytt lead/en ny kontakt. Kopplas automatiskt till rätt företag (eller till company_id).',
    inputSchema: {
      first_name: z.string().optional(), last_name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(),
      company: z.string().optional().describe('Företagsnamn'), company_id: id('Företaget').optional(), title: z.string().optional().describe('Befattning'),
      city: z.string().optional(), message: z.string().optional().describe('Förfrågan eller bakgrund'),
      owner_id: id('Ansvarig användare').optional().describe('Utelämna för att bli ansvarig själv'), tags: z.array(z.string()).optional(),
    },
    annotations: WRITE,
  }, async (args) => {
    const l = await api(auth, 'POST', '/leads', { ...args, source: 'manual', source_detail: 'Claude' });
    return ok({ id: l.id, name: leadName(l), company: l.company, company_id: l.company_id, url: link(`/leads/${l.id}`) }, 'Leadet är skapat.');
  });

  tool('update_lead', {
    title: 'Uppdatera lead',
    description: 'Ändrar uppgifter, status, taggar eller ansvarig på ett lead. Bara fälten som anges ändras.',
    inputSchema: {
      lead_id: id('Leadet'),
      first_name: z.string().optional(), last_name: z.string().optional(), email: z.string().optional(), phone: z.string().optional(),
      company: z.string().optional(), title: z.string().optional(), city: z.string().optional(),
      status: z.enum(['new', 'contacted', 'qualified', 'unqualified']).optional(),
      owner_id: z.number().int().positive().nullable().optional().describe('Ny ansvarig, null = ingen'),
      tags: z.array(z.string()).optional().describe('Ersätter alla taggar'),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, async ({ lead_id, ...changes }) => {
    const l = await api(auth, 'PATCH', `/leads/${lead_id}`, changes);
    return ok({ id: l.id, name: leadName(l), status: l.status, owner_id: l.owner_id, tags: l.tags, url: link(`/leads/${l.id}`) }, 'Leadet är uppdaterat.');
  });

  tool('log_activity', {
    title: 'Logga aktivitet',
    description: 'Loggar en anteckning, ett samtal, ett mejl eller ett möte i tidslinjen för ett lead, en affär eller ett företag. Ange exakt ett av lead_id, deal_id eller company_id.',
    inputSchema: {
      type: z.enum(['note', 'call', 'email', 'meeting']).describe('note = anteckning, call = samtal, email = mejl, meeting = möte'),
      content: z.string().min(1).describe('Vad som hände/sades'),
      lead_id: id('Leadet').optional(), deal_id: id('Affären').optional(), company_id: id('Företaget').optional(),
    },
    annotations: WRITE,
  }, async ({ type, content, ...target }) => {
    const a = await api(auth, 'POST', `${targetPath(target)}/activities`, { type, content });
    return ok(activityRow(a), 'Aktiviteten är loggad.');
  });

  tool('create_task', {
    title: 'Skapa uppgift',
    description: 'Skapar en uppgift (nästa steg) på ett lead, en affär eller ett företag. Ange exakt ett av lead_id, deal_id eller company_id.',
    inputSchema: {
      content: z.string().min(1).describe('Vad som ska göras, t.ex. "Ring och följ upp offerten"'),
      due_at: time('När uppgiften ska vara klar').optional(),
      lead_id: id('Leadet').optional(), deal_id: id('Affären').optional(), company_id: id('Företaget').optional(),
    },
    annotations: WRITE,
  }, async ({ content, due_at, ...target }) => {
    const a = await api(auth, 'POST', `${targetPath(target)}/activities`, { type: 'task', content, due_at: toUtc(due_at) });
    return ok(activityRow(a), 'Uppgiften är skapad.');
  });

  tool('complete_task', {
    title: 'Klarmarkera uppgift',
    description: 'Markerar en uppgift som klar (eller öppnar den igen), och kan flytta förfallotiden.',
    inputSchema: { task_id: id('Uppgiften'), done: z.boolean().optional().describe('Standard true'), due_at: time('Ny förfallotid').optional() },
    annotations: { ...WRITE, idempotentHint: true },
  }, async ({ task_id, done = true, due_at }) => {
    const a = await api(auth, 'PATCH', `/activities/${task_id}`, { done, ...(due_at && { due_at: toUtc(due_at) }) });
    return ok(activityRow(a), done ? 'Uppgiften är klar.' : 'Uppgiften är öppnad igen.');
  });

  tool('create_deal', {
    title: 'Skapa affär',
    description: 'Skapar en affär i pipelinen. Med lead_id konverteras leadet till en affär (som i appen); annars skapas affären på company_id. Lägg gärna till ett första nästa steg.',
    inputSchema: {
      title: z.string().optional().describe('Standard: "<Företag> – affär"'), value: z.number().min(0).optional().describe('Värde i kr exkl. moms'),
      lead_id: id('Leadet').optional(), company_id: id('Företaget').optional(),
      expected_close: z.string().optional().describe('Förväntat avslut, YYYY-MM-DD'),
      first_task: z.string().optional().describe('Första nästa steg, t.ex. "Boka demo"'), first_task_due_at: time('När första steget ska vara klart').optional(),
    },
    annotations: WRITE,
  }, async ({ title, value, lead_id, company_id, expected_close, first_task, first_task_due_at }) => {
    if (!lead_id && !company_id && !title) throw new ToolError('Ange lead_id, company_id eller en titel');
    let d;
    if (lead_id) d = await api(auth, 'POST', `/leads/${lead_id}/convert`, { title, value, expected_close, task: first_task ? { content: first_task, due_at: toUtc(first_task_due_at) } : undefined });
    else {
      const co = company_id ? await api(auth, 'GET', `/companies/${company_id}`) : null;
      d = await api(auth, 'POST', '/deals', { title: title || `${co.name} – affär`, value, company_id, expected_close });
      if (first_task) await api(auth, 'POST', `/deals/${d.id}/activities`, { type: 'task', content: first_task, due_at: toUtc(first_task_due_at) });
    }
    return ok({ id: d.id, title: d.title, value: d.value, stage: STAGES[d.stage], url: link(`/pipeline/${d.id}`) }, 'Affären är skapad.');
  });

  tool('update_deal', {
    title: 'Uppdatera affär',
    description: `Flyttar en affär till ett annat steg eller ändrar titel, värde, förväntat avslut eller ansvarig. Förlorad kräver lost_reason (${LOST_REASONS.join(', ')}). Vunnen gör kontakten till kund.`,
    inputSchema: {
      deal_id: id('Affären'),
      stage: z.enum(Object.keys(STAGES)).optional().describe(Object.entries(STAGES).map(([k, v]) => `${k} = ${v}`).join(', ')),
      lost_reason: z.enum(LOST_REASONS).optional(), lost_note: z.string().optional().describe('Kommentar till förlusten'),
      title: z.string().optional(), value: z.number().min(0).optional(), expected_close: z.string().nullable().optional(), owner_id: id('Ansvarig användare').optional(),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, async ({ deal_id, ...changes }) => {
    const d = await api(auth, 'PATCH', `/deals/${deal_id}`, changes);
    return ok(dealSummary(d), 'Affären är uppdaterad.');
  });

  tool('save_company_summary', {
    title: 'Spara företagsinfo',
    description: 'Sparar en kort sammanfattning om ett företag (som du tagit fram, t.ex. via webbsökning) under fliken Företagsinfo i LeadFlow. Ange company_id eller lead_id. Hitta inte på något – utelämna det du inte vet, och ange källorna.',
    inputSchema: {
      company_id: id('Företaget').optional(), lead_id: id('Leadet (dess företag används)').optional(),
      summary: z.string().min(10).describe('2–4 meningar: vad företaget gör och för vem'),
      industry: z.string().optional(), offering: z.string().optional().describe('Viktigaste produkter/tjänster'),
      customers: z.string().optional(), size: z.string().optional().describe('Anställda, omsättning, orter'),
      news: z.string().optional().describe('Något aktuellt'), sales_angle: z.string().optional().describe('Varför de kan vara intresserade och vad säljaren kan fråga om'),
      opening_line: z.string().optional(), sources: z.array(z.string()).optional().describe('Webbadresser du använt'),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, async ({ company_id, lead_id, sources = [], ...data }) => {
    if (!company_id && !lead_id) throw new ToolError('Ange company_id eller lead_id');
    const r = await api(auth, 'POST', `${lead_id ? `/leads/${lead_id}` : `/companies/${company_id}`}/enrichment`, { ...data, sources });
    return ok({ company_id: r.company.id, name: r.company.name, url: link(`/companies/${r.company.id}`) }, 'Företagsinfon är sparad.');
  });

  tool('book_meeting', {
    title: 'Boka möte',
    description: 'Bokar ett möte i användarens kalender (synkas till Google Kalender om den är kopplad), kopplat till ett lead och/eller en affär. En kvalificerad affär flyttas då till "Möte bokat".',
    inputSchema: {
      title: z.string().min(1), start: time('Starttid'), end: time('Sluttid').optional(), duration_minutes: z.number().int().min(5).max(600).optional().describe('Används om end saknas, standard 60'),
      lead_id: id('Leadet').optional(), deal_id: id('Affären').optional(),
      location: z.string().optional(), description: z.string().optional(),
      attendees: z.array(z.string()).optional().describe('E-postadresser till deltagare'),
      send_invites: z.boolean().optional().describe('Skicka Google-inbjudningar till deltagarna (fråga användaren först)'),
      create_meet: z.boolean().optional().describe('Skapa en Google Meet-länk'),
      owner_id: id('Användaren mötet bokas åt').optional(),
    },
    annotations: WRITE,
  }, async ({ start, end, duration_minutes = 60, ...b }) => {
    const startAt = toUtc(start);
    const endAt = end ? toUtc(end) : new Date(new Date(`${startAt.replace(' ', 'T')}Z`).getTime() + duration_minutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
    const m = await api(auth, 'POST', '/meetings', { ...b, start_at: startAt, end_at: endAt });
    return ok({ id: m.id, title: m.title, start_at: m.start_at, end_at: m.end_at, video_url: m.video_url, sync_error: m.sync_error, url: link(`/calendar?meeting=${m.id}`) }, 'Mötet är bokat.');
  });

  tool('add_deal_product', {
    title: 'Lägg till produkt på affär',
    description: 'Lägger till en produktrad på en affär (från produktlistan eller fritext). Affärens värde räknas om automatiskt.',
    inputSchema: {
      deal_id: id('Affären'), product_id: id('Produkten').optional(), name: z.string().optional().describe('Fritext om ingen produkt anges'),
      quantity: z.number().positive().optional(), unit_price: z.number().min(0).optional().describe('Pris per enhet i kr exkl. moms (standard: produktens pris)'),
      discount: z.number().min(0).max(100).optional().describe('Rabatt i procent'), description: z.string().optional(),
    },
    annotations: WRITE,
  }, async ({ deal_id, ...b }) => {
    const r = await api(auth, 'POST', `/deals/${deal_id}/items`, b);
    return ok({ deal_value: r.value, items: r.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, total: i.total })), totals: r.totals }, 'Produkten är tillagd.');
  });

  tool('create_quote', {
    title: 'Skapa offert',
    description: 'Skapar en offert av affärens produktrader och returnerar länken som kunden öppnar och signerar digitalt. Fråga användaren innan.',
    inputSchema: {
      deal_id: id('Affären'), title: z.string().optional(), intro: z.string().optional().describe('Inledande text till kunden'),
      valid_until: z.string().optional().describe('YYYY-MM-DD'), recipient_id: id('Kontaktpersonen (lead) som är mottagare').optional(),
    },
    annotations: WRITE,
  }, async ({ deal_id, ...b }) => {
    const q = await api(auth, 'POST', `/deals/${deal_id}/quotes`, b);
    return ok(quoteRow(q), 'Offerten är skapad. Skicka länken till kunden; när den öppnas och signeras syns det i affären.');
  });

  return server;
}

function targetPath({ lead_id, deal_id, company_id }) {
  const given = [lead_id && `/leads/${lead_id}`, deal_id && `/deals/${deal_id}`, company_id && `/companies/${company_id}`].filter(Boolean);
  if (given.length !== 1) throw new ToolError('Ange exakt ett av lead_id, deal_id eller company_id');
  return given[0];
}

const ACTIVITY_TYPES = { note: 'anteckning', call: 'samtal', email: 'mejl', meeting: 'möte', task: 'uppgift', system: 'händelse' };
const activityRow = (a) => ({
  id: a.id, type: ACTIVITY_TYPES[a.type] || a.type, content: a.content, by: a.user_name, via: a.via, at: a.created_at,
  due_at: a.due_at, done: a.type === 'task' ? !!a.done : undefined, deal: a.deal_title,
});

const quoteRow = (q) => ({
  id: q.id, number: q.number, title: q.title, status: q.status, total_excl_vat: q.total, valid_until: q.valid_until, recipient: q.recipient_name,
  sent_at: q.sent_at, viewed_at: q.viewed_at, signed_at: q.signed_at, signer_name: q.signer_name, declined_at: q.declined_at, decline_reason: q.decline_reason,
  customer_link: link(`/q/${q.token}`),
});
