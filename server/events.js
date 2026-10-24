// Realtidshändelser till inloggade klienter via Server-Sent Events.
const clients = new Set();

export function sseHandler(req, res) {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(': connected\n\n');
  const client = { res, user: req.user };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(client); });
}

// `filter` avgör vilka användare som får händelsen (t.ex. bara de som får se leadet).
export function broadcast(type, data, filter = () => true) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) if (filter(c.user)) c.res.write(msg);
}
