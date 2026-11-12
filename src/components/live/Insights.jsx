import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { GlassPanel, PanelHeader, EmptyState } from '../ui';
import { fmtInt } from '../../lib/format';
import { INTENT_MAP } from './shared';

/**
 * NHỊP PHIÊN LIVE
 *   Nhịp bình luận theo phút, tách câu hỏi, chốt đơn, khiếu nại: thấy ngay
 *   lúc mở flash sale kéo được bao nhiêu đơn, lúc nào khách bắt đầu hỏi dồn.
 *   Khách hỏi gì nhiều nhất: thiếu thông tin nào trên sóng thì nói lại ngay.
 *   Sản phẩm được quan tâm: số câu hỏi và số đơn theo từng sản phẩm.
 */

const SERIES = ['question', 'order', 'complaint'];

const hhmm = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-ink-hi">{hhmm(label)}</p>
      <p className="mt-1 text-ink-mid">{fmtInt(row.total)} bình luận</p>
      {SERIES.map((k) => (
        <p key={k} className="flex items-center gap-1.5 text-ink-mid">
          <span className="size-2 rounded-sm" style={{ background: INTENT_MAP[k].color }} aria-hidden="true" />
          {INTENT_MAP[k].label}: <span className="font-mono">{fmtInt(row[k])}</span>
        </p>
      ))}
    </div>
  );
};

/** stacked: tên một dòng, số liệu dòng dưới (tên sản phẩm dài, cột hẹp) */
const Bars = ({ items, max, render, stacked = false }) => (
  <ul className="flex list-none flex-col gap-2.5">
    {items.map((it) => (
      <li key={it.key || it.id}>
        <div className={stacked ? 'text-sm' : 'flex items-baseline justify-between gap-3 text-sm'}>
          <span className={stacked ? 'block truncate text-ink-hi' : 'min-w-0 truncate text-ink-hi'} title={it.label || it.name}>{it.label || it.name}</span>
          <span className={stacked ? 'block text-xs text-ink-mid' : 'shrink-0 font-mono text-xs text-ink-mid'}>{render(it)}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised">
          <div className="h-full rounded-full bg-accent" style={{ width: `${max ? Math.max(3, ((it.count ?? it.score) / max) * 100) : 0}%` }} />
        </div>
      </li>
    ))}
  </ul>
);

export const Rhythm = ({ stats }) => {
  const series = stats?.series || [];
  return (
    <GlassPanel tone="strong" className="p-4 sm:p-5">
      <PanelHeader title="Nhịp bình luận" subtitle="Số bình luận mỗi phút" className="mb-3" />
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-ink-mid">
            {SERIES.map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="size-2 rounded-sm" style={{ background: INTENT_MAP[k].color }} aria-hidden="true" />
                {INTENT_MAP[k].label}
              </span>
            ))}
      </div>
      {series.length ? (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid vertical={false} stroke="var(--border-soft)" />
              <XAxis dataKey="t" tickFormatter={hhmm} tick={{ fontSize: 10, fill: 'var(--text-lo)' }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-lo)' }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--raised)' }} />
              {SERIES.map((k, i) => (
                <Bar key={k} dataKey={k} stackId="a" fill={INTENT_MAP[k].color} radius={i === SERIES.length - 1 ? [2, 2, 0, 0] : 0} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState compact title="Chưa có dữ liệu" />
      )}
    </GlassPanel>
  );
};

export const Topics = ({ stats }) => {
  const topics = (stats?.topics || []).slice(0, 6);
  const max = topics[0]?.count || 0;
  return (
    <GlassPanel tone="strong" className="p-4 sm:p-5">
      <PanelHeader title="Khách hỏi gì nhiều nhất" />
      {topics.length ? <Bars items={topics} max={max} render={(t) => `${fmtInt(t.count)} câu`} /> : <EmptyState compact title="Chưa có câu hỏi" />}
    </GlassPanel>
  );
};

export const Products = ({ stats }) => {
  const products = (stats?.products || []).slice(0, 6).map((p) => ({ ...p, score: p.orders * 3 + p.questions }));
  const max = Math.max(0, ...products.map((p) => p.score));
  return (
    <GlassPanel tone="strong" className="p-4 sm:p-5">
      <PanelHeader title="Sản phẩm được quan tâm" subtitle="Một đơn chốt tính bằng ba câu hỏi" />
      {products.length ? (
        <Bars stacked items={products} max={max} render={(p) => `${fmtInt(p.quantity)} đã chốt, ${fmtInt(p.questions)} câu hỏi`} />
      ) : (
        <EmptyState compact title="Chưa nhận ra sản phẩm nào" description="Khai báo danh mục và từ khóa để bình luận được gắn đúng sản phẩm." />
      )}
    </GlassPanel>
  );
};
