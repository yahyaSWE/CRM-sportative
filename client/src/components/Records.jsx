import { useState } from 'react';
import { CalendarClock, CheckSquare, AlertTriangle, RotateCcw, XCircle } from 'lucide-react';
import LeadDrawer from './LeadDrawer.jsx';
import DealDrawer from './DealDrawer.jsx';
import CompanyDrawer from './CompanyDrawer.jsx';
import { cx } from './ui.jsx';
import { dueLabel, timeAgo } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

// Öppnar lead- och affärspaneler direkt på sidan man står på, i stället för att byta sida.
export function useRecordDrawers(onChanged) {
  const [lead, setLead] = useState(null);
  const [deal, setDeal] = useState(null);
  const [company, setCompany] = useState(null);
  return {
    openLead: setLead,
    openDeal: setDeal,
    openCompany: setCompany,
    drawers: (
      <>
        {company && <CompanyDrawer id={company} onClose={() => setCompany(null)} onChanged={onChanged} />}
        {lead && <LeadDrawer id={lead} onClose={() => setLead(null)} onChanged={onChanged} />}
        {deal && <DealDrawer id={deal} onClose={() => setDeal(null)} onChanged={onChanged} />}
      </>
    ),
  };
}

// Nästa steg (uppgift eller möte) och när kunden senast kontaktades.
// Text för uppföljningsrytmens steg (uppgifter och möten visar sitt eget innehåll).
export const followupText = (step) => (step.kind === 'followup'
  ? (step.of > 1 ? tr('Kontakta igen · försök {n} av {of}', { n: step.attempt, of: step.of }) : tr('Kontakta igen'))
  : step.kind === 'close' ? tr(step.content) : step.content);

export function NextStepCell({ step, lastContact, status }) {
  const active = ['contacted', 'qualified', 'converted'].includes(status) || status === undefined;
  return (
    <div className="min-w-0 text-xs">
      {step ? (
        <p className={cx('flex items-center gap-1.5 truncate', dueLabel(step.due_at).cls === 'text-rose-600' ? 'text-rose-600 font-medium' : 'text-slate-700')}>
          {step.kind === 'meeting' ? <CalendarClock className="size-3.5 shrink-0 text-violet-500" />
            : step.kind === 'followup' ? <RotateCcw className="size-3.5 shrink-0 text-amber-500" />
            : step.kind === 'close' ? <XCircle className="size-3.5 shrink-0 text-slate-400" />
            : <CheckSquare className="size-3.5 shrink-0 text-brand-500" />}
          <span className="truncate">{followupText(step)}</span>
        </p>
      ) : active && status !== 'new' ? (
        <p className="flex items-center gap-1.5 text-amber-600"><AlertTriangle className="size-3.5" />{tr("Inget nästa steg")}</p>
      ) : <p className="text-slate-300">—</p>}
      <p className="mt-0.5 text-slate-400 truncate">
        {step && <span className={dueLabel(step.due_at).cls}>{dueLabel(step.due_at).short}</span>}
        {step && lastContact && ' · '}
        {lastContact ? tr('kontakt {0}', { 0: timeAgo(lastContact) }) : !step && status && status !== 'new' ? tr("ingen kontakt loggad") : ''}
      </p>
    </div>
  );
}
