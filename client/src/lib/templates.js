import { Mail, MessageSquare, PhoneCall } from 'lucide-react';
import { tr } from './i18n.js';

export const TEMPLATE_TYPES = {
  email: { label: tr('E-post'), icon: Mail, cls: 'bg-sky-50 text-sky-700' },
  message: { label: tr('Meddelande'), icon: MessageSquare, cls: 'bg-emerald-50 text-emerald-700' },
  call: { label: tr('Samtalsmanus'), icon: PhoneCall, cls: 'bg-violet-50 text-violet-700' },
};

// Fält som kan stå i mallar. Nycklarna är svenska och skrivs inom klammer, t.ex. {förnamn}.
export const VARIABLES = [
  { key: 'förnamn', label: tr('Förnamn'), from: (c) => c.lead?.first_name },
  { key: 'efternamn', label: tr('Efternamn'), from: (c) => c.lead?.last_name },
  { key: 'namn', label: tr('Fullständigt namn'), from: (c) => [c.lead?.first_name, c.lead?.last_name].filter(Boolean).join(' ') },
  { key: 'företag', label: tr('Företag'), from: (c) => c.lead?.company },
  { key: 'titel', label: tr('Befattning'), from: (c) => c.lead?.title },
  { key: 'ort', label: tr('Ort'), from: (c) => c.lead?.city },
  { key: 'e-post', label: tr('Kontaktens e-post'), from: (c) => c.lead?.email },
  { key: 'telefon', label: tr('Kontaktens telefon'), from: (c) => c.lead?.phone },
  { key: 'min_namn', label: tr('Mitt namn'), from: (c) => c.user?.name },
  { key: 'min_epost', label: tr('Min e-post'), from: (c) => c.user?.email },
  { key: 'mitt_företag', label: tr('Mitt företag'), from: (c) => c.company },
];

/** Ersätter {fält} med kontaktens och användarens uppgifter. Fält utan värde lämnas kvar så att de syns. */
export function fillTemplate(text, ctx) {
  if (!text) return '';
  return text.replace(/\{([\wåäöÅÄÖ-]+)\}/g, (m, key) => {
    const v = VARIABLES.find((x) => x.key === key.toLowerCase())?.from(ctx);
    return v ? String(v) : m;
  });
}

export const missingFields = (text) => [...new Set((text || '').match(/\{[\wåäöÅÄÖ-]+\}/g) || [])];

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // Reserv för webbläsare utan Clipboard API.
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export const fullText = (t, ctx) => (t.type === 'email' && t.subject
  ? `${tr('Ämne')}: ${fillTemplate(t.subject, ctx)}\n\n${fillTemplate(t.body, ctx)}`
  : fillTemplate(t.body, ctx));
