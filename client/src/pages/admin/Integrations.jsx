import React, { useEffect, useState } from 'react';
import { Plug, RefreshCw, UploadCloud, AlertTriangle, CheckCircle2, Copy, Eye, Link2 } from 'lucide-react';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Badge, Spinner, Select, Alert, Tabs, Modal, Input } from '../../components/ui';
import { integrationService, productService, toMessage } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { fullTime } from '../../utils/format';

const PROC_TONE = { processed: 'green', pending_mapping: 'amber', failed: 'red', received: 'gray', duplicate: 'blue', ignored: 'gray' };
const VERIF_TONE = { verified: 'green', failed: 'red', blocked: 'amber', unconfigured: 'amber', skipped: 'gray' };

/* ---------------------------------------------------------- Assign mapping */
function AssignModal({ event, products, onClose, onDone }) {
  const [productId, setProductId] = useState('');
  const [offerType, setOfferType] = useState('fe');
  const [accessPlan, setAccessPlan] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async () => {
    if (!productId) return toast.error('Choose a product');
    setBusy(true);
    try {
      const res = await integrationService.assignMapping(event._id, { productId, offerType, accessPlan });
      toast.success(`Mapped → ${res.product.name} (${res.outcome})`);
      onDone();
      onClose();
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(event)}
      onClose={onClose}
      title="Map JVZoo product ID"
      description={`Assign external id "${event?.externalProductId}" to an internal product, then reprocess this event.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Map & reprocess</Button></>}
    >
      <div className="space-y-3">
        <Select label="Internal product" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Select…</option>
          {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Offer type" value={offerType} onChange={(e) => setOfferType(e.target.value)}>
            <option value="fe">FE</option>
            <option value="oto">OTO</option>
            <option value="bundle">Bundle</option>
            <option value="addon">Add-on</option>
          </Select>
          <Input label="Access plan" value={accessPlan} onChange={(e) => setAccessPlan(e.target.value)} placeholder="e.g. pro" />
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- Payload viewer */
function PayloadModal({ eventId, onClose }) {
  const [data, setData] = useState(null);
  const toast = useToast();
  useEffect(() => {
    if (!eventId) return;
    integrationService.getEvent(eventId).then(setData).catch((err) => toast.error(toMessage(err)));
  }, [eventId]);
  return (
    <Modal open={Boolean(eventId)} onClose={onClose} title="Sanitized event payload" size="lg">
      {!data ? <Spinner /> : (
        <div className="space-y-2 text-sm">
          <p className="text-ink-500">Payload hash: <code className="text-xs">{data.payloadHash?.slice(0, 24)}…</code></p>
          <pre className="max-h-96 overflow-auto rounded-lg bg-ink-900 p-3 text-xs text-ink-100">{JSON.stringify(data.redactedPayload, null, 2)}</pre>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ Events */
function EventsPanel({ products }) {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ processingStatus: '', eventType: '' });
  const [busy, setBusy] = useState(false);
  const [assignEvent, setAssignEvent] = useState(null);
  const [payloadId, setPayloadId] = useState(null);
  const toast = useToast();

  const load = async () => {
    try {
      const params = {};
      if (filters.processingStatus) params.processingStatus = filters.processingStatus;
      if (filters.eventType) params.eventType = filters.eventType;
      setData(await integrationService.listEvents(params));
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const reprocess = async (id) => {
    setBusy(true);
    try {
      const res = await integrationService.reprocessEvent(id);
      toast.success(`Reprocessed: ${res.outcome}`);
      await load();
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const reprocessAll = async () => {
    setBusy(true);
    try {
      const res = await integrationService.reprocessPending();
      toast.success(`Processed ${res.processed} pending event(s)`);
      await load();
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="p-8"><Spinner label="Loading events…" /></div>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.processingStatus} onChange={(e) => setFilters({ ...filters, processingStatus: e.target.value })} className="w-44">
            <option value="">All statuses</option>
            <option value="processed">Processed</option>
            <option value="pending_mapping">Pending mapping</option>
            <option value="failed">Failed</option>
            <option value="ignored">Ignored</option>
            <option value="duplicate">Duplicate</option>
          </Select>
          <Select value={filters.eventType} onChange={(e) => setFilters({ ...filters, eventType: e.target.value })} className="w-40">
            <option value="">All events</option>
            <option value="sale">Sale</option>
            <option value="bill">Bill</option>
            <option value="upsell">Upsell</option>
            <option value="refund">Refund</option>
            <option value="chargeback">Chargeback</option>
            <option value="cancel_rebill">Cancel</option>
          </Select>
          {data.pendingCount > 0 && <Badge tone="amber">{data.pendingCount} pending</Badge>}
          {data.failedCount > 0 && <Badge tone="red">{data.failedCount} failed</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          {data.pendingCount > 0 && <Button size="sm" onClick={reprocessAll} loading={busy}>Reprocess pending</Button>}
        </div>
      </div>

      {!data.events.length ? (
        <p className="rounded-lg border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
          No payment events match. They appear here as JVZoo sends IPNs.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-200">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500">
              <tr>
                <th className="px-3 py-2">Received</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Txn</th>
                <th className="px-3 py-2">Ext. product</th>
                <th className="px-3 py-2">Mapped</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Verify</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {data.events.map((e) => (
                <tr key={e._id} className="hover:bg-ink-50/50">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-500">{fullTime(e.receivedAt)}</td>
                  <td className="px-3 py-2 font-medium text-ink-800">{e.eventType}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-600">{e.transactionId || '—'}</td>
                  <td className="px-3 py-2 text-ink-600">{e.externalProductId || '—'}</td>
                  <td className="px-3 py-2 text-ink-600">{e.product ? e.product.name : <span className="text-amber-600">—</span>}</td>
                  <td className="px-3 py-2 text-ink-600">{e.customerEmailMasked || '—'}</td>
                  <td className="px-3 py-2"><Badge tone={VERIF_TONE[e.verificationStatus] || 'gray'}>{e.verificationStatus}</Badge></td>
                  <td className="px-3 py-2"><Badge tone={PROC_TONE[e.processingStatus] || 'gray'}>{e.processingStatus.replace(/_/g, ' ')}</Badge></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setPayloadId(e._id)} className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" title="View payload"><Eye className="h-4 w-4" /></button>
                      {e.processingStatus === 'pending_mapping' && (
                        <button onClick={() => setAssignEvent(e)} className="rounded p-1 text-brand-700 hover:bg-brand-50" title="Map product"><Link2 className="h-4 w-4" /></button>
                      )}
                      {e.verificationStatus === 'verified' && e.processingStatus !== 'processed' && (
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => reprocess(e._id)}>Reprocess</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {assignEvent && <AssignModal event={assignEvent} products={products} onClose={() => setAssignEvent(null)} onDone={load} />}
      {payloadId && <PayloadModal eventId={payloadId} onClose={() => setPayloadId(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Import */
const CSV_FIELDS = [
  ['email', 'Email *'], ['name', 'Customer name'], ['transactionId', 'Transaction ID'],
  ['productId', 'JVZoo product ID'], ['purchaseDate', 'Purchase date'], ['status', 'Status'], ['plan', 'Plan'],
];

function ImportPanel({ products }) {
  const [productId, setProductId] = useState('');
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const buildForm = (commit) => {
    const form = new FormData();
    form.append('file', file);
    form.append('productId', productId);
    form.append('mapping', JSON.stringify(mapping));
    form.append('commit', commit ? 'true' : 'false');
    return form;
  };

  const runPreview = async () => {
    if (!productId || !file) return toast.error('Choose a product and a CSV file first');
    if (!mapping.email) return toast.error('Map the email column');
    setBusy(true);
    try {
      setPreview(await integrationService.importCsv(buildForm(false)));
      setResult(null);
    } catch (err) { toast.error(toMessage(err)); } finally { setBusy(false); }
  };

  const runCommit = async () => {
    setBusy(true);
    try {
      const res = await integrationService.importCsv(buildForm(true));
      setResult(res); setPreview(null);
      toast.success(`Imported: +${res.totals.created} new, ${res.totals.updated} updated`);
    } catch (err) { toast.error(toMessage(err)); } finally { setBusy(false); }
  };

  const onFile = async (f) => {
    setFile(f); setPreview(null); setResult(null);
    if (!f) return;
    const text = await f.text();
    const cols = (text.split(/\r?\n/)[0] || '').split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    setHeaders(cols);
    const auto = {};
    CSV_FIELDS.forEach(([key]) => {
      const found = cols.find((c) => c.toLowerCase().replace(/[^a-z]/g, '').includes(key.toLowerCase().replace(/[^a-z]/g, '')));
      if (found) auto[key] = found;
    });
    setMapping(auto);
  };

  return (
    <div className="max-w-3xl space-y-5">
      <Alert tone="info">Import historical purchases from a JVZoo CSV. Records upsert into the central entitlement table — running the same file twice will not duplicate anyone.</Alert>
      <Select label="Import into product" value={productId} onChange={(e) => setProductId(e.target.value)}>
        <option value="">Select a product…</option>
        {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
      </Select>
      <div>
        <span className="label">CSV file</span>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-ink-300 px-3 py-3 text-sm text-ink-500 hover:bg-ink-50">
          <UploadCloud className="h-5 w-5" /><span>{file ? file.name : 'Choose a .csv file'}</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      {headers.length > 0 && (
        <div>
          <span className="label">Map columns</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {CSV_FIELDS.map(([key, label]) => (
              <Select key={key} label={label} value={mapping[key] || ''} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}>
                <option value="">— none —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={runPreview} loading={busy} disabled={!file || !productId}>Preview</Button>
        {preview && <Button onClick={runCommit} loading={busy}>Confirm import ({preview.validCount} valid)</Button>}
      </div>
      {preview && (
        <div className="rounded-xl border border-ink-200 p-4">
          <p className="text-sm font-medium text-ink-800">{preview.validCount} valid · {preview.invalidCount} invalid of {preview.totalRows} rows</p>
          {preview.invalid?.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-red-600">
              {preview.invalid.map((r, i) => <li key={i}>Row {r.row}: {r.error}</li>)}
            </ul>
          )}
        </div>
      )}
      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Import complete</p>
          <p className="mt-1">{result.totals.created} created · {result.totals.updated} updated · {result.totals.skipped} skipped · {result.totals.failed} failed</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Page  */
export default function Integrations() {
  const [tab, setTab] = useState('events');
  const [status, setStatus] = useState(null);
  const [products, setProducts] = useState([]);
  const toast = useToast();

  useEffect(() => {
    integrationService.status().then(setStatus).catch(() => null);
    productService.list().then((p) => setProducts(p || [])).catch(() => null);
  }, []);

  const copyIpn = () => {
    if (status?.jvzoo?.ipnUrl) { navigator.clipboard?.writeText(status.jvzoo.ipnUrl); toast.success('IPN URL copied'); }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="JVZoo Integration"
        description="Central IPN endpoint, payment events, product mapping and CSV imports."
        actions={
          status && (
            <Badge tone={status.jvzoo.productionReady ? 'green' : 'amber'}>
              <Plug className="mr-1 h-3.5 w-3.5" />
              {status.jvzoo.productionReady ? 'Production ready' : 'Not production ready'}
            </Badge>
          )
        }
      >
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'events', label: 'Payment events' }, { value: 'import', label: 'CSV import' }]} />
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {status && (
          <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="rounded-xl border border-ink-200 bg-ink-50 p-3">
              <p className="mb-1 text-xs font-medium text-ink-600">Central IPN URL — paste into every JVZoo product’s IPN settings</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs text-ink-800">{status.jvzoo.ipnUrl}</code>
                <Button variant="secondary" size="sm" onClick={copyIpn}><Copy className="h-4 w-4" /> Copy</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 p-3">
              <Badge tone={status.jvzoo.webhookEnabled ? 'green' : 'gray'}>Webhook {status.jvzoo.webhookEnabled ? 'on' : 'off'}</Badge>
              <Badge tone={status.jvzoo.secretConfigured ? 'green' : 'amber'}>{status.jvzoo.secretConfigured ? 'Secret set' : 'No secret'}</Badge>
              <Badge tone={status.jvzoo.verificationConfirmed ? 'green' : 'amber'}>{status.jvzoo.verificationConfirmed ? 'Verified scheme' : 'Verification blocked'}</Badge>
            </div>
          </div>
        )}

        {status && !status.jvzoo.verificationConfirmed && (
          <Alert tone="warning" className="mb-5" title="Verification not yet confirmed">
            The signature scheme has not been validated against a real JVZoo test IPN. While this is the case the webhook
            stores events for audit but grants no access. Set <code>JVZOO_VERIFICATION_CONFIRMED=true</code> only after you
            have validated a real test notification end to end.
          </Alert>
        )}

        {tab === 'events' ? <EventsPanel products={products} /> : <ImportPanel products={products} />}
      </div>
    </div>
  );
}
