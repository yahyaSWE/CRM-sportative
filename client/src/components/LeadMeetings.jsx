import { useState } from 'react';
import { CalendarPlus, Video, MapPin } from 'lucide-react';
import { useFetch, useLive } from '../lib/app.jsx';
import { cx } from './ui.jsx';
import MeetingModal, { parseUtc, fmtTime } from './MeetingModal.jsx';
import { tr, locale } from '../lib/i18n.js';

// Möten för ett lead eller en affär, med knapp för att boka nytt. Visas i lead- och affärspanelen.
export default function LeadMeetings({ leadId, dealId, preset, canBook, onChanged }) {
  const url = `/meetings?${dealId ? `deal_id=${dealId}` : `lead_id=${leadId}`}`;
  const { data, reload } = useFetch(url);
  const [modal, setModal] = useState(null);
  useLive('meeting', () => reload());
  const now = new Date();
  // Passerade möten utan utfall först, sedan de närmaste kommande.
  const scheduled = (data || []).filter((m) => m.status === 'scheduled');
  const list = [...scheduled.filter((m) => parseUtc(m.end_at) < now), ...scheduled.filter((m) => parseUtc(m.end_at) >= now).slice(0, 3)];
  const changed = () => { reload(); onChanged?.(); };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="label !mb-0">{tr("Möten")}</p>
        {canBook && <button onClick={() => setModal({ preset })} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"><CalendarPlus className="size-3.5" />{tr("Boka")}</button>}
      </div>
      {!list.length ? <p className="text-xs text-slate-400">{tr("Inga bokade möten")}</p> : (
        <ul className="space-y-1.5">
          {list.map((m) => {
            const past = parseUtc(m.end_at) < now;
            return (
              <li key={m.id}>
                <button onClick={() => setModal({ meetingId: m.id })} className={cx('w-full rounded-lg border px-2.5 py-2 text-left hover:border-slate-300', past ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white')}>
                  <p className="text-xs font-medium text-slate-800 truncate">{m.title}</p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    {parseUtc(m.start_at).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })} {!m.all_day && fmtTime(m.start_at)}
                    {m.video_url && <Video className="size-3" />}{m.location && <MapPin className="size-3" />}
                  </p>
                  {past && <p className="text-[11px] font-medium text-amber-700">{tr("Logga utfall")}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <MeetingModal open={!!modal} onClose={() => setModal(null)} meetingId={modal?.meetingId} preset={modal?.preset} onSaved={changed} />
    </div>
  );
}
