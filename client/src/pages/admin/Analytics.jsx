import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid,
} from 'recharts';
import { AlertCircle, TrendingUp, Bot, PlayCircle, Megaphone, BookOpen } from 'lucide-react';
import { dashboardService, productService } from '../../services/endpoints';
import PageHeader from '../../components/admin/PageHeader';
import { Spinner, Select, StatCard, Badge, EmptyState, Alert } from '../../components/ui';
import { shortTime, timeAgo } from '../../utils/format';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await dashboardService.analytics({ days, productId: productId || undefined }));
    } finally {
      setLoading(false);
    }
  }, [days, productId]);

  useEffect(() => {
    productService.list().then(setProducts).catch(() => null);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) return <Spinner className="py-24" />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Analytics" description="Where support volume comes from, and where the AI is falling short.">
        <div className="flex flex-wrap gap-2">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} className="max-w-xs" aria-label="Product">
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </Select>
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="max-w-[160px]" aria-label="Date range">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </Select>
        </div>
      </PageHeader>

      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="AI answered" value={data.ai.answered} icon={Bot} tone="green" />
          <StatCard label="AI could not answer" value={data.ai.unanswered} icon={AlertCircle} tone={data.ai.unanswered ? 'amber' : 'gray'} />
          <StatCard label="Answer rate" value={`${data.ai.answerRate}%`} icon={TrendingUp} tone="indigo" />
          <StatCard
            label="Conversations"
            value={data.volumeByDay.reduce((a, b) => a + b.count, 0)}
            sub={`Last ${data.rangeDays} days`}
            tone="blue"
          />
        </div>

        {/* Volume */}
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Support volume</h2>
          {data.volumeByDay.length === 0 ? (
            <EmptyState title="No conversations in this range" />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.volumeByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Intents */}
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Support categories</h2>
            {data.byIntent.length === 0 ? (
              <EmptyState title="No categorised conversations yet" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byIntent} layout="vertical" margin={{ left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="intent" tick={{ fontSize: 10, fill: '#64748b' }} width={110} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Unanswered — the knowledge-base backlog */}
          <div className="card p-5">
            <h2 className="mb-1 text-sm font-semibold text-ink-900">Questions the AI could not answer</h2>
            <p className="mb-3 text-xs text-ink-500">Each of these is a missing knowledge article.</p>
            {data.unansweredQuestions.length === 0 ? (
              <EmptyState title="Nothing unanswered" description="The knowledge base is covering the questions customers ask." />
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto scroll-thin">
                {data.unansweredQuestions.map((q, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                    <p className="text-sm text-amber-900">{q.question}</p>
                    <p className="mt-0.5 text-[11px] text-amber-700">
                      {q.product?.name} · {q.reason?.replace(/_/g, ' ')} · {timeAgo(q.at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Common questions */}
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Most common questions</h2>
            {data.commonQuestions.length === 0 ? (
              <p className="text-sm text-ink-400">Not enough data yet.</p>
            ) : (
              <div className="space-y-1.5">
                {data.commonQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Badge tone="gray">{q.count}×</Badge>
                    <span className="min-w-0 flex-1 text-ink-700">{q.question}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Training */}
          <div className="card p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <PlayCircle className="h-4 w-4 text-ink-400" /> Training videos
            </h2>
            {data.training.length === 0 ? (
              <p className="text-sm text-ink-400">No videos yet.</p>
            ) : (
              <div className="space-y-2">
                {data.training.map((t, i) => (
                  <div key={i}>
                    <p className="truncate text-xs font-medium text-ink-800">{t.title}</p>
                    <p className="text-[11px] text-ink-500">
                      {t.recommended} recommended · {t.clicks} clicks · {t.ctr}% CTR
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Knowledge usage */}
          <div className="card p-5">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
              <BookOpen className="h-4 w-4 text-ink-400" /> Most used knowledge
            </h2>
            {data.knowledgeUsage.length === 0 ? (
              <p className="text-sm text-ink-400">No knowledge used yet.</p>
            ) : (
              <div className="space-y-2">
                {data.knowledgeUsage.map((k) => (
                  <div key={k._id}>
                    <p className="truncate text-xs font-medium text-ink-800">{k.title}</p>
                    <p className="text-[11px] text-ink-500">
                      {k.category} · used {k.usageCount}× · last {k.lastUsedAt ? shortTime(k.lastUsedAt) : 'never'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Marketing performance */}
        <div className="card p-5">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            <Megaphone className="h-4 w-4 text-ink-400" /> Product recommendations
          </h2>
          {data.recommendations.length === 0 ? (
            <Alert tone="info">No recommendations configured yet.</Alert>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="pb-2 font-semibold">Recommendation</th>
                    <th className="pb-2 font-semibold">Impressions</th>
                    <th className="pb-2 font-semibold">Clicks</th>
                    <th className="pb-2 font-semibold">CTR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {data.recommendations.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 text-ink-800">{r.title}</td>
                      <td className="py-2 text-ink-600">{r.impressions}</td>
                      <td className="py-2 text-ink-600">{r.clicks}</td>
                      <td className="py-2 font-medium text-ink-900">{r.ctr}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
