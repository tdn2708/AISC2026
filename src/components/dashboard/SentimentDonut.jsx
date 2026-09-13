import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { GlassPanel, PanelHeader } from './Glass';
import { fmtInt, fmtPct, SENTIMENT } from './format';

/**
 * DONUT — phân bổ cảm xúc.
 * Donut hợp lệ ở đây vì chỉ có BA phần và câu hỏi là "tỉ trọng trên tổng
 * thể", không phải so sánh các giá trị sát nhau. Tâm donut chứa đúng một
 * con số cần quyết định: phần trăm tiêu cực. Bảng chú giải bên dưới ghi
 * đủ số lượng, nên không giá trị nào chỉ đọc được qua tooltip.
 */

const DonutTooltip = ({ active, payload, total }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs shadow-2xl">
      <p className="flex items-center gap-2">
        <span className="size-2 rounded-sm bg-(--c)" style={{ '--c': p.payload.color }} aria-hidden="true" />
        <span className="font-semibold tabular-nums text-ink-hi">{fmtPct(total ? p.value / total : null)}</span>
        <span className="text-ink-mid">{p.name}</span>
      </p>
    </div>
  );
};

const SentimentDonut = ({ data = [] }) => {
  const rows = SENTIMENT.map((s) => ({ ...s, value: data.find((d) => d.key === s.key)?.value ?? 0 }));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const negShare = total ? rows[0].value / total : null;

  return (
    <GlassPanel className="flex h-full flex-col p-5">
      <PanelHeader title="Phân bổ cảm xúc" subtitle={`${fmtInt(total)} phản hồi hợp lệ`} />

      {total === 0 ? (
        <div className="grid flex-1 place-items-center py-10 text-center text-sm text-ink-lo">
          Chưa có phản hồi nào đạt ngưỡng tin cậy trong kỳ này
        </div>
      ) : (
        <>
          <div className="relative mx-auto aspect-square w-full max-w-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="74%"
                  outerRadius="100%"
                  startAngle={90}
                  endAngle={-270}
                  paddingAngle={2}
                  cornerRadius={3}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {rows.map((r) => (
                    <Cell key={r.key} fill={r.color} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
              <span className="text-3xl font-semibold leading-none text-ink-hi proportional-nums">{fmtPct(negShare, 0)}</span>
              <span className="mt-1 text-[0.68rem] uppercase tracking-[0.1em] text-ink-lo">tiêu cực</span>
            </div>
          </div>

          <ul className="mt-5 flex list-none flex-col gap-2 text-xs">
            {rows.map((r) => (
              <li key={r.key} className="grid grid-cols-[auto_1fr_auto_3.5rem] items-center gap-2">
                <span className="size-2.5 rounded-sm bg-(--c)" style={{ '--c': r.color }} aria-hidden="true" />
                <span className="text-ink-mid">{r.label}</span>
                <span className="tabular-nums text-ink-lo">{fmtInt(r.value)}</span>
                <span className="text-right font-medium tabular-nums text-ink-hi">{fmtPct(r.value / total)}</span>
              </li>
            ))}
          </ul>

          <p className="mt-auto border-t border-line/40 pt-3 text-xs leading-relaxed text-ink-mid">
            Cứ 10 phản hồi thì có <span className="font-semibold text-ink-hi">{Math.round((negShare ?? 0) * 10)}</span> phản hồi tiêu cực.
          </p>
        </>
      )}
    </GlassPanel>
  );
};

export default SentimentDonut;
