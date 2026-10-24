import { ScrollText } from 'lucide-react';
import { useFetch } from '../lib/app.jsx';
import { Card, PageHeader, Avatar, Spinner, Empty } from '../components/ui.jsx';
import { formatDateTime } from '../lib/meta.jsx';

const LABELS = {
  'user.login': 'loggade in', 'user.create': 'skapade användare', 'user.update': 'uppdaterade användare', 'user.password_changed': 'bytte lösenord',
  'role.create': 'skapade roll', 'role.update': 'ändrade behörigheter för roll', 'role.delete': 'raderade roll',
  'lead.create': 'skapade lead', 'lead.update': 'uppdaterade lead', 'lead.delete': 'raderade lead', 'lead.convert': 'konverterade lead till affär',
  'lead.created': 'tog emot nytt lead automatiskt', 'lead.merged': 'slog ihop inkommande lead med befintlig kontakt',
  'leads.export': 'exporterade leads', 'leads.import': 'importerade leads', 'leads.bulk_assign': 'tilldelade leads', 'leads.bulk_status': 'ändrade status på leads',
  'leads.bulk_delete': 'raderade leads', 'leads.bulk_tag': 'taggade leads',
  'deal.create': 'skapade affär', 'deal.update': 'uppdaterade affär', 'deal.delete': 'raderade affär',
  'integration.create': 'lade till integration', 'integration.update': 'ändrade integration', 'integration.delete': 'tog bort integration',
  'automation.create': 'skapade automatisering', 'automation.update': 'ändrade automatisering', 'automation.delete': 'raderade automatisering',
};

export default function Audit() {
  const { data } = useFetch('/audit?limit=200');
  return (
    <div className="max-w-4xl">
      <PageHeader title="Aktivitetslogg" subtitle="Spårbarhet över vem som gjort vad i systemet." />
      <Card>
        {!data ? <div className="py-16 grid place-items-center"><Spinner /></div> : !data.length ? <Empty icon={ScrollText} title="Inget loggat än" /> : (
          <ul className="divide-y divide-slate-100">
            {data.map((a) => {
              const details = a.details ? JSON.parse(a.details) : null;
              return (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  {a.user_name ? <Avatar name={a.user_name} color={a.user_color} size="sm" /> : <span className="grid place-items-center size-7 rounded-full bg-brand-50 text-[10px] font-bold text-brand-600">LF</span>}
                  <p className="flex-1 min-w-0 text-slate-700 truncate">
                    <span className="font-medium text-slate-900">{a.user_name || 'LeadFlow'}</span> {LABELS[a.action] || a.action}
                    {a.entity_id && <span className="text-slate-400"> #{a.entity_id}</span>}
                    {details?.source && <span className="text-slate-400"> · {details.source}</span>}
                    {details?.count != null && <span className="text-slate-400"> · {details.count} st</span>}
                  </p>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{formatDateTime(a.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
