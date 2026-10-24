// E-post: hämtar leads automatiskt från en inkorg (IMAP) eller via vidarebefordran (inbound webhook).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { get, run } from '../db.js';
import { ingestLead } from '../services/leads.js';

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(?:\+|00)?\d[\d\s\-()]{6,}\d/;

// Plockar ut "Nyckel: värde"-rader – vanligt i notiser från kontaktformulär (WordPress, Wix, Webflow m.fl.).
export function parseKeyValues(text = '') {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*\*?([A-Za-zÅÄÖåäö][\wÅÄÖåäö \-/]{0,30}?)\*?\s*[:：]\s*(.+?)\s*$/);
    if (m && !/^(https?|mailto)$/i.test(m[1])) out[m[1].trim()] = m[2];
  }
  return out;
}

export function emailToLead({ fromName, fromAddress, replyTo, subject, text, cfg = {} }) {
  const kv = parseKeyValues(text);
  const raw = { ...kv };
  const hasFormEmail = Object.entries(kv).some(([k, v]) => /mail|epost|e-post/i.test(k) && EMAIL_RE.test(v));
  const senderIsSystem = /no-?reply|noreply|wordpress|mailer|notification|forms?@/i.test(fromAddress || '');
  if (!hasFormEmail) {
    const addr = replyTo || (!senderIsSystem ? fromAddress : null) || text.match(EMAIL_RE)?.[0];
    if (addr) raw.email = addr;
    if (fromName && !senderIsSystem && !Object.keys(kv).some((k) => /namn|name/i.test(k))) raw.name = fromName;
  }
  if (!Object.keys(kv).some((k) => /tel|phone|mobil/i.test(k))) {
    const phone = text.match(PHONE_RE)?.[0];
    if (phone && phone.replace(/\D/g, '').length >= 8) raw.phone = phone;
  }
  const body = text.trim().slice(0, 4000);
  if (!Object.keys(kv).some((k) => /meddelande|message|kommentar/i.test(k))) raw.message = body;
  raw.amne = subject;
  if (cfg.subjectFilter && !String(subject || '').toLowerCase().includes(cfg.subjectFilter.toLowerCase())) return null;
  return raw;
}

function shouldSkip(parsed, cfg) {
  const from = parsed.from?.value?.[0]?.address || '';
  const auto = parsed.headers.get('auto-submitted');
  if (auto && auto !== 'no') return true;
  if (parsed.headers.get('x-autoreply') || parsed.headers.get('x-autorespond')) return true;
  const ignore = (cfg.ignoreFrom || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return ignore.some((i) => from.toLowerCase().includes(i));
}

export async function pollImap(integ) {
  const cfg = integ.cfg;
  if (!cfg.host || !cfg.user || !cfg.password) throw new Error('Server, användarnamn och lösenord krävs');
  const client = new ImapFlow({
    host: cfg.host, port: Number(cfg.port || 993), secure: cfg.secure !== false,
    auth: { user: cfg.user, pass: cfg.password }, logger: false, socketTimeout: 60000,
  });
  const stateKey = `imap:${integ.id}`;
  const state = JSON.parse(get('SELECT value FROM settings WHERE key = ?', stateKey)?.value || '{}');
  let imported = 0, seen = 0;
  await client.connect();
  try {
    const mailbox = cfg.mailbox || 'INBOX';
    const lock = await client.getMailboxLock(mailbox);
    try {
      const validity = String(client.mailbox.uidValidity);
      const fresh = state.uidValidity !== validity;
      const query = fresh
        ? { since: new Date(Date.now() - Number(cfg.backfillDays ?? 3) * 864e5) }
        : { uid: `${state.lastUid + 1}:*` };
      const uids = (await client.search(query, { uid: true })) || [];
      let lastUid = fresh ? 0 : state.lastUid;
      for (const uid of uids.sort((a, b) => a - b)) {
        if (!fresh && uid <= state.lastUid) continue;
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg?.source) continue;
        seen++;
        const parsed = await simpleParser(msg.source);
        lastUid = Math.max(lastUid, uid);
        if (shouldSkip(parsed, cfg)) continue;
        const raw = emailToLead({
          fromName: parsed.from?.value?.[0]?.name, fromAddress: parsed.from?.value?.[0]?.address,
          replyTo: parsed.replyTo?.value?.[0]?.address, subject: parsed.subject,
          text: parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, ' ') : ''), cfg,
        });
        if (!raw) continue;
        const r = ingestLead({
          source: 'email', sourceDetail: parsed.subject?.slice(0, 120) || cfg.user,
          externalId: parsed.messageId || `${validity}:${uid}`, integrationId: integ.id, raw,
          payload: { from: parsed.from?.text, subject: parsed.subject, date: parsed.date },
        });
        if (r.result === 'created') imported++;
        if (cfg.markSeen) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }
      run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        stateKey, JSON.stringify({ uidValidity: validity, lastUid }));
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }
  return { imported, scanned: seen };
}

export async function testImap(cfg) {
  const client = new ImapFlow({
    host: cfg.host, port: Number(cfg.port || 993), secure: cfg.secure !== false,
    auth: { user: cfg.user, pass: cfg.password }, logger: false,
  });
  await client.connect();
  const status = await client.status(cfg.mailbox || 'INBOX', { messages: true, unseen: true });
  await client.logout();
  return { mailbox: cfg.mailbox || 'INBOX', messages: status.messages, unseen: status.unseen };
}

// Inkommande e-post via webhook (Mailgun, SendGrid Inbound Parse, Postmark, Zapier m.fl.)
export function ingestInboundEmail(integ, body) {
  const pick = (...keys) => keys.map((k) => body[k]).find((v) => v != null && v !== '');
  const fromRaw = String(pick('from', 'From', 'sender', 'FromFull') || '');
  const fromAddress = (typeof body.FromFull === 'object' ? body.FromFull.Email : fromRaw.match(EMAIL_RE)?.[0]) || null;
  const fromName = (typeof body.FromFull === 'object' ? body.FromFull.Name : fromRaw.replace(/<.*>/, '').replace(/"/g, '').trim()) || null;
  const subject = pick('subject', 'Subject') || '';
  const text = String(pick('text', 'body-plain', 'TextBody', 'stripped-text', 'plain') || String(pick('html', 'body-html', 'HtmlBody') || '').replace(/<[^>]+>/g, ' '));
  const replyTo = String(pick('reply_to', 'Reply-To', 'ReplyTo') || '').match(EMAIL_RE)?.[0];
  const raw = emailToLead({ fromName, fromAddress, replyTo, subject, text, cfg: integ.cfg });
  if (!raw) return { result: 'skipped' };
  return ingestLead({
    source: 'email', sourceDetail: subject.slice(0, 120) || 'Vidarebefordrad e-post',
    externalId: pick('Message-Id', 'message-id', 'MessageID', 'messageId') || null,
    integrationId: integ.id, raw, payload: { from: fromRaw, subject },
  });
}
