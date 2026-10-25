// Mallar för e-post, meddelanden (SMS/LinkedIn) och samtalsmanus som hela teamet delar.
// Texten kan innehålla fält som {förnamn} och {företag}; de fylls i i appen när mallen används för en kontakt.
import { Router } from 'express';
import { all, get, run, audit, onWorkspaceOpen } from '../db.js';
import { can } from '../security.js';
import { requirePerm } from '../middleware.js';

const r = Router();
export const TEMPLATE_TYPES = ['email', 'message', 'call'];

const STARTERS = [
  ['email', 'Uppföljning efter samtal', 'Tack för samtalet, {förnamn}!',
    'Hej {förnamn},\n\nTack för ett trevligt samtal idag. Som utlovat skickar jag en kort sammanfattning av det vi pratade om.\n\n[Sammanfattning]\n\nHör gärna av dig om du har frågor. Jag ringer dig nästa vecka för att stämma av.\n\nVänliga hälsningar\n{min_namn}\n{mitt_företag}'],
  ['email', 'Första kontakt', 'Hej {förnamn} – en fråga om {företag}',
    'Hej {förnamn},\n\nJag heter {min_namn} och arbetar på {mitt_företag}. Vi hjälper företag som {företag} att [värde].\n\nHar du 15 minuter nästa vecka för ett kort samtal?\n\nVänliga hälsningar\n{min_namn}\n{min_epost}'],
  ['message', 'SMS – missat samtal', null,
    'Hej {förnamn}! Det här är {min_namn} på {mitt_företag}. Jag sökte dig nyss angående din förfrågan. När passar det att jag ringer igen?'],
  ['call', 'Samtalsmanus – ny lead', null,
    '1. Hälsa och presentera dig: "Hej {förnamn}, det är {min_namn} från {mitt_företag}."\n2. Referera till förfrågan: "Du hörde av dig om …"\n3. Behov: Vad vill ni uppnå? Hur gör ni idag? När behöver det vara klart?\n4. Beslut: Vem mer är med och bestämmer?\n5. Nästa steg: boka möte eller demo innan samtalet avslutas.'],
];

// Varje arbetsyta får några exempelmallar första gången, så att fliken inte är tom.
onWorkspaceOpen(() => {
  if (get("SELECT 1 FROM settings WHERE key = 'seeded:templates'")) return;
  if (!get('SELECT 1 FROM templates LIMIT 1')) for (const [type, name, subject, body] of STARTERS) run('INSERT INTO templates (type, name, subject, body) VALUES (?,?,?,?)', type, name, subject, body);
  run("INSERT INTO settings (key, value) VALUES ('seeded:templates', '1')");
});

const canEdit = (user, t) => can(user, 'leads.edit_all') || t.created_by === user.id || (t.created_by == null && can(user, 'leads.edit_own'));
const present = (user) => (t) => ({ ...t, canEdit: canEdit(user, t) });
const load = (id) => get(`SELECT t.*, cu.name AS created_by_name, uu.name AS updated_by_name FROM templates t
  LEFT JOIN users cu ON cu.id = t.created_by LEFT JOIN users uu ON uu.id = t.updated_by WHERE t.id = ?`, id);

function clean(b, existing = {}) {
  const t = { ...existing, ...b };
  return {
    type: TEMPLATE_TYPES.includes(t.type) ? t.type : 'email',
    name: String(t.name || '').trim(),
    subject: t.type === 'email' ? String(t.subject || '').trim() || null : null,
    body: String(t.body || ''),
  };
}

r.get('/templates', (req, res) => {
  const { type } = req.query;
  const rows = all(`SELECT t.*, cu.name AS created_by_name, uu.name AS updated_by_name FROM templates t
    LEFT JOIN users cu ON cu.id = t.created_by LEFT JOIN users uu ON uu.id = t.updated_by
    ${TEMPLATE_TYPES.includes(type) ? 'WHERE t.type = ?' : ''} ORDER BY t.use_count DESC, t.name COLLATE NOCASE`, ...(TEMPLATE_TYPES.includes(type) ? [type] : []));
  res.json(rows.map(present(req.user)));
});

r.post('/templates', requirePerm('leads.edit_own'), (req, res) => {
  const t = clean(req.body || {});
  if (!t.name || !t.body.trim()) return res.status(400).json({ error: 'Ange namn och text för mallen' });
  const id = Number(run('INSERT INTO templates (type, name, subject, body, created_by, updated_by) VALUES (?,?,?,?,?,?)', t.type, t.name, t.subject, t.body, req.user.id, req.user.id).lastInsertRowid);
  audit(req.user.id, 'template.create', 'template', id, { name: t.name });
  res.status(201).json(present(req.user)(load(id)));
});

r.patch('/templates/:id', (req, res) => {
  const existing = get('SELECT * FROM templates WHERE id = ?', Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Mallen finns inte' });
  if (!canEdit(req.user, existing)) return res.status(403).json({ error: 'Du kan bara ändra dina egna mallar' });
  const t = clean(req.body || {}, existing);
  if (!t.name || !t.body.trim()) return res.status(400).json({ error: 'Ange namn och text för mallen' });
  run("UPDATE templates SET type = ?, name = ?, subject = ?, body = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?", t.type, t.name, t.subject, t.body, req.user.id, existing.id);
  audit(req.user.id, 'template.update', 'template', existing.id, { name: t.name });
  res.json(present(req.user)(load(existing.id)));
});

r.delete('/templates/:id', (req, res) => {
  const existing = get('SELECT * FROM templates WHERE id = ?', Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Mallen finns inte' });
  if (!canEdit(req.user, existing)) return res.status(403).json({ error: 'Du kan bara ändra dina egna mallar' });
  run('DELETE FROM templates WHERE id = ?', existing.id);
  audit(req.user.id, 'template.delete', 'template', existing.id, { name: existing.name });
  res.json({ ok: true });
});

// Räknar användningar, så att de mest använda mallarna hamnar först.
r.post('/templates/:id/used', (req, res) => {
  run('UPDATE templates SET use_count = use_count + 1 WHERE id = ?', Number(req.params.id));
  res.json({ ok: true });
});

export default r;
