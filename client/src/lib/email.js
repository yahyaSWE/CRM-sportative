import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Gmail-kopplingens status hämtas en gång per sidvisning och delas mellan komponenterna.
let cached = null;
let pending = null;

export function loadEmailStatus(force = false) {
  if (force) cached = null;
  if (cached) return Promise.resolve(cached);
  pending ||= api.get('/email/status').then((s) => { cached = s; return s; }).finally(() => { pending = null; });
  return pending;
}

export function useEmailStatus() {
  const [status, setStatus] = useState(cached);
  useEffect(() => { loadEmailStatus().then(setStatus).catch(() => setStatus({ canSend: false })); }, []);
  return status;
}
