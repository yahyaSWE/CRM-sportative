import { Router } from 'express';
import { all, get, run, audit, findWorkspace, withWorkspace } from '../db.js';
import { can, readSession } from '../security.js';
import { requirePerm, parseCookies, COOKIE } from '../middleware.js';
import { broadcast } from '../events.js';
import { writeQuotePdf } from '../services/quotePdf.js';
import {
  getProfile, saveProfile, dealItems, totals, lineTotal, syncDealValue, createQuote, markSent, presentQuote, publicView, signQuote, declineQuote,
} from '../services/quotes.js';

const r = Router();
const RECURRING = ['none', 'monthly', 'yearly'];
const num = (v, d = 0) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));

// ---------- Produkter ----------
r.get('/products', (req, res) => {
  res.json(all(`SELECT p.*, (SELECT count(*) FROM deal_items WHERE product_id = p.id) AS used FROM products p
    WHERE ${req.query.all ? '1=1' : 'p.active = 1'} ORDER BY p.active DESC, sv_lower(p.name)`));
});

r.post('/products', requirePerm('products.manage'), (req, res) => {
  const b = req.body || {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'Ange produktens namn' });
  const ins = run('INSERT INTO products (name, sku, description, unit, price, vat_rate, recurring) VALUES (?,?,?,?,?,?,?)',
    b.name.trim(), b.sku || null, b.description || null, b.unit || 'st', num(b.price), num(b.vat_rate, 25), RECURRING.includes(b.recurring) ? b.recurring : 'none');
  audit(req.user.id, 'product.create', 'product', Number(ins.lastInsertRowid));
  res.status(201).json(get('SELECT * FROM products WHERE id = ?', ins.lastInsertRowid));
});

r.patch('/products/:id', requirePerm('products.manage'), (req, res) => {
  const p = get('SELECT * FROM products WHERE id = ?', req.params.id);
  if (!p) return res.status(404).json({ error: 'Hittades inte' });
  const b = { ...p, ...req.body };
  run('UPDATE products SET name = ?, sku = ?, description = ?, unit = ?, price = ?, vat_rate = ?, recurring = ?, active = ? WHERE id = ?',
    b.name, b.sku || null, b.description || null, b.unit || 'st', num(b.price), num(b.vat_rate, 25), RECURRING.includes(b.recurring) ? b.recurring : 'none', b.active ? 1 : 0, p.id);
  audit(req.user.id, 'product.update', 'product', p.id);
  res.json(get('SELECT * FROM products WHERE id = ?', p.id));
});

