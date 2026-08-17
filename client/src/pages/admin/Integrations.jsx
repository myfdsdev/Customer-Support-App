import React, { useEffect, useState } from 'react';
import { Plug, RefreshCw, UploadCloud, AlertTriangle, CheckCircle2 } from 'lucide-react';
import PageHeader from '../../components/admin/PageHeader';
import { Button, Badge, Spinner, Select, Alert, Tabs } from '../../components/ui';
import { integrationService, productService, toMessage } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { fullTime } from '../../utils/format';

/* ------------------------------------------------------------------ Events */
function EventsPanel() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = async () => {
    try {
      const params = filter === 'pending' ? { pending: 'true' } : {};
      setData(await integrationService.listEvents(params));
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

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
        <div className="flex items-center gap-2">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-48">
            <option value="all">All events</option>
            <option value="pending">Unmapped / pending</option>
          </Select>
          {data.pendingCount > 0 && <Badge tone="amber">{data.pendingCount} pending mapping</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          {data.pendingCount > 0 && (
            <Button size="sm" onClick={reprocessAll} loading={busy}>Reprocess pending</Button>
          )}
        </div>
      </div>

      {!data.events.length ? (
        <p className="rounded-lg border border-dashed border-ink-200 p-8 text-center text-sm text-ink-500">
          No payment events yet. They appear here as JVZoo sends IPNs.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-200">
          <table className="min-w-full divide-y divide-ink-100 text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500">
              <tr>
                <th className="px-3 py-2">Received</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Product ID</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Verified</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {data.events.map((e) => (
                <tr key={e._id} className="hover:bg-ink-50/50">
                  <td className="whitespace-nowrap px-3 py-2 text-ink-500">{fullTime(e.receivedAt)}</td>
                  <td className="px-3 py-2 font-medium text-ink-800">{e.eventType}</td>
                  <td className="px-3 py-2 text-ink-600">{e.productExternalId || '—'}</td>
                  <td className="px-3 py-2 text-ink-600">{e.customerEmail || '—'}</td>
                  <td className="px-3 py-2">
                    {e.verificationStatus === 'verified' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> yes</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-4 w-4" /> {e.verificationStatus}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {e.pendingMapping ? <Badge tone="amber">pending map</Badge>
                      : e.processed ? <Badge tone="green">processed</Badge>
                      : <Badge tone="gray">unprocessed</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {e.verificationStatus === 'verified' && (
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => reprocess(e._id)}>Reprocess</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Import */
const CSV_FIELDS = [
  ['email', 'Email *'],
  ['name', 'Customer name'],
  ['transactionId', 'Transaction ID'],
  ['productId', 'JVZoo product ID'],
  ['purchaseDate', 'Purchase date'],
  ['status', 'Status'],
  ['plan', 'Plan'],
];

function ImportPanel() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    productService.list().then((p) => setProducts(p || [])).catch(() => null);
  }, []);

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
      const res = await integrationService.importCsv(buildForm(false));
      setPreview(res);
      setResult(null);
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    setBusy(true);
    try {
      const res = await integrationService.importCsv(buildForm(true));
      setResult(res);
      setPreview(null);
      toast.success(`Imported: +${res.totals.created} new, ${res.totals.updated} updated`);
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f) => {
    setFile(f);
    setPreview(null);
    setResult(null);
    if (!f) return;
    // Peek at the header row so the admin can map columns before uploading.
    const text = await f.text();
    const firstLine = text.split(/\r?\n/)[0] || '';
    const cols = firstLine.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    setHeaders(cols);
    // Best-effort auto-map by header name.
    const auto = {};
    CSV_FIELDS.forEach(([key]) => {
      const found = cols.find((c) => c.toLowerCase().replace(/[^a-z]/g, '').includes(key.toLowerCase().replace(/[^a-z]/g, '')));
      if (found) auto[key] = found;
    });
    setMapping(auto);
  };

  return (
    <div className="max-w-3xl space-y-5">
      <Alert tone="info">
        Import historical purchases from a JVZoo CSV. Records are upserted into the central entitlement table — running
        the same file twice will not duplicate anyone.
      </Alert>

      <Select label="Import into product" value={productId} onChange={(e) => setProductId(e.target.value)}>
        <option value="">Select a product…</option>
        {products.map((p) => (
          <option key={p._id} value={p._id}>{p.name}</option>
        ))}
      </Select>

      <div>
        <span className="label">CSV file</span>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-ink-300 px-3 py-3 text-sm text-ink-500 hover:bg-ink-50">
          <UploadCloud className="h-5 w-5" />
          <span>{file ? file.name : 'Choose a .csv file'}</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
        </label>
      </div>

      {headers.length > 0 && (
        <div>
          <span className="label">Map columns</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {CSV_FIELDS.map(([key, label]) => (
              <Select
                key={key}
                label={label}
                value={mapping[key] || ''}
                onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
              >
                <option value="">— none —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
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
          <p className="text-sm font-medium text-ink-800">
            {preview.validCount} valid · {preview.invalidCount} invalid of {preview.totalRows} rows
          </p>
          {preview.invalid?.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-red-600">
              {preview.invalid.map((r, i) => (
                <li key={i}>Row {r.row}: {r.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <p className="font-semibold">Import complete</p>
          <p className="mt-1">
            {result.totals.created} created · {result.totals.updated} updated · {result.totals.skipped} skipped ·{' '}
            {result.totals.failed} failed
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Page  */
export default function Integrations() {
  const [tab, setTab] = useState('events');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    integrationService.status().then(setStatus).catch(() => null);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="JVZoo & Imports"
        description="Payment webhook events, product mapping and historical CSV imports."
        actions={
          status && (
            <Badge tone={status.jvzoo.webhookEnabled && status.jvzoo.secretConfigured ? 'green' : 'amber'}>
              <Plug className="mr-1 h-3.5 w-3.5" />
              Webhook {status.jvzoo.webhookEnabled ? (status.jvzoo.secretConfigured ? 'active' : 'no secret') : 'off'}
            </Badge>
          )
        }
      >
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'events', label: 'Payment events' },
            { value: 'import', label: 'CSV import' },
          ]}
        />
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === 'events' ? <EventsPanel /> : <ImportPanel />}
      </div>
    </div>
  );
}
