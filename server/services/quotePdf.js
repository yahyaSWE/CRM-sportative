// Offert som PDF (A4) – samma innehåll som kundens offertsida, med företagets logga, färg och sidfot.
// Innehållet tas från offertens låsta ögonblicksbild (content), så PDF:en matchar det kunden signerar.
import PDFDocument from 'pdfkit';
import { parseJSON } from '../db.js';
import { quoteStatus } from './quotes.js';

const RECURRING = { none: '', monthly: '/mån', yearly: '/år' };
const kr = (n) => new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n || 0);
const day = (s) => (s ? String(s).slice(0, 10) : '');
const dataImage = (s) => (typeof s === 'string' && /^data:image\/(png|jpeg);base64,/.test(s) ? Buffer.from(s.split(',')[1], 'base64') : null);

const GRAY = '#64748b', DARK = '#0f172a', LIGHT = '#e2e8f0';

/** Skriver offerten som PDF till `out` (en skrivbar ström, t.ex. Express-svaret). */
export function writeQuotePdf(q, profile, out) {
  const c = parseJSON(q.content, {});
  const accent = /^#[0-9a-f]{6}$/i.test(profile.accent || '') ? profile.accent : '#4f46e5';
  const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 70, left: 50, right: 50 }, bufferPages: true,
    info: { Title: `Offert ${q.number} – ${q.title}`, Author: c.seller?.name || '', Subject: q.title } });
  doc.pipe(out);
  const left = doc.page.margins.left, right = doc.page.width - doc.page.margins.right, width = right - left;
  const label = (text, x, y, opts = {}) => doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GRAY).text(text.toUpperCase(), x, y, { characterSpacing: 0.6, ...opts });

  // ---------- Sidhuvud: logga/företagsnamn till vänster, offertuppgifter till höger ----------
  doc.rect(0, 0, doc.page.width, 6).fill(accent);
  let y = 50;
  const logo = dataImage(profile.logo);
  if (logo) {
    try { doc.image(logo, left, y, { fit: [170, 60] }); y += 68; } catch { /* trasig bild – visa namnet i stället */ }
  }
  doc.font('Helvetica-Bold').fontSize(logo ? 11 : 16).fillColor(DARK).text(c.seller?.name || '', left, y, { width: width / 2 });
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text([c.seller?.address, c.seller?.org_nr && `Org.nr ${c.seller.org_nr}`, c.seller?.website].filter(Boolean).join('\n'), left, doc.y + 2, { width: width / 2 });
  const leftBottom = doc.y;

  label('Offert', left + width / 2, 50, { width: width / 2, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK).text(q.number, left + width / 2, 62, { width: width / 2, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(GRAY)
    .text(`Datum ${day(q.created_at)}\nGiltig t.o.m. ${day(q.valid_until)}`, left + width / 2, doc.y + 2, { width: width / 2, align: 'right' });
  y = Math.max(leftBottom, doc.y) + 18;
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(LIGHT).stroke();

  // ---------- Mottagare och kontaktperson ----------
  y += 14;
  label('Till', left, y);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(c.customer?.company || c.customer?.name || '', left, y + 12, { width: width / 2 - 10 });
  doc.font('Helvetica').fontSize(9).fillColor('#334155').text([
    c.customer?.org_nr && `Org.nr ${c.customer.org_nr}`, c.customer?.address, c.customer?.company && c.customer?.name && `Att: ${c.customer.name}`, c.customer?.email,
  ].filter(Boolean).join('\n'), { width: width / 2 - 10 });
  const custBottom = doc.y;
  label('Din kontaktperson', left + width / 2, y);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(c.contact?.name || '', left + width / 2, y + 12, { width: width / 2 });
  doc.font('Helvetica').fontSize(9).fillColor('#334155').text([c.contact?.email, c.seller?.phone].filter(Boolean).join('\n'), { width: width / 2 });
  y = Math.max(custBottom, doc.y) + 22;

  // ---------- Rubrik och inledning ----------
  doc.font('Helvetica-Bold').fontSize(17).fillColor(DARK).text(q.title, left, y, { width });
  if (q.intro) doc.moveDown(0.4).font('Helvetica').fontSize(10).fillColor('#334155').text(q.intro, { width, lineGap: 2 });
  y = doc.y + 16;

  // ---------- Rader ----------
  const cols = [
    { key: 'name', title: 'Beskrivning', w: width - 315, align: 'left' },
    { key: 'qty', title: 'Antal', w: 90, align: 'right' },
    { key: 'price', title: 'À-pris', w: 80, align: 'right' },
    { key: 'disc', title: 'Rabatt', w: 50, align: 'right' },
    { key: 'sum', title: 'Summa', w: 95, align: 'right' },
  ];
  const tableHead = () => {
    let x = left;
    for (const col of cols) { label(col.title, x, y, { width: col.w - (col.align === 'right' ? 0 : 8), align: col.align }); x += col.w; }
    y += 13;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1.2).strokeColor(DARK).stroke();
    y += 7;
  };
  // Ny sida vid behov; tabellhuvudet upprepas bara när själva tabellen fortsätter.
  const room = (h, inTable = false) => {
    if (y + h <= doc.page.height - doc.page.margins.bottom) return;
    doc.addPage();
    y = doc.page.margins.top;
    if (inTable) tableHead();
  };
  tableHead();
  for (const i of c.items || []) {
    const rec = RECURRING[i.recurring] || '';
    const cells = {
      qty: `${kr(i.quantity)} ${i.unit || ''}`.trim(), price: `${kr(i.unit_price)} kr${rec}`, disc: i.discount ? `${kr(i.discount)} %` : '–', sum: `${kr(i.total)} kr${rec}`,
    };
    doc.font('Helvetica-Bold').fontSize(9.5);
    const nameH = doc.heightOfString(i.name, { width: cols[0].w - 8 });
    doc.font('Helvetica').fontSize(8.5);
    const descH = i.description ? doc.heightOfString(i.description, { width: cols[0].w - 8 }) + 2 : 0;
    const rowH = Math.max(nameH + descH, 12) + 10;
    room(rowH, true);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(DARK).text(i.name, left, y, { width: cols[0].w - 8 });
    if (i.description) doc.font('Helvetica').fontSize(8.5).fillColor(GRAY).text(i.description, left, doc.y + 2, { width: cols[0].w - 8 });
    let x = left + cols[0].w;
    for (const col of cols.slice(1)) {
      doc.font(col.key === 'sum' ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(DARK).text(cells[col.key], x, y, { width: col.w, align: 'right' });
      x += col.w;
    }
    y += rowH;
    doc.moveTo(left, y - 5).lineTo(right, y - 5).lineWidth(0.5).strokeColor(LIGHT).stroke();
  }

  // ---------- Summor ----------
  const t = c.totals || {};
  const rows = [['Summa exkl. moms', t.subtotal], ...Object.entries(t.vatByRate || {}).map(([r, v]) => [`Moms ${r} %`, v])];
  room(rows.length * 15 + 40);
  y += 6;
  const tx = right - 220;
  for (const [k, v] of rows) {
    doc.font('Helvetica').fontSize(9.5).fillColor('#334155').text(k, tx, y, { width: 120 }).text(`${kr(v)} kr`, tx + 120, y, { width: 100, align: 'right' });
    y += 15;
  }
  doc.moveTo(tx, y + 2).lineTo(right, y + 2).lineWidth(1.2).strokeColor(DARK).stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(DARK).text('Att betala', tx, y, { width: 120 }).text(`${kr(t.total)} kr`, tx + 100, y, { width: 120, align: 'right' });
  y += 20;
  if ((c.items || []).some((i) => i.recurring && i.recurring !== 'none')) {
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text('Rader markerade /mån eller /år faktureras löpande.', tx, y, { width: 220, align: 'right' });
    y += 14;
  }

  // ---------- Villkor ----------
  if (q.terms) {
    doc.font('Helvetica').fontSize(9);
    room(doc.heightOfString(q.terms, { width }) + 30);
    y += 12;
    label('Villkor', left, y);
    doc.font('Helvetica').fontSize(9).fillColor('#334155').text(q.terms, left, y + 12, { width, lineGap: 1.5 });
    y = doc.y;
  }

  // ---------- Signering ----------
  const status = quoteStatus(q);
  if (status === 'accepted' && q.signed_at) {
    room(120);
    y += 18;
    label('Signerad', left, y);
    const sig = dataImage(q.signature);
    if (sig) { try { doc.image(sig, left, y + 12, { fit: [180, 55] }); } catch { /* ignorera */ } }
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(`${q.signer_name}${q.signer_title ? `, ${q.signer_title}` : ''}`, left, y + 72);
    doc.font('Helvetica').fontSize(8.5).fillColor(GRAY).text(`${q.signer_email || ''} · ${String(q.signed_at).slice(0, 16)} (UTC)`, left, doc.y + 1)
      .text(`Kontrollsumma ${q.content_hash}`, left, doc.y + 2, { width });
  } else if (status !== 'declined') {
    room(70);
    y += 26;
    doc.font('Helvetica').fontSize(9).fillColor('#334155')
      .text('Godkänn offerten genom att signera den digitalt via länken du fått, eller kontakta din kontaktperson.', left, y, { width });
  }

  // ---------- Sidfot på varje sida ----------
  const pages = doc.bufferedPageRange();
  for (let n = 0; n < pages.count; n++) {
    doc.switchToPage(pages.start + n);
    const fy = doc.page.height - 45;
    doc.page.margins.bottom = 0; // annars skapar text i marginalen en ny sida
    doc.moveTo(left, fy - 8).lineTo(right, fy - 8).lineWidth(0.5).strokeColor(LIGHT).stroke();
    const footer = profile.footer || [c.seller?.name, c.seller?.email, c.seller?.phone].filter(Boolean).join(' · ');
    doc.font('Helvetica').fontSize(7.5).fillColor(GRAY).text(footer, left, fy, { width: width - 80, lineGap: 1 });
    doc.text(`Sida ${n + 1} av ${pages.count}`, right - 80, fy, { width: 80, align: 'right' });
  }
  doc.end();
}