r.delete('/products/:id', requirePerm('products.manage'), (req, res) => {
  // Produkter som används på affärer arkiveras i stället för att raderas.
  if (get('SELECT 1 FROM deal_items WHERE product_id = ?', req.params.id)) run('UPDATE products SET active = 0 WHERE id = ?', req.params.id);
  else run('DELETE FROM products WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

// ---------- Säljarföretagets uppgifter på offerter ----------
r.get('/sales/profile', (req, res) => res.json(getProfile()));
r.patch('/sales/profile', requirePerm('products.manage'), (req, res) => {
  const allowed = ['name', 'org_nr', 'address', 'email', 'phone', 'website', 'validity_days', 'terms', 'logo', 'accent', 'footer'];
  const b = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  // Loggan sparas som PNG eller JPEG (gränssnittet konverterar andra format) och får vara högst ~450 kB.
  if (b.logo && (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(b.logo) || b.logo.length > 600_000)) return res.status(400).json({ error: 'Loggan måste vara en PNG- eller JPG-bild på högst 450 kB' });
  if (b.accent && !/^#[0-9a-f]{6}$/i.test(b.accent)) return res.status(400).json({ error: 'Ogiltig färg' });
  if (b.footer) b.footer = String(b.footer).slice(0, 500);
  res.json(saveProfile(b));
});

// ---------- Produktrader på affärer ----------
function loadDeal(req, res, edit) {
  const d = get('SELECT * FROM deals WHERE id = ?', Number(req.params.id));
  const visible = d && (can(req.user, 'leads.view_all') || d.owner_id === req.user.id);
  if (!visible) { res.status(404).json({ error: 'Affären hittades inte' }); return null; }
  if (edit && !(can(req.user, 'leads.edit_all') || (d.owner_id === req.user.id && can(req.user, 'leads.edit_own')))) {
    res.status(403).json({ error: 'Du kan inte ändra affären' }); return null;
  }
  return d;
}

function itemsResponse(dealId) {
  const items = dealItems(dealId).map((i) => ({ ...i, total: lineTotal(i) }));
  const quotes = all(`SELECT q.*, u.name AS created_by_name FROM quotes q LEFT JOIN users u ON u.id = q.created_by WHERE q.deal_id = ? ORDER BY q.id DESC`, dealId).map(presentQuote);
  return { items, totals: totals(items), quotes, value: get('SELECT value FROM deals WHERE id = ?', dealId)?.value };
}

r.get('/deals/:id/items', (req, res) => {
  const d = loadDeal(req, res);
  if (d) res.json(itemsResponse(d.id));
});

r.post('/deals/:id/items', (req, res) => {
  const d = loadDeal(req, res, true);
  if (!d) return;
  const b = req.body || {};
  const p = b.product_id ? get('SELECT * FROM products WHERE id = ?', Number(b.product_id)) : null;
  const name = b.name?.trim() || p?.name;
  if (!name) return res.status(400).json({ error: 'Välj en produkt eller skriv en rad' });
  const pos = get('SELECT coalesce(max(position), -1) + 1 AS p FROM deal_items WHERE deal_id = ?', d.id).p;
  run('INSERT INTO deal_items (deal_id, product_id, name, description, quantity, unit, unit_price, discount, vat_rate, recurring, position) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    d.id, p?.id ?? null, name, b.description ?? p?.description ?? null, num(b.quantity, 1), b.unit || p?.unit || 'st', num(b.unit_price, p?.price ?? 0),
    num(b.discount), num(b.vat_rate, p?.vat_rate ?? 25), RECURRING.includes(b.recurring) ? b.recurring : p?.recurring || 'none', pos);
  syncDealValue(d.id);
  broadcast('refresh', { entity: 'deals' });
  res.status(201).json(itemsResponse(d.id));
});

r.patch('/deals/:id/items/:itemId', (req, res) => {
  const d = loadDeal(req, res, true);
  if (!d) return;
  const i = get('SELECT * FROM deal_items WHERE id = ? AND deal_id = ?', req.params.itemId, d.id);
  if (!i) return res.status(404).json({ error: 'Raden finns inte' });
  const b = { ...i, ...req.body };
  run('UPDATE deal_items SET name = ?, description = ?, quantity = ?, unit = ?, unit_price = ?, discount = ?, vat_rate = ?, recurring = ?, position = ? WHERE id = ?',
    b.name, b.description || null, num(b.quantity, 1), b.unit || 'st', num(b.unit_price), Math.min(100, Math.max(0, num(b.discount))), num(b.vat_rate, 25),
    RECURRING.includes(b.recurring) ? b.recurring : 'none', num(b.position), i.id);
  syncDealValue(d.id);
  broadcast('refresh', { entity: 'deals' });
  res.json(itemsResponse(d.id));
});

r.delete('/deals/:id/items/:itemId', (req, res) => {
  const d = loadDeal(req, res, true);
  if (!d) return;
  run('DELETE FROM deal_items WHERE id = ? AND deal_id = ?', req.params.itemId, d.id);
  syncDealValue(d.id);
  broadcast('refresh', { entity: 'deals' });
  res.json(itemsResponse(d.id));
});

// ---------- Offerter ----------
r.post('/deals/:id/quotes', (req, res) => {
  const d = loadDeal(req, res, true);
  if (!d) return;
  try { const q = createQuote(req.user, d, req.body || {}); res.status(201).json(presentQuote(q)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

function loadQuote(req, res) {
  const q = get('SELECT * FROM quotes WHERE id = ?', Number(req.params.id));
  if (!q) { res.status(404).json({ error: 'Offerten finns inte' }); return null; }
  req.params.id = q.deal_id;
  return loadDeal(req, res, true) ? q : null;
}

// Offerten som PDF, för att ladda ned och skicka manuellt.
const pdfName = (q) => `Offert-${q.number}.pdf`;
function sendPdf(res, q, disposition = 'attachment') {
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${pdfName(q)}"`, 'Cache-Control': 'private, no-store' });
  writeQuotePdf(q, getProfile(), res);
}

r.get('/quotes/:id/pdf', (req, res) => {
  const q = get('SELECT * FROM quotes WHERE id = ?', Number(req.params.id));
  if (!q) return res.status(404).json({ error: 'Offerten finns inte' });
  req.params.id = q.deal_id;
  if (!loadDeal(req, res)) return;
  audit(req.user.id, 'quote.pdf', 'quote', q.id);
  sendPdf(res, q, req.query.inline ? 'inline' : 'attachment');
});

r.post('/quotes/:id/sent', (req, res) => {
  const q = loadQuote(req, res);
  if (!q) return;
  markSent(req.user, q);
  res.json(presentQuote(get('SELECT * FROM quotes WHERE id = ?', q.id)));
});

r.delete('/quotes/:id', (req, res) => {
  const q = loadQuote(req, res);
  if (!q) return;
  if (q.status === 'accepted') return res.status(400).json({ error: 'En signerad offert kan inte tas bort' });
  run('DELETE FROM quotes WHERE id = ?', q.id);
  audit(req.user.id, 'quote.delete', 'quote', q.id, { number: q.number });
  res.json({ ok: true });
});

// Internt: visa signerad offert med signaturbild (för säljaren).
r.get('/quotes/:id/signature', (req, res) => {
  const q = loadQuote(req, res);
  if (q) res.json({ signature: q.signature, signer_ip: q.signer_ip, signer_agent: q.signer_agent, content_hash: q.content_hash });
});

export default r;

// ---------- Publikt: kundens offertsida (hemlig länk, ingen inloggning) ----------
export const publicQuotes = Router();
const wrap = (fn) => (req, res) => { try { res.json(fn(req)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } };

// Offertlänken innehåller bara offertens token; förfrågan körs i arbetsytan där offerten finns.
publicQuotes.use('/quotes/:token', (req, res, next) => {
  const ws = findWorkspace(() => !!get('SELECT 1 FROM quotes WHERE token = ?', req.params.token));
  if (!ws) return res.status(404).json({ error: 'Offerten finns inte eller har tagits bort' });
  withWorkspace(ws, next);
});

publicQuotes.get('/quotes/:token', (req, res) => {
  // Inloggade användare (t.ex. säljaren som förhandsgranskar) räknas inte som att kunden öppnat offerten.
  const internal = readSession(parseCookies(req.headers.cookie)[COOKIE]);
  const v = publicView(req.params.token, { track: !internal && req.query.preview !== '1' });
  return v ? res.json(v) : res.status(404).json({ error: 'Offerten finns inte eller har tagits bort' });
});
// Kunden kan ladda ned offerten (räknas inte som en visning).
publicQuotes.get('/quotes/:token/pdf', (req, res) => {
  const q = get('SELECT * FROM quotes WHERE token = ?', req.params.token);
  if (!q) return res.status(404).json({ error: 'Offerten finns inte eller har tagits bort' });
  sendPdf(res, q);
});
publicQuotes.post('/quotes/:token/sign', wrap((req) => signQuote(req.params.token, req.body || {}, { ip: req.ip, agent: req.get('user-agent') })));
publicQuotes.post('/quotes/:token/decline', wrap((req) => declineQuote(req.params.token, req.body?.reason)));
