import React from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { ChartTooltip } from '../ui';
import { fmtInt } from '../../lib/format';
import { AXIS_TICK } from '../../lib/tokens';

/**
 * NHỊP PHIÊN — chữ ký của bảng điều khiển live
 * ------------------------------------------------------------------
 * Ba tín hiệu trên CÙNG một trục thời gian: người xem (đường), bình luận mỗi phút
 * (cột xám), lượt chốt mỗi phút (cột xanh). Nhìn một chỗ là biết người xem có đang
 * biến thành đơn không, lúc nào bình luận nhiều mà không ai chốt.
 * Màu chốt đơn và bình luận trùng huy hiệu ý định ở mọi chỗ trên trang (live/shared.jsx).
 */

const C = { viewers: 'var(--accent)', comments: 'var(--viz-neu)', orders: 'var(--sev-ok)' };

const hhmm = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const dec = (x) => (x == null ? '—' : Number(x).toFixed(1).replace('.', ',').replace(/,0$/, ''));

const STATE = {
  up: { word: 'đang tăng', icon: TrendingUp, cls: 'text-ok' },
  steady: { word: 'đều', icon: Minus, cls: 'text-ink-mid' },
  down: { word: 'đang chậm lại', icon: TrendingDown, cls: 'text-high' },
  start: { word: 'mới bắt đầu có đơn', icon: TrendingUp, cls: 'text-ink-mid' },
  none: { word: 'chưa có đơn', icon: Minus, cls: 'text-ink-lo' }
};

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <ChartTooltip title={hhmm(label)}>
      {r.viewers != null && <p>{fmtInt(r.viewers)} người xem</p>}
      <p>{fmtInt(r.total)} bình luận</p>
      <p>{fmtInt(r.order)} lượt chốt{r.qty ? `, ${fmtInt(r.qty)} sản phẩm` : ''}</p>
    </ChartTooltip>
  );
};

/** Một con số lớn kèm một dòng giải thích; màu chỉ là phụ, luôn có chữ */
const Figure = ({ swatch, value, label, note, children }) => (
  <div className="min-w-0">
    <p className="flex items-center gap-1.5 text-xs text-ink-mid">
      <span className="h-2.5 w-3 shrink-0 rounded-xs" style={{ background: swatch }} aria-hidden="true" />
      {label}
    </p>
    <p className="mt-1 text-metric leading-none font-semibold tabular-nums text-ink-hi">{value}</p>
    <p className="mt-1.5 text-xs text-ink-lo">{children || note}</p>
  </div>
);

const Pulse = ({ stats, live }) => {
  const series = (stats?.series || []).map((m) => ({ ...m, viewers: Number.isFinite(m.viewers) ? m.viewers : null }));
  const hasViewers = series.some((m) => m.viewers != null);
  const sales = stats?.trend?.sales || {};
  const st = STATE[sales.state] || STATE.none;
  const t = stats?.totals || {};
  const viewersNow = stats?.viewers?.now;

  return (
    <section aria-labelledby="pulse-title" className="glass-strong rounded-surf p-4 sm:p-6">
      <h2 id="pulse-title" className="sr-only">Nhịp phiên</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Figure
          swatch={C.viewers}
          label="Người xem"
          value={viewersNow != null ? fmtInt(viewersNow) : '—'}
          note={stats?.viewers?.peak ? `Cao nhất ${fmtInt(stats.viewers.peak)}` : 'Nền tảng chưa báo số người xem'}
        />
        <Figure
          swatch={C.comments}
          label="Bình luận mỗi phút"
          value={live ? fmtInt(t.perMinuteNow) : '—'}
          note={`${fmtInt(t.comments)} bình luận từ ${fmtInt(t.commenters)} người`}
        />
        <Figure swatch={C.orders} label="Lượt chốt mỗi phút, 5 phút qua" value={dec(sales.perMinNow)}>
          <span className={`inline-flex items-center gap-1 ${st.cls}`}>
            <st.icon size={13} aria-hidden="true" />
            {st.word}
            {(sales.state === 'up' || sales.state === 'down' || sales.state === 'steady') && <span className="text-ink-lo">, trước đó {dec(sales.perMinBefore)}</span>}
          </span>
          {sales.per100Viewers != null && <span className="block text-ink-lo">{dec(sales.per100Viewers)} lượt chốt trên 100 người xem, 10 phút qua</span>}
        </Figure>
      </div>

      <div className="mt-5 h-44 sm:h-52">
        {series.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 4, right: hasViewers ? 0 : 4, bottom: 0, left: 0 }} barGap={1}>
              <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
              <XAxis dataKey="t" tickFormatter={hhmm} tick={AXIS_TICK} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis yAxisId="n" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => fmtInt(v)} />
              {hasViewers && <YAxis yAxisId="v" orientation="right" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => fmtInt(v)} />}
              <Tooltip content={<Tip />} cursor={{ fill: 'var(--raised)' }} />
              <Bar yAxisId="n" dataKey="total" fill={C.comments} fillOpacity={0.45} isAnimationActive={false} maxBarSize={14} radius={[2, 2, 0, 0]} />
              <Bar yAxisId="n" dataKey="order" fill={C.orders} isAnimationActive={false} maxBarSize={14} radius={[2, 2, 0, 0]} />
              {hasViewers && <Line yAxisId="v" dataKey="viewers" stroke={C.viewers} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="grid h-full place-items-center text-sm text-ink-lo">Biểu đồ hiện khi có bình luận đầu tiên.</p>
        )}
      </div>
    </section>
  );
};

export default Pulse;
