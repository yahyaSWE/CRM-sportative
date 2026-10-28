import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Building2, Globe, Phone, Mail, MapPin, Briefcase, UserPlus, Plus, Trash2, Merge, ShieldCheck, Factory, Hash, Star, Sparkles, ShoppingCart } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useLive } from '../lib/app.jsx';
import { Avatar, Button, Select, Spinner, Modal, Field, Input, Confirm, Badge, useToast, cx } from './ui.jsx';
import { ActivityComposer, Timeline } from './Activity.jsx';
import { EditableField } from './LeadDrawer.jsx';
import { STAGES, sek, formatDate, leadName } from '../lib/meta.jsx';
import { NextStepCell } from './Records.jsx';
import { tr } from '../lib/i18n.js';
import CompanyInsight from './CompanyInsight.jsx';
import Purchasing from './Purchasing.jsx';

function NewContact({ companyId, onSaved, onCancel }) {
  const toast = useToast();
  const [f, setF] = useState({ first_name: '', last_name: '', title: '', email: '', phone: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault();
    try { await api.post('/leads', { ...f, company_id: companyId, source: 'manual' }); toast(tr("Kontakten lades till")); onSaved(); }
    catch (err) { toast(err.message, 'error'); }
  };
  return (
    <form onSubmit={save} className="card p-3 space-y-2 animate-fade-in">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder={tr("Förnamn")} value={f.first_name} onChange={set('first_name')} autoFocus />
        <Input placeholder={tr("Efternamn")} value={f.last_name} onChange={set('last_name')} />
        <Input placeholder={tr("Roll, t.ex. Inköpschef")} value={f.title} onChange={set('title')} className="col-span-2" />
        <Input placeholder={tr("E-post")} type="email" value={f.email} onChange={set('email')} />
        <Input placeholder={tr("Telefon")} value={f.phone} onChange={set('phone')} />
      </div>
      <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" type="button" onClick={onCancel}>{tr("Avbryt")}</Button><Button size="sm" type="submit">{tr("Lägg till")}</Button></div>
    </form>
  );
}

export default function CompanyDrawer({ id, onClose, onChanged }) {
  const { team, can } = useApp();
  const toast = useToast();
  const [c, setC] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newDeal, setNewDeal] = useState(null);
  const [merge, setMerge] = useState(null);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/companies/${id}`).then(setC).catch((e) => { toast(e.message, 'error'); onClose(); });
  useEffect(() => { setC(null); load(); }, [id]);
  useLive(['lead', 'refresh'], () => load());
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('.z-50.fixed') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const patch = async (body) => {
    try { await api.patch(`/companies/${id}`, body); await load(); onChanged?.(); } catch (e) { toast(e.message, 'error'); }
  };
  const addActivity = async (body) => { await api.post(`/companies/${id}/activities`, body); await load(); };
  const toggleTask = async (a) => { await api.patch(`/activities/${a.id}`, { done: !a.done }); load(); };
  const setOutcome = async (a, outcome) => {
    try { await api.patch(`/activities/${a.id}`, { outcome }); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const deleteActivity = async (a) => {
    try { await api.del(`/activities/${a.id}`); toast(tr('Aktiviteten raderades')); load(); } catch (e) { toast(e.message, 'error'); }
  };
  const [enriching, setEnriching] = useState(false);
  const enrich = async () => {
    setEnriching(true);
    try { await api.post(`/companies/${id}/enrich`); toast(tr('Företagsinfo hämtad')); load(); }
    catch (e) { toast(e.message, 'error'); } finally { setEnriching(false); }
  };
  const fetchBolagsverket = async () => {
    setBusy(true);
    try { const org = await api.post(`/companies/${id}/bolagsverket`); toast(`${org.name || c.name}: ${[org.form, org.city].filter(Boolean).join(', ')}`, 'success', { title: tr("Hämtat från Bolagsverket") }); load(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const createDeal = async () => {
    try {
      const d = await api.post('/deals', { title: newDeal.title, value: Number(newDeal.value) || 0, company_id: id, lead_id: newDeal.lead_id ? Number(newDeal.lead_id) : null });
      toast(tr("Affären skapades")); setNewDeal(null); load(); onChanged?.();
      return d;
    } catch (e) { toast(e.message, 'error'); }
  };
  const doMerge = async () => {
    try { await api.post(`/companies/${id}/merge`, { from_id: merge.from_id }); toast(tr("Företagen slogs ihop")); setMerge(null); load(); onChanged?.(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const remove = async () => { await api.del(`/companies/${id}`); toast(tr("Företaget togs bort")); onChanged?.(); onClose(); };

  const editable = c?.canEdit;
  const isCustomer = c?.won_count > 0;
  const openDeals = c?.deals.filter((d) => !['won', 'lost'].includes(d.stage)) || [];
  const closedDeals = c?.deals.filter((d) => ['won', 'lost'].includes(d.stage)) || [];

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-4xl bg-white shadow-2xl animate-slide-in flex flex-col">
        {!c ? <div className="flex-1 grid place-items-center"><Spinner /></div> : (
          <>
            <div className="px-6 pt-5 pb-4 border-b border-slate-100 space-y-4">
              <div className="flex items-start gap-4">
                <div className={cx('grid place-items-center size-12 rounded-xl shrink-0', isCustomer ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600')}><Building2 className="size-6" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900 truncate">{c.name}</h2>
                    {isCustomer ? <Badge className="bg-emerald-600 text-white ring-emerald-600"><Star className="size-3" />{tr("Kund")}</Badge> : <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20">{tr("Prospekt")}</Badge>}
                  </div>
                  <p className="text-sm text-slate-500 truncate">{[c.org_nr, c.city, c.industry].filter(Boolean).join(' · ') || tr("Inga företagsuppgifter än")}</p>
                </div>
                <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X className="size-5" /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[[tr("Vunnet"), sek(c.won_value), tr("{0} affärer", { 0: c.won_count })], [tr("Pågående"), sek(c.open_value), tr("{0} öppna", { 0: c.open_count })],
                  [tr("Kontaktpersoner"), c.contact_count, c.hiddenContacts ? tr("{0} dolda för dig", { 0: c.hiddenContacts }) : ''], [tr("Kund sedan"), c.customer_since ? formatDate(c.customer_since) : '—', '']].map(([l, v, sub]) => (
                  <div key={l} className="rounded-lg bg-slate-50 px-3 py-2"><p className="text-[11px] text-slate-500">{l}</p><p className="text-base font-semibold text-slate-900 tabular-nums">{v}</p>{sub && <p className="text-[11px] text-slate-400">{sub}</p>}</div>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scroll-thin grid md:grid-cols-[1fr_300px]">
              <div className="px-6 py-5 md:border-r border-slate-100 min-w-0 space-y-6">
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><ShoppingCart className="size-3.5" />{tr("Inköpsinformation")}</h3>
                  <Purchasing purchasing={c.purchasing} contacts={c.contacts} canEdit={editable}
                    onSave={async (data) => { await api.put(`/companies/${c.id}/purchasing`, data); await load(); }} />
                </section>
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Sparkles className="size-3.5" />{tr("Företagsinfo")}</h3>
                  <CompanyInsight enrichment={c.enrichment} companyName={c.name} configured={c.aiConfigured} canEnrich={editable} busy={enriching} onEnrich={enrich} />
                </section>
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr("Kontaktpersoner")}</h3>
                    {editable && !adding && <Button size="sm" variant="ghost" icon={UserPlus} onClick={() => setAdding(true)}>{tr("Lägg till")}</Button>}
                  </div>
                  {adding && <div className="mb-3"><NewContact companyId={c.id} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} /></div>}
                  {!c.contacts.length ? <p className="text-sm text-slate-400">{tr("Inga kontaktpersoner än.")}</p> : (
                    <div className="card divide-y divide-slate-100">
                      {c.contacts.map((l) => (
                        <div key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                          <Link to={`/leads/${l.id}`} className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate hover:text-brand-600">{leadName(l)}{l.tags.includes('Kund') && <Star className="inline ml-1 size-3 text-emerald-500" />}</p>
                            <p className="text-xs text-slate-500 truncate">{[l.title, l.email].filter(Boolean).join(' · ')}</p>
                          </Link>
                          <div className="hidden sm:block w-44"><NextStepCell step={l.next_step} lastContact={l.last_contact_at} status={l.status} /></div>
                          {l.phone && <a href={`tel:${l.phone}`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title={l.phone}><Phone className="size-4" /></a>}
                          {l.email && <a href={`mailto:${l.email}`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title={l.email}><Mail className="size-4" /></a>}
                          {l.owner_name && <Avatar name={l.owner_name} color={l.owner_color} size="xs" />}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{tr("Affärer")}</h3>
                    {editable && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setNewDeal({ title: `${c.name} – `, value: '', lead_id: c.contacts[0]?.id || '' })}>{tr("Ny affär")}</Button>}
                  </div>
                  {!c.deals.length ? <p className="text-sm text-slate-400">{tr("Inga affärer än.")}</p> : (
                    <div className="space-y-1.5">
                      {[...openDeals, ...closedDeals].map((d) => {
                        const st = STAGES.find((s) => s.key === d.stage);
                        return (
                          <Link key={d.id} to={`/pipeline/${d.id}`} className={cx('flex items-center gap-3 rounded-lg border px-3 py-2 hover:border-slate-300', ['won', 'lost'].includes(d.stage) ? 'border-slate-100 bg-slate-50/60' : 'border-slate-200')}>
                            <Briefcase className="size-4 text-violet-500 shrink-0" />
                            <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-800 truncate">{d.title}</span>
                              <span className="block text-xs text-slate-500">{[[d.first_name, d.last_name].filter(Boolean).join(' '), d.owner_name].filter(Boolean).join(' · ')}</span></span>
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><span className="size-2 rounded-full" style={{ background: st?.color }} />{st?.label}</span>
                            <span className="w-24 text-right text-sm font-medium tabular-nums">{sek(d.value)}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">{tr("Tidslinje för hela företaget")}</h3>
                  {editable && <div className="mb-5"><ActivityComposer onSubmit={addActivity} hint={tr("Anteckning på företaget")} /></div>}
                  <Timeline activities={c.activities} onToggleTask={toggleTask} onDelete={deleteActivity} onOutcome={editable ? setOutcome : null} showContact />
                </section>
              </div>

              <aside className="px-5 py-5 space-y-6 bg-slate-50/50">
                <div>
                  <p className="label">{tr("Ansvarig")}</p>
                  {can('leads.assign') ? (
                    <Select value={c.owner_id || ''} onChange={(e) => patch({ owner_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">{tr("Ingen")}</option>{team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  ) : <p className="flex items-center gap-2 text-sm">{c.owner_name ? <><Avatar name={c.owner_name} color={c.owner_color} size="xs" />{c.owner_name}</> : '—'}</p>}
                </div>
                <div>
                  <p className="label">{tr("Företagsuppgifter")}</p>
                  <EditableField icon={Building2} value={c.name} placeholder={tr("Namn")} disabled={!editable} onSave={(v) => v.trim() && patch({ name: v })} />
                  <EditableField icon={Hash} value={c.org_nr} placeholder={tr("Organisationsnummer")} disabled={!editable} onSave={(v) => patch({ org_nr: v })} />
                  <EditableField icon={Globe} value={c.website} placeholder={tr("Hemsida")} href={c.website && (/^https?:/.test(c.website) ? c.website : `https://${c.website}`)} disabled={!editable} onSave={(v) => patch({ website: v })} />
                  <EditableField icon={Phone} value={c.phone} placeholder={tr("Växelnummer")} href={c.phone && `tel:${c.phone}`} disabled={!editable} onSave={(v) => patch({ phone: v })} />
                  <EditableField icon={Mail} value={c.email} placeholder={tr("Allmän e-post")} href={c.email && `mailto:${c.email}`} disabled={!editable} onSave={(v) => patch({ email: v })} />
                  <EditableField icon={MapPin} value={c.address} placeholder={tr("Adress")} disabled={!editable} onSave={(v) => patch({ address: v })} />
                  <EditableField icon={MapPin} value={c.city} placeholder={tr("Ort")} disabled={!editable} onSave={(v) => patch({ city: v })} />
                  <EditableField icon={Factory} value={c.industry} placeholder={tr("Bransch")} disabled={!editable} onSave={(v) => patch({ industry: v })} />
                  {c.bolagsverket && editable && c.org_nr && <Button size="sm" variant="secondary" icon={ShieldCheck} loading={busy} className="mt-2 w-full" onClick={fetchBolagsverket}>{tr("Hämta från Bolagsverket")}</Button>}
                </div>
                {(can('leads.edit_all') || can('leads.delete')) && (
                  <div className="space-y-1 border-t border-slate-200 pt-4">
                    {can('leads.edit_all') && <Button size="sm" variant="ghost" icon={Merge} className="-ml-2" onClick={() => setMerge({ q: '', results: [], from_id: null })}>{tr("Slå ihop med annat företag")}</Button>}
                    {can('leads.delete') && <Button size="sm" variant="ghost" icon={Trash2} className="-ml-2 !text-rose-600" onClick={() => setDel(true)}>{tr("Ta bort företaget")}</Button>}
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>

      <Modal open={!!newDeal} onClose={() => setNewDeal(null)} title={tr("Ny affär")} description={c?.name}
        footer={<><Button variant="secondary" onClick={() => setNewDeal(null)}>{tr("Avbryt")}</Button><Button onClick={createDeal}>{tr("Skapa affär")}</Button></>}>
        {newDeal && (
          <div className="space-y-4">
            <Field label={tr("Namn")}><Input value={newDeal.title} onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })} autoFocus /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={tr("Värde (kr)")} hint={tr("Eller lägg till produkter i affären")}><Input type="number" value={newDeal.value} onChange={(e) => setNewDeal({ ...newDeal, value: e.target.value })} /></Field>
              <Field label={tr("Kontaktperson")}>
                <Select value={newDeal.lead_id} onChange={(e) => setNewDeal({ ...newDeal, lead_id: e.target.value })}>
                  <option value="">{tr("Ingen")}</option>{c?.contacts.map((l) => <option key={l.id} value={l.id}>{leadName(l)}</option>)}
                </Select>
              </Field>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!merge} onClose={() => setMerge(null)} title={tr("Slå ihop med {0}", { 0: c?.name })} description={tr("Kontakter, affärer och historik flyttas hit. Det andra företaget tas bort.")}
        footer={<><Button variant="secondary" onClick={() => setMerge(null)}>{tr("Avbryt")}</Button><Button disabled={!merge?.from_id} onClick={doMerge}>{tr("Slå ihop")}</Button></>}>
        {merge && (
          <div className="space-y-3">
            <Input placeholder={tr("Sök företaget som ska slås ihop hit…")} value={merge.q} autoFocus
              onChange={async (e) => { const q = e.target.value; setMerge((m) => ({ ...m, q })); const results = q.length > 1 ? await api.get(`/companies-lookup?q=${encodeURIComponent(q)}`) : []; setMerge((m) => ({ ...m, results: results.filter((x) => x.id !== c.id) })); }} />
            <div className="space-y-1">
              {merge.results.map((x) => (
                <button key={x.id} onClick={() => setMerge({ ...merge, from_id: x.id })} className={cx('block w-full rounded-lg border px-3 py-2 text-left text-sm', merge.from_id === x.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50')}>
                  {x.name}<span className="text-xs text-slate-500"> {[x.org_nr, x.city].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
      <Confirm open={del} onClose={() => setDel(false)} onConfirm={remove} title={tr("Ta bort företaget?")} text={tr("Kontaktpersoner och affärer finns kvar men kopplas loss från företaget.")} confirmText={tr("Ta bort")} />
    </div>
  );
}
