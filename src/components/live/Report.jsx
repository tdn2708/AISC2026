import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Send, CircleCheck } from 'lucide-react';
import { GlassPanel, PanelHeader, Button, Badge, EmptyState } from '../ui';
import { fmtInt, fmtPct } from '../../lib/format';
import { EffectLine } from './ActionCoach';
import { reportRefreshing } from '../../lib/dataVersion';
import { clock } from './shared';

/**
 * BÁO CÁO SAU PHIÊN LIVE
 * Đọc từ trên xuống theo thứ tự người bán cần: kết quả, việc cần làm cho phiên
 * sau, rồi tới chi tiết để kiểm chứng (phễu, cầu bị lỡ, câu hỏi bỏ sót, khiếu
 * nại, hiệu quả từng hành động, so với phiên trước).
 */

const money = (n) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',')} triệu` : `${fmtInt(Math.round(n / 1000))} nghìn`);
const PRIO = { high: { label: 'Ưu tiên', tone: 'crit' }, medium: { label: 'Nên làm', tone: 'high' }, low: { label: 'Gợi ý', tone: 'neutral' } };

const Big = ({ label, value, sub, tone }) => (
  <div className="glass-strong rounded-surf px-4 py-3.5">
    <p className="text-xs text-ink-lo">{label}</p>
    <p className={`mt-1 font-mono text-display leading-none font-semibold ${tone === 'crit' ? 'text-crit' : tone === 'ok' ? 'text-ok' : 'text-ink-hi'}`}>{value}</p>
    {sub && <p className="mt-1.5 text-xs text-ink-lo">{sub}</p>}
  </div>
);

const Delta = ({ now, prev, fmt = fmtInt, pctMode }) => {
  if (prev == null || now == null) return <span className="text-ink-lo">Chưa so được</span>;
  const d = now - prev;
  const txt = pctMode ? `${d >= 0 ? '+' : ''}${Math.round(d * 100)} điểm` : `${d >= 0 ? '+' : ''}${fmt(d)}`;
  return <span className={d > 0 ? 'text-ok' : d < 0 ? 'text-crit' : 'text-ink-lo'}>{txt}</span>;
};

const Funnel = ({ f }) => {
  const steps = [
    ['Người xem cao nhất', f.viewersPeak],
    ['Người bình luận', f.commenters],
    ['Người hỏi', f.askers],
    ['Người chốt đơn', f.buyers],
    ['Đã lên đơn', f.confirmed]
  ].filter(([, v]) => v != null);
  const max = Math.max(1, ...steps.map(([, v]) => v));
  return (
    <ol className="flex list-none flex-col gap-2.5">
      {steps.map(([label, v], i) => {
        const prev = i ? steps[i - 1][1] : null;
        return (
          <li key={label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-hi">{label}</span>
              <span className="font-mono text-ink-hi">
                {fmtInt(v)}
                {prev ? <span className="ml-2 text-xs text-ink-lo">{fmtPct(v / prev, 0)} bước trước</span> : null}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1.5, (v / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
};

const Report = ({ sessionId }) => {
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  const [push, setPush] = useState(null);

  const load = useCallback(() => {
    axios.get(`/live/sessions/${sessionId}/report`).then((x) => setR(x.data)).catch((e) => setError(e.response?.data?.error || 'Không tạo được báo cáo'));
  }, [sessionId]);
  useEffect(load, [load]);

  const pushFeedback = async () => {
    setPush({ busy: true });
    try {
      const x = await axios.post(`/live/sessions/${sessionId}/push-feedback`);
      setPush({ done: true, inserted: x.data.inserted, duplicates: x.data.duplicates, message: x.data.message });
      if (x.data.inserted) reportRefreshing(true);
      load();
    } catch (e) {
      setPush({ error: e.response?.data?.error || 'Không đưa được' });
    }
  };

  if (error) return <EmptyState variant="error" title={error} />;
  if (!r) return <GlassPanel className="h-72 animate-pulse" />;

  const t = r.totals;
  const prev = r.previous;

  return (
    <div className="flex flex-col gap-4">
      {/* Kết quả */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Big label="Doanh thu ước tính" value={money(r.revenue.estimated)} sub={`Từ ${fmtInt(t.byIntent.order)} lượt chốt trên bình luận, ${r.revenue.confirmed ? `đã lên đơn ${money(r.revenue.confirmed)}` : 'chưa lên đơn nào'}`} tone="ok" />
        <Big label="Doanh thu lỡ vì hết hàng" value={money(r.revenue.lostTotal)} sub={r.revenue.lost.length ? `${r.revenue.lost.length} biến thể hết khi khách vẫn chốt` : 'Không có'} tone={r.revenue.lostTotal ? 'crit' : undefined} />
        <Big label="Khách hỏi được trả lời" value={r.response.answeredShare != null ? fmtPct(r.response.answeredShare, 0) : '—'} sub={r.response.medianWaitMin != null ? `Chờ trung vị ${r.response.medianWaitMin.toFixed(1).replace('.', ',')} phút` : `${fmtInt(r.response.askedPeople)} lượt hỏi`} />
        <Big label="Khiếu nại" value={fmtInt(r.complaints.total)} sub={r.complaints.byCategory[0] ? `Nhiều nhất: ${r.complaints.byCategory[0].label.toLowerCase()}` : 'Không có'} tone={r.complaints.total ? 'crit' : undefined} />
      </div>

      {/* Việc cần làm */}
      <GlassPanel tone="strong" className="p-4 sm:p-5">
        <PanelHeader title="Việc cần làm cho phiên sau" subtitle="Xếp theo mức ưu tiên. Mỗi việc kèm số liệu của chính phiên này." />
        {r.todo.length ? (
          <ol className="flex list-none flex-col">
            {r.todo.map((x, i) => (
              <li key={`${x.kind}-${i}`} className="flex gap-3 border-b border-line-soft py-3 last:border-0">
                <span className="mt-0.5 font-mono text-sm text-ink-lo">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={PRIO[x.priority].tone}>{PRIO[x.priority].label}</Badge>
                    <p className="text-sm font-semibold text-ink-hi">{x.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-ink-mid">{x.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState compact title="Chưa đủ dữ liệu để gợi ý" />
        )}
      </GlassPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel tone="strong" className="p-4 sm:p-5">
          <PanelHeader title="Phễu phiên live" subtitle="Rơi rụng nhiều nhất ở bước nào" />
          <Funnel f={r.funnel} />
        </GlassPanel>

        <GlassPanel tone="strong" className="p-4 sm:p-5">
          <PanelHeader
            title="Khiếu nại theo nhóm vấn đề"
            subtitle="Cùng cách phân loại với trang Phản hồi"
            right={r.complaints.total > 0 && (
              r.complaints.pushed >= r.complaints.total
                ? <Badge tone="ok" icon={CircleCheck}>Đã đưa vào hệ thống</Badge>
                : <Button size="sm" icon={Send} loading={push?.busy} onClick={pushFeedback}>Đưa vào Phản hồi</Button>
            )}
          />
          {push?.done && (
            <p role="status" className="mb-3 rounded-md bg-ok/10 px-3 py-2 text-sm text-ok">
              {push.message || `Đã đưa ${push.inserted} khiếu nại vào hệ thống phản hồi${push.duplicates ? `, bỏ ${push.duplicates} câu trùng` : ''}.`}{' '}
              <Link to="/feedbacks" className="font-medium underline">Xem</Link>
            </p>
          )}
          {push?.error && <p role="alert" className="mb-3 text-sm text-crit">{push.error}</p>}
          {r.complaints.byCategory.length ? (
            <ul className="flex list-none flex-col gap-3">
              {r.complaints.byCategory.map((c) => (
                <li key={c.category}>
                  <div className="flex justify-between text-sm"><span className="text-ink-hi">{c.label}</span><span className="font-mono text-ink-mid">{fmtInt(c.count)}</span></div>
                  {c.samples.map((s, i) => <p key={i} className="mt-0.5 truncate text-xs text-ink-lo">“{s}”</p>)}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="Không có khiếu nại" />
          )}
          {r.complaints.total > 0 && r.complaints.pushed < r.complaints.total && (
            <p className="mt-3 text-xs text-ink-lo">Đưa vào hệ thống để Trust Layer, cảnh báo và báo cáo tính chung với đánh giá trên sàn và các kênh khác.</p>
          )}
        </GlassPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel tone="strong" className="p-4 sm:p-5">
          <PanelHeader title="Câu hỏi bị bỏ sót" subtitle="Nhóm câu hỏi chưa được trả lời, đông người nhất trước" />
          {r.response.missed.length ? (
            <ul className="flex list-none flex-col">
              {r.response.missed.map((m, i) => (
                <li key={i} className="flex items-baseline gap-3 border-b border-line-soft py-2 last:border-0">
                  <span className="w-10 shrink-0 font-mono text-sm text-ink-hi">{fmtInt(m.people)}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-ink-hi">{m.topicLabel}{m.productName ? `, ${m.productName}` : ''}</p>
                    <p className="truncate text-xs text-ink-lo">“{m.sample}”</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="Không bỏ sót câu hỏi nào" />}
        </GlassPanel>

        <GlassPanel tone="strong" className="p-4 sm:p-5">
          <PanelHeader title="Cầu bị lỡ vì hết hàng" subtitle="Lượt chốt đến sau khi biến thể đã hết, theo tồn kho khai báo" />
          {r.revenue.lost.length ? (
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line-soft text-xs text-ink-lo"><th className="py-2 font-medium">Biến thể</th><th className="py-2 text-right font-medium">Khách</th><th className="py-2 text-right font-medium">Sản phẩm</th><th className="py-2 text-right font-medium">Giá trị</th></tr></thead>
              <tbody>
                {r.revenue.lost.map((l) => (
                  <tr key={`${l.productId}-${l.variant}`} className="border-b border-line-soft last:border-0">
                    <td className="py-2 text-ink-hi">{l.name}{l.variant ? `, ${/^[A-Z0-9]+$/.test(l.variant) ? `size ${l.variant}` : l.variant}` : ''}</td>
                    <td className="py-2 text-right font-mono">{fmtInt(l.people)}</td>
                    <td className="py-2 text-right font-mono">{fmtInt(l.qty)}</td>
                    <td className="py-2 text-right font-mono text-crit">{money(l.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState compact title="Không có biến thể nào hết hàng giữa phiên" />}
        </GlassPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassPanel tone="strong" className="p-4 sm:p-5">
          <PanelHeader title="Hành động trong phiên" subtitle="Việc trợ lý gợi ý và kết quả trước/sau 3 phút, chưa loại trừ yếu tố khác" />
          {r.actions.length ? (
            <ul className="flex list-none flex-col">
              {r.actions.slice().reverse().map((a) => (
                <li key={`${a.id}-${a.at}`} className="border-b border-line-soft py-2 last:border-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-xs text-ink-lo">{clock(a.at)}</span>
                    <span className="text-sm text-ink-hi">{a.title}</span>
                    {a.status === 'dismissed' && <Badge>Bỏ qua</Badge>}
                  </div>
                  {a.effect && <p className="mt-0.5 text-xs"><EffectLine effect={a.effect} /></p>}
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="Chưa có hành động nào được ghi nhận" />}
        </GlassPanel>

        <GlassPanel tone="strong" className="p-4 sm:p-5">
          <PanelHeader title="So với phiên trước" subtitle={prev ? prev.title : 'Chưa có phiên trước để so'} />
          {prev ? (
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line-soft text-xs text-ink-lo"><th className="py-2 font-medium">Chỉ số</th><th className="py-2 text-right font-medium">Phiên này</th><th className="py-2 text-right font-medium">Phiên trước</th><th className="py-2 text-right font-medium">Chênh</th></tr></thead>
              <tbody>
                {[
                  ['Bình luận', t.comments, prev.comments],
                  ['Lượt chốt', t.byIntent.order, prev.orders],
                  ['Khiếu nại', t.byIntent.complaint, prev.complaints],
                  ['Doanh thu ước tính', r.revenue.estimated, prev.revenue, money]
                ].map(([label, a, b, f]) => (
                  <tr key={label} className="border-b border-line-soft last:border-0">
                    <td className="py-2 text-ink-hi">{label}</td>
                    <td className="py-2 text-right font-mono">{f ? f(a) : fmtInt(a)}</td>
                    <td className="py-2 text-right font-mono text-ink-mid">{b == null ? '—' : f ? f(b) : fmtInt(b)}</td>
                    <td className="py-2 text-right font-mono"><Delta now={a} prev={b} fmt={f || fmtInt} /></td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 text-ink-hi">Khách hỏi được trả lời</td>
                  <td className="py-2 text-right font-mono">{r.response.answeredShare != null ? fmtPct(r.response.answeredShare, 0) : '—'}</td>
                  <td className="py-2 text-right font-mono text-ink-mid">{prev.answeredShare != null ? fmtPct(prev.answeredShare, 0) : '—'}</td>
                  <td className="py-2 text-right font-mono"><Delta now={r.response.answeredShare} prev={prev.answeredShare} pctMode /></td>
                </tr>
              </tbody>
            </table>
          ) : <EmptyState compact title="Phiên đầu tiên" description="Từ phiên sau, báo cáo sẽ so sánh tự động." />}
        </GlassPanel>
      </div>

      <GlassPanel tone="strong" className="p-4 sm:p-5">
        <PanelHeader title="Sản phẩm" subtitle="Hỏi nhiều mà chốt ít là dấu hiệu khách còn do dự về giá, size hoặc chất lượng" />
        {r.products.length ? (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead><tr className="border-b border-line-soft text-xs text-ink-lo"><th className="px-1 py-2 font-medium">Sản phẩm</th><th className="px-1 py-2 text-right font-medium">Câu hỏi</th><th className="px-1 py-2 text-right font-medium">Lượt chốt</th><th className="px-1 py-2 text-right font-medium">Số lượng</th><th className="px-1 py-2 text-right font-medium">Chốt trên hỏi</th><th className="px-1 py-2 text-right font-medium">Khiếu nại</th></tr></thead>
              <tbody>
                {r.products.map((p) => (
                  <tr key={p.id} className="border-b border-line-soft last:border-0">
                    <td className="px-1 py-2 text-ink-hi">{p.name}</td>
                    <td className="px-1 py-2 text-right font-mono">{fmtInt(p.questions)}</td>
                    <td className="px-1 py-2 text-right font-mono">{fmtInt(p.orders)}</td>
                    <td className="px-1 py-2 text-right font-mono">{fmtInt(p.quantity)}</td>
                    <td className="px-1 py-2 text-right font-mono">{p.conversion != null ? fmtPct(p.conversion, 0) : '—'}</td>
                    <td className={`px-1 py-2 text-right font-mono ${p.complaints ? 'text-crit' : ''}`}>{fmtInt(p.complaints)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState compact title="Chưa nhận ra sản phẩm nào" />}
      </GlassPanel>
    </div>
  );
};

export default Report;
