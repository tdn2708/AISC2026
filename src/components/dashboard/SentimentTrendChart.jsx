import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { GlassPanel, PanelHeader } from './Glass';
import { fmtInt } from './format';

/**
 * LINE CHART — diễn biến theo thời gian.
 * Hai chuỗi chung MỘT trục (cùng đơn vị: số phản hồi), không bao giờ
 * hai trục y. Lưới ngang mảnh, nét liền; đường 2px; không chấm trên
 * từng điểm — con trỏ dọc và tooltip đảm nhận việc đọc giá trị.
 */

const SERIES = [
  { key: 'complaints', label: 'Tiêu cực', color: 'var(--viz-neg)' },
  { key: 'satisfaction', label: 'Tích cực', color: 'var(--viz-pos)' }
];

const AXIS_TICK = { fontSize: 11, fill: 'var(--text-lo)' };

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs shadow-2xl">
      <p className="mb-1 text-ink-lo">Kỳ {label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 leading-6">
          <span className="h-0.5 w-3 rounded-full bg-(--c)" style={{ '--c': p.color }} aria-hidden="true" />
          <span className="font-semibold tabular-nums text-ink-hi">{fmtInt(p.value)}</span>
          <span className="text-ink-mid">{p.name}</span>
        </p>
      ))}
    </div>
  );
};

const SentimentTrendChart = ({ data = [] }) => {
  const [view, setView] = useState('chart');
  const totals = Object.fromEntries(SERIES.map((s) => [s.key, data.reduce((sum, d) => sum + (d[s.key] || 0), 0)]));

  const toggle = (
    <div className="flex items-center gap-4">
      <ul className="flex list-none gap-4 text-xs text-ink-mid">
        {SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-(--c)" style={{ '--c': s.color }} aria-hidden="true" />
            {s.label}
            <span className="tabular-nums text-ink-hi">{fmtInt(totals[s.key])}</span>
          </li>
        ))}
      </ul>
      <div className="flex rounded-md border border-line/70 p-0.5 text-[0.7rem]" role="group" aria-label="Kiểu hiển thị">
        {[
          ['chart', 'Biểu đồ'],
          ['table', 'Bảng']
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={`rounded px-2 py-0.5 transition-colors ${view === key ? 'bg-raised text-ink-hi' : 'text-ink-lo hover:text-ink-mid'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <GlassPanel className="p-5">
      <PanelHeader
        title="Diễn biến cảm xúc theo thời gian"
        subtitle="Số phản hồi hợp lệ mỗi kỳ · 14 kỳ trong 28 ngày gần nhất"
        right={toggle}
      />

      {data.length === 0 ? (
        <div className="grid h-[280px] place-items-center text-sm text-ink-lo">Chưa có phản hồi trong khoảng thời gian này</div>
      ) : view === 'chart' ? (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: 'var(--border)' }} tickLine={false} dy={6} minTickGap={16} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={44} allowDecimals={false} tickFormatter={fmtInt} />
              <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--text-lo)', strokeWidth: 1 }} />
              {SERIES.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[280px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface text-ink-lo">
              <tr>
                <th className="py-2 pr-4 font-medium">Kỳ</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="py-2 pr-4 text-right font-medium">{s.label}</th>
                ))}
                <th className="py-2 text-right font-medium">Tổng hợp lệ</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-ink-mid">
              {data.map((d) => (
                <tr key={d.name} className="border-t border-line/40">
                  <td className="py-1.5 pr-4">{d.name}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="py-1.5 pr-4 text-right text-ink-hi">{fmtInt(d[s.key])}</td>
                  ))}
                  <td className="py-1.5 text-right">{fmtInt(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassPanel>
  );
};

export default SentimentTrendChart;
