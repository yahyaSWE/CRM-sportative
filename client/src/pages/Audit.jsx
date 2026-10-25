import { ScrollText } from 'lucide-react';
import { useFetch } from '../lib/app.jsx';
import { Card, PageHeader, Avatar, Spinner, Empty } from '../components/ui.jsx';
import { formatDateTime } from '../lib/meta.jsx';
import { tr } from '../lib/i18n.js';

const LABELS = {
  'user.login': tr("loggade in"), 'user.create': tr("skapade användare"), 'user.update': tr("uppdaterade användare"), 'user.password_changed': tr("bytte lösenord"),
  'workspace.create': tr("skapade arbetsyta"), 'workspace.rename': tr("bytte namn på arbetsytan"),
  'ai.connect': tr("kopplade en AI-assistent (MCP)"), 'ai.disconnect': tr("kopplade bort en AI-assistent"),
  'role.create': tr("skapade roll"), 'role.update': tr("ändrade behörigheter för roll"), 'role.delete': tr("raderade roll"),
  'lead.create': tr("skapade lead"), 'lead.update': tr("uppdaterade lead"), 'lead.delete': tr("raderade lead"), 'lead.convert': tr("konverterade lead till affär"),
  'lead.created': tr("tog emot nytt lead automatiskt"), 'lead.merged': tr("slog ihop inkommande lead med befintlig kontakt"),
  'leads.export': tr("exporterade leads"), 'leads.import': tr("importerade leads"), 'leads.bulk_assign': tr("tilldelade leads"), 'leads.bulk_status': tr("ändrade status på leads"),
  'leads.bulk_delete': tr("raderade leads"), 'leads.bulk_tag': tr("taggade leads"),
  'deal.create': tr("skapade affär"), 'deal.update': tr("uppdaterade affär"), 'deal.delete': tr("raderade affär"),
  'integration.create': tr("lade till integration"), 'integration.update': tr("ändrade integration"), 'integration.delete': tr("tog bort integration"),
  'automation.create': tr("skapade automatisering"), 'automation.update': tr("ändrade automatisering"), 'automation.delete': tr("raderade automatisering"),
};

export default function Audit() {
  const { data } = useFetch('/audit?limit=200');
  return (
    <div className="max-w-4xl">
      <PageHeader title={tr("Aktivitetslogg")} subtitle={tr("Spårbarhet över vem som gjort vad i systemet.")} />
      <Card>
        {!data ? <div className="py-16 grid place-items-center"><Spinner /></div> : !data.length ? <Empty icon={ScrollText} title={tr("Inget loggat än")} /> : (
          <ul className="divide-y divide-slate-100">
            {data.map((a) => {
              const details = a.details ? JSON.parse(a.details) : null;
              return (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  {a.user_name ? <Avatar name={a.user_name} color={a.user_color} size="sm" /> : <span className="grid place-items-center size-7 rounded-full bg-brand-50 text-[10px] font-bold text-brand-600">{tr("LF")}</span>}
                  <p className="flex-1 min-w-0 text-slate-700 truncate">
                    <span className="font-medium text-slate-900">{a.user_name || tr("LeadFlow")}</span> {LABELS[a.action] || a.action}
                    {a.entity_id && <span className="text-slate-400"> #{a.entity_id}</span>}
                    {details?.source && <span className="text-slate-400"> · {details.source}</span>}
                    {details?.via === 'claude' && <span className="text-orange-600"> · {tr('via Claude')}</span>}
                    {details?.count != null && <span className="text-slate-400"> · {details.count} {tr("st")}</span>}
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
