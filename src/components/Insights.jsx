import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { X, RotateCcw, ArrowUp, ArrowDown } from 'lucide-react';
import { PageHeader, GlassPanel, PanelHeader, Segmented, Button, EmptyState } from './ui';
import { useDataVersion } from '../lib/dataVersion';
import { fmtInt, fmtPct, SENTIMENT } from '../lib/format';
import { COL, SENT, slice, kpis, groupBy, crossNeg, series, dataSpan } from '../lib/cube';

/**
 * BẢNG SỐ LIỆU — xem số liệu theo kiểu công cụ BI
 * ------------------------------------------------------------------
 *   [ Khoảng thời gian | Cảm xúc | các lựa chọn đang lọc | Bỏ lọc       ]
 *   [ Bốn chỉ số chính, mỗi số có đường xu hướng và so với kỳ trước      ]
 *   [ Diễn biến theo kỳ                         8 ][ Theo kênh        4 ]
 *   [ Nhóm vấn đề                               5 ][ Kênh × nhóm      7 ]
 *   [ Sản phẩm                                  8 ][ Số sao           4 ]
 *
 * Bấm một cột, một ô hay một dòng là lọc mọi khối còn lại (lọc chéo); bấm
 * lần nữa để bỏ. Lựa chọn nằm trên URL, gửi link là người nhận thấy đúng
 * góc nhìn đó. Mọi con số tính từ phản hồi được tính (trọng số > 0), tỉ lệ
 * tiêu cực tính theo trọng số tin cậy như các trang khác.
 */

const PERIODS = [
  { value: '7', label: '7 ngày' },
  { value: '30', label: '30 ngày' },
  { value: '90', label: '90 ngày' },
  { value: '365', label: '1 năm' },
  { value: 'all', label: 'Toàn bộ' }
];
const SENT_PARAM = { neg: SENT.neg, neu: SENT.neu, pos: SENT.pos };
const SENT_OPTIONS = [
  { value: '', label: 'Mọi cảm xúc' },
  { value: 'neg', label: 'Tiêu cực' },
  { value: 'neu', label: 'Trung tính' },
  { value: 'pos', label: 'Tích cực' }
];
const DAY = 86400000;

const dec = (v, d = 1) => (v == null || !Number.isFinite(v) ? 'Chưa có' : v.toFixed(d).replace('.', ','));
const dayLabel = (asOf, back) => {
  const d = new Date(new Date(asOf).getTime() - back * DAY);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/* ---------------- Chỉ số chính ---------------- */

const Spark = ({ values, color = 'var(--accent)', label }) => {
  const pts = values.filter((v) => v != null);
  if (pts.length < 3) return <span className="block h-9" aria-hidden="true" />;
  const W = 160, H = 36, P = 3;
  const max = Math.max(...pts), min = Math.min(...pts);
  const rng = max - min || 1;
  let i = -1;
  const d = values.map((v, k) => {
    if (v == null) return '';
    i += 1;
    const x = P + (k * (W - 2 * P)) / Math.max(1, values.length - 1);
    const y = H - P - ((v - min) / rng) * (H - 2 * P);
    return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-9 w-full max-w-[160px]" role="img" aria-label={label}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/** Chênh so với kỳ trước; `good` = chiều tăng là tốt (true), xấu (false) hay trung tính (null) */
const Delta = ({ now, prev, unit, good, digits = 1 }) => {
  if (now == null || prev == null || !Number.isFinite(now - prev)) return <span className="text-sm text-ink-lo">Chưa có kỳ trước để so</span>;
  const diff = now - prev;
  if (Math.abs(diff) < 10 ** -(digits + 1)) return <span className="text-sm text-ink-mid">Như kỳ trước</span>;
  const up = diff > 0;
  const tone = good == null ? 'text-ink-mid' : up === good ? 'text-ok' : 'text-crit';
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${tone}`}>
        <Icon size={13} aria-hidden="true" />
        {unit === 'rel' ? fmtPct(Math.abs(diff / (prev || 1)), 0) : `${dec(Math.abs(diff), digits)}${unit}`}
      </span>
      <span className="text-ink-lo">so với kỳ trước</span>
    </span>
  );
};

const KpiStrip = ({ cur, prev, line, hasPrev }) => {
  const cells = [
    { label: 'Phản hồi được tính', value: fmtInt(cur.count), delta: <Delta now={cur.count} prev={hasPrev ? prev.count : null} unit="rel" good={null} />, spark: line.map((b) => b.n), color: 'var(--accent)' },
    { label: 'Tỉ lệ tiêu cực', value: fmtPct(cur.negRate, 1), delta: <Delta now={cur.negRate == null ? null : cur.negRate * 100} prev={hasPrev && prev.negRate != null ? prev.negRate * 100 : null} unit=" điểm %" good={false} />, spark: line.map((b) => (b.w > 0 ? b.wNeg / b.w : null)), color: 'var(--viz-neg)' },
    { label: 'Số sao trung bình', value: cur.stars == null ? 'Chưa có' : `${dec(cur.stars, 2)} sao`, delta: <Delta now={cur.stars} prev={hasPrev ? prev.stars : null} unit=" sao" good digits={2} />, spark: line.map((b) => (b.starN ? b.starSum / b.starN : null)), color: 'var(--accent)' },
    { label: 'Có chứng từ hoặc người duyệt', value: fmtPct(cur.proofShare, 0), delta: <Delta now={cur.proofShare == null ? null : cur.proofShare * 100} prev={hasPrev && prev.proofShare != null ? prev.proofShare * 100 : null} unit=" điểm %" good />, spark: line.map((b) => (b.n ? b.proof / b.n : null)), color: 'var(--accent)' }
  ];
  return (
    <section aria-label="Chỉ số chính" className="mb-6 grid grid-cols-1 overflow-hidden glass-strong rounded-xl sm:grid-cols-2 xl:grid-cols-4">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex min-w-0 flex-col gap-2 p-5 ${i ? 'border-t border-line-soft sm:border-t-0' : ''} ${i % 2 ? 'sm:border-l sm:border-line-soft' : ''} ${i >= 2 ? 'sm:border-t xl:border-t-0' : ''} ${i === 2 ? 'xl:border-l xl:border-line-soft' : ''}`}>
          <span className="text-sm text-ink-mid">{c.label}</span>
          <span className="font-mono text-metric font-semibold tracking-[-0.02em] text-ink-hi">{c.value}</span>
          {c.delta}
          <Spark values={c.spark} color={c.color} label={`${c.label} theo từng kỳ`} />
        </div>
      ))}
    </section>
  );
};

/* ---------------- Biểu đồ lọc được ---------------- */

/** Danh sách cột ngang bấm được: chọn thì tô đậm, các cột khác nhạt đi */
const BarList = ({ items, selected, onPick, color = 'var(--accent)', metric = (it) => it.n, render, empty = 'Không có dữ liệu trong phạm vi này' }) => {
  if (!items.length) return <p className="py-8 text-center text-sm text-ink-lo">{empty}</p>;
  const max = Math.max(...items.map(metric), 1);
  return (
    <ul className="flex list-none flex-col">
      {items.map((it) => {
        const on = selected === it.key;
        const dim = selected != null && !on;
        return (
          <li key={it.key}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? null : it.key)}
              className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 text-left transition-[background-color,opacity] duration-150 hover:bg-raised ${dim ? 'opacity-45 hover:opacity-100' : ''} ${on ? 'bg-accent-dim' : ''}`}
            >
              <span className="min-w-0 truncate text-sm text-ink-hi">{it.label}</span>
              <span className="font-mono text-sm text-ink-hi">{render ? render(it) : fmtInt(metric(it))}</span>
              <span className="col-span-2 block h-2 overflow-hidden rounded-sm bg-raised">
                <span className="block h-full w-full origin-left rounded-sm transition-transform duration-300" style={{ background: color, transform: `scaleX(${metric(it) / max})` }} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/** Bản đồ nhiệt kênh × nhóm vấn đề: mỗi ô là số phản hồi tiêu cực */
const Heatmap = ({ rows: rowDims, cols: colDims, cells, sel, onPick }) => {
  const max = Math.max(1, ...cells.values());
  if (!rowDims.length || !colDims.length) return <p className="py-8 text-center text-sm text-ink-lo">Không có phản hồi tiêu cực trong phạm vi này</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-[30%] pb-1 text-left text-xs font-medium text-ink-lo">Nhóm vấn đề</th>
            {colDims.map((c) => (
              <th key={c.key} scope="col" className={`px-1 pb-1 text-center text-xs font-medium whitespace-nowrap ${sel.src === c.key ? 'text-accent-hi' : 'text-ink-mid'}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowDims.map((r) => (
            <tr key={r.key}>
              <th scope="row" className={`pr-2 text-left text-sm font-normal ${sel.cat === r.key ? 'font-semibold text-accent-hi' : 'text-ink-mid'}`}>
                <span className="line-clamp-1">{r.label}</span>
              </th>
              {colDims.map((c) => {
                const v = cells.get(`${r.id}|${c.id}`) || 0;
                const t = v / max;
                const on = sel.cat === r.key && sel.src === c.key;
                return (
                  <td key={c.key} className="p-0">
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`${r.label}, ${c.label}: ${fmtInt(v)} phản hồi tiêu cực`}
                      disabled={!v}
                      onClick={() => onPick(on ? { cat: null, src: null } : { cat: r.key, src: c.key })}
                      className={`grid h-10 w-full place-items-center rounded font-mono text-sm transition-[box-shadow] duration-150 enabled:hover:ring-2 enabled:hover:ring-ink-lo disabled:cursor-default ${on ? 'ring-2 ring-accent' : ''}`}
                      style={{
                        // Nền đậm tối đa 60% để chữ đậm trên ô luôn đọc được (từ 4,5:1 trở lên)
                        background: v ? `color-mix(in oklab, var(--sev-crit) ${Math.round(8 + t * 52)}%, var(--surface))` : 'var(--raised)',
                        color: 'var(--text-hi)',
                        fontWeight: t > 0.6 ? 600 : 400
                      }}
                    >
                      {v ? fmtInt(v) : ''}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const SORTS = {
  n: { label: 'Phản hồi', get: (g) => g.n },
  negRate: { label: 'Tỉ lệ tiêu cực', get: (g) => g.negRate ?? -1 },
  stars: { label: 'Số sao', get: (g) => g.stars ?? -1 },
  proofShare: { label: 'Có chứng từ', get: (g) => g.proofShare ?? -1 }
};

const ProductTable = ({ groups, names, selected, onPick }) => {
  const [sort, setSort] = useState('n');
  const [desc, setDesc] = useState(true);
  const rows = [...groups].sort((a, b) => (SORTS[sort].get(b) - SORTS[sort].get(a)) * (desc ? 1 : -1)).slice(0, 12);
  if (!rows.length) return <p className="py-8 text-center text-sm text-ink-lo">Phản hồi trong phạm vi này không gắn sản phẩm</p>;
  const head = (k, cls = '') => (
    <th scope="col" className={`py-2 font-medium text-ink-mid ${cls}`} aria-sort={sort === k ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(true)))} className="inline-flex items-center gap-1 rounded px-1 whitespace-nowrap hover:text-ink-hi">
        {SORTS[k].label}
        {sort === k && (desc ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />)}
      </button>
    </th>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="w-[42%] py-2 pr-2 text-left font-medium text-ink-mid">Sản phẩm</th>
            {head('n', 'text-right')}
            {head('negRate', 'text-right')}
            {head('stars', 'text-right')}
            {head('proofShare', 'text-right')}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const key = names[g.id];
            const on = selected === key;
            return (
              <tr key={g.id} className={`border-b border-line-soft last:border-b-0 ${on ? 'bg-accent-dim' : selected != null ? 'opacity-55' : ''}`}>
                <td className="max-w-0 py-0 pr-2">
                  <button type="button" aria-pressed={on} onClick={() => onPick(on ? null : key)} className="block w-full truncate rounded py-2.5 text-left text-ink-hi hover:text-accent-hi hover:underline">
                    {key}
                  </button>
                </td>
                <td className="py-2.5 text-right font-mono">{fmtInt(g.n)}</td>
                <td className="py-2.5 text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="hidden h-1.5 w-14 overflow-hidden rounded-sm bg-raised sm:block" aria-hidden="true">
                      <span className="block h-full w-full origin-left bg-neg" style={{ transform: `scaleX(${g.negRate ?? 0})` }} />
                    </span>
                    <span className="font-mono">{fmtPct(g.negRate, 1)}</span>
                  </span>
                </td>
                <td className="py-2.5 text-right font-mono">{dec(g.stars, 2)}</td>
                <td className="py-2.5 text-right font-mono">{fmtPct(g.proofShare, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const TimeTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs">
      <p className="mb-1 text-ink-lo">{label}</p>
      {[...payload].reverse().map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 leading-6">
          <span className="size-2 rounded-sm bg-(--c)" style={{ '--c': p.color }} aria-hidden="true" />
          <span className="font-semibold tabular-nums text-ink-hi">{fmtInt(p.value)}</span>
          <span className="text-ink-mid">{p.name}</span>
        </p>
      ))}
    </div>
  );
};

/* ---------------- Trang ---------------- */

const Insights = () => {
  const [params, setParams] = useSearchParams();
  const [cube, setCube] = useState(null);
  const [error, setError] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    let alive = true;
    setError(false);
    axios.get('/bi/cube').then((r) => alive && setCube(r.data)).catch(() => alive && setError(true));
    return () => { alive = false; };
  }, [version]);

  const period = PERIODS.some((p) => p.value === params.get('days')) ? params.get('days') : '90';
  const sentKey = SENT_PARAM[params.get('sent')] != null ? params.get('sent') : '';
  const pick = {
    src: params.get('src'),
    cat: params.get('cat'),
    prod: params.get('prod')
  };

  const setParam = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k); else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const view = useMemo(() => {
    if (!cube) return null;
    const { rows, dicts, asOf } = cube;
    const srcIdx = pick.src != null ? dicts.source.indexOf(pick.src) : null;
    const catIdx = pick.cat != null ? dicts.category.findIndex((c) => c.key === pick.cat) : null;
    const prodIdx = pick.prod != null ? dicts.product.indexOf(pick.prod) : null;
    const sel = {
      src: srcIdx != null && srcIdx >= 0 ? srcIdx : null,
      cat: catIdx != null && catIdx >= 0 ? catIdx : null,
      prod: prodIdx != null && prodIdx >= 0 ? prodIdx : null,
      sent: sentKey ? SENT_PARAM[sentKey] : null
    };
    const span = period === 'all' ? Math.max(1, dataSpan(rows)) : Number(period);
    const win = { from: 0, to: span };
    const all = slice(rows, sel, win);
    const prevRows = period === 'all' ? [] : slice(rows, sel, { from: span, to: span * 2 });
    const line = series(all, span);

    const bySource = groupBy(slice(rows, sel, { ...win, except: 'src' }), COL.source)
      .map((g) => ({ ...g, key: dicts.source[g.id], label: dicts.source[g.id] }))
      .sort((a, b) => b.n - a.n);
    const forCat = slice(rows, sel, { ...win, except: 'cat' });
    const byCategory = groupBy(forCat, COL.category)
      .map((g) => ({ ...g, key: dicts.category[g.id].key, label: dicts.category[g.id].label }))
      .filter((g) => g.neg > 0)
      .sort((a, b) => b.neg - a.neg);
    const byCause = groupBy(all, COL.cause)
      .filter((g) => g.neg > 0)
      .sort((a, b) => b.neg - a.neg)
      .slice(0, 5)
      .map((g) => ({ ...g, label: dicts.cause[g.id].label }));
    // Bản đồ nhiệt bỏ qua lựa chọn kênh và nhóm, để vẫn thấy cả bảng
    const heatRows = slice(rows, { ...sel, src: null, cat: null }, win);
    const cells = crossNeg(heatRows, COL.category, COL.source);
    const heatCats = groupBy(heatRows, COL.category).filter((g) => g.neg > 0).sort((a, b) => b.neg - a.neg)
      .map((g) => ({ id: g.id, key: dicts.category[g.id].key, label: dicts.category[g.id].label }));
    const heatSrcs = groupBy(heatRows, COL.source).sort((a, b) => b.n - a.n).map((g) => ({ id: g.id, key: dicts.source[g.id], label: dicts.source[g.id] }));
    const byProduct = groupBy(slice(rows, sel, { ...win, except: 'prod' }), COL.product);
    const ratings = [5, 4, 3, 2, 1].map((s) => ({ key: String(s), label: `${s} sao`, n: all.filter((r) => r[COL.rating] === s).length }));

    return {
      asOf, dicts, span, sel, hasPrev: prevRows.length > 0,
      cur: kpis(all), prev: kpis(prevRows), line,
      timeData: line.map((b) => ({
        name: b.size === 1 ? dayLabel(asOf, b.from) : `${dayLabel(asOf, b.from + b.size - 1)} đến ${dayLabel(asOf, b.from)}`,
        short: dayLabel(asOf, b.from),
        Negative: b.neg, Neutral: b.neu, Positive: b.pos
      })),
      granularity: line[0]?.size === 1 ? 'ngày' : line[0]?.size === 7 ? 'tuần' : `${line[0]?.size} ngày`,
      bySource, byCategory, byCause, cells, heatCats, heatSrcs, byProduct, ratings,
      empty: all.length === 0
    };
  }, [cube, period, sentKey, pick.src, pick.cat, pick.prod]);

  const chips = [
    pick.src && { k: 'src', label: `Kênh: ${pick.src}` },
    pick.cat && view && { k: 'cat', label: `Nhóm: ${view.dicts.category.find((c) => c.key === pick.cat)?.label || pick.cat}` },
    pick.prod && { k: 'prod', label: `Sản phẩm: ${pick.prod}` },
    sentKey && { k: 'sent', label: `Cảm xúc: ${SENT_OPTIONS.find((o) => o.value === sentKey).label}` }
  ].filter(Boolean);

  const header = (
    <PageHeader
      title="Bảng số liệu"
      subtitle="Bấm một cột, một ô hay một dòng sản phẩm để lọc mọi khối còn lại. Bấm lần nữa để bỏ lọc."
    />
  );

  if (error && !cube) {
    return (
      <div className="cx">
        {header}
        <GlassPanel tone="strong" className="p-6">
          <EmptyState title="Không tải được số liệu" description="Máy chủ phân tích chưa trả lời. Thử tải lại trang sau ít phút." />
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="cx">
      {header}

      {/* Thanh lọc: khoảng thời gian, cảm xúc, các lựa chọn đang áp dụng */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line pb-4">
        <Segmented label="Khoảng thời gian" value={period} onChange={(v) => setParam({ days: v === '90' ? null : v })} options={PERIODS} />
        <Segmented label="Cảm xúc" value={sentKey} onChange={(v) => setParam({ sent: v })} options={SENT_OPTIONS} />
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Đang lọc theo">
            {chips.map((c) => (
              <button
                key={c.k}
                type="button"
                onClick={() => setParam({ [c.k]: null })}
                className="inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded-md border border-accent bg-accent-dim px-2.5 text-sm text-accent-hi hover:bg-accent/20"
                aria-label={`Bỏ lọc ${c.label}`}
              >
                <span className="truncate">{c.label}</span>
                <X size={14} className="shrink-0" aria-hidden="true" />
              </button>
            ))}
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setParam({ src: null, cat: null, prod: null, sent: null })}>
              Bỏ hết lọc
            </Button>
          </div>
        )}
        {view && (
          <p className="ml-auto text-sm text-ink-lo">
            Mốc dữ liệu {dayLabel(view.asOf, 0)}/{new Date(view.asOf).getFullYear()}
          </p>
        )}
      </div>

      {!view ? (
        <div className="grid gap-6" aria-busy="true">
          <div className="h-40 animate-pulse rounded-xl bg-raised" />
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="h-80 animate-pulse rounded-xl bg-raised xl:col-span-2" />
            <div className="h-80 animate-pulse rounded-xl bg-raised" />
          </div>
        </div>
      ) : view.empty ? (
        <GlassPanel tone="strong" className="p-6">
          <EmptyState
            title="Không có phản hồi nào trong phạm vi này"
            description={`Khoảng ${PERIODS.find((p) => p.value === period).label.toLowerCase()} với các lựa chọn hiện tại không có phản hồi được tính. Chọn khoảng dài hơn hoặc bỏ bớt lọc.`}
          />
        </GlassPanel>
      ) : (
        <>
          <KpiStrip cur={view.cur} prev={view.prev} line={view.line} hasPrev={view.hasPrev} />

          <div className="grid grid-cols-12 items-start gap-6">
            <GlassPanel tone="strong" className="col-span-12 p-6 xl:col-span-8">
              <PanelHeader
                title="Diễn biến theo thời gian"
                subtitle={`Số phản hồi mỗi ${view.granularity}, chia theo cảm xúc`}
                right={
                  <ul className="flex list-none flex-wrap gap-x-4 gap-y-1 text-sm text-ink-mid">
                    {SENTIMENT.map((s) => (
                      <li key={s.key} className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm bg-(--c)" style={{ '--c': s.color }} aria-hidden="true" />
                        {s.label}
                      </li>
                    ))}
                  </ul>
                }
              />
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={view.timeData} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap="18%">
                    <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
                    <XAxis dataKey="short" tick={{ fontSize: 12, fill: 'var(--text-lo)' }} tickLine={false} axisLine={{ stroke: 'var(--border)' }} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-lo)' }} tickLine={false} axisLine={false} width={56} allowDecimals={false} tickFormatter={(v) => fmtInt(v)} />
                    <Tooltip content={<TimeTooltip />} cursor={{ fill: 'var(--raised)' }} labelFormatter={(_, p) => p?.[0]?.payload?.name} />
                    {SENTIMENT.map((s, i) => (
                      <Bar key={s.key} dataKey={s.key} name={s.label} stackId="s" fill={s.color} radius={i === 2 ? [2, 2, 0, 0] : 0} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlassPanel>

            <GlassPanel tone="strong" className="col-span-12 p-6 md:col-span-6 xl:col-span-4">
              <PanelHeader title="Theo kênh" subtitle="Số phản hồi và tỉ lệ tiêu cực" />
              <BarList
                items={view.bySource}
                selected={pick.src}
                onPick={(k) => setParam({ src: k })}
                render={(it) => (
                  <>
                    {fmtInt(it.n)} <span className="ml-1 text-ink-lo">{fmtPct(it.negRate, 0)}</span>
                  </>
                )}
              />
            </GlassPanel>

            <GlassPanel tone="strong" className="col-span-12 p-6 md:col-span-6 xl:col-span-5">
              <PanelHeader title="Nhóm vấn đề" subtitle="Số phản hồi tiêu cực theo nhóm" />
              <BarList
                items={view.byCategory}
                selected={pick.cat}
                onPick={(k) => setParam({ cat: k })}
                color="var(--viz-neg)"
                metric={(it) => it.neg}
                empty="Không có phản hồi tiêu cực trong phạm vi này"
              />
              {view.byCause.length > 0 && (
                <div className="mt-5 border-t border-line-soft pt-4">
                  <h4 className="text-sm font-semibold text-ink-hi">Nguyên nhân gặp nhiều nhất</h4>
                  <ol className="mt-2 flex list-none flex-col text-sm">
                    {view.byCause.map((c, i) => (
                      <li key={c.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-2 py-1">
                        <span className="font-mono text-ink-lo">{i + 1}</span>
                        <span className="truncate text-ink-mid">{c.label}</span>
                        <span className="font-mono text-ink-hi">{fmtInt(c.neg)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </GlassPanel>

            <div className="col-span-12 flex min-w-0 flex-col gap-6 xl:col-span-7">
            <GlassPanel tone="strong" className="p-6">
              <PanelHeader
                title="Kênh nào, vấn đề gì"
                subtitle="Mỗi ô là số phản hồi tiêu cực; ô càng đậm càng nhiều. Bấm một ô để lọc theo cả kênh và nhóm."
              />
              <Heatmap rows={view.heatCats} cols={view.heatSrcs} cells={view.cells} sel={pick} onPick={(p) => setParam(p)} />
            </GlassPanel>
              <GlassPanel tone="strong" className="p-6">
                <PanelHeader title="Số sao" subtitle="Phản hồi có chấm sao trong phạm vi đang xem" />
                {view.ratings.some((r) => r.n) ? (
                  <ul className="flex list-none flex-col gap-2">
                    {view.ratings.map((r) => {
                      const max = Math.max(...view.ratings.map((x) => x.n), 1);
                      return (
                        <li key={r.key} className="grid grid-cols-[3.5rem_minmax(0,1fr)_4rem] items-center gap-3 text-sm">
                          <span className="text-ink-mid">{r.label}</span>
                          <span className="block h-2.5 overflow-hidden rounded-sm bg-raised">
                            <span className="block h-full w-full origin-left" style={{ background: Number(r.key) <= 2 ? 'var(--viz-neg)' : Number(r.key) === 3 ? 'var(--viz-neu)' : 'var(--viz-pos)', transform: `scaleX(${r.n / max})` }} />
                          </span>
                          <span className="text-right font-mono text-ink-hi">{fmtInt(r.n)}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="py-8 text-center text-sm text-ink-lo">Phản hồi trong phạm vi này không có số sao</p>
                )}
              </GlassPanel>
            </div>

            <GlassPanel tone="strong" className="col-span-12 p-6">
              <PanelHeader
                title="Sản phẩm"
                subtitle="12 sản phẩm theo cột đang sắp xếp. Bấm tên để lọc, bấm tiêu đề cột để đổi cách sắp."
                right={pick.prod && <Link to={`/feedbacks?product=${encodeURIComponent(pick.prod)}${pick.src ? `&source=${encodeURIComponent(pick.src)}` : ''}`} className="text-sm font-medium whitespace-nowrap text-accent-hi hover:underline">Đọc phản hồi</Link>}
              />
              <ProductTable groups={view.byProduct} names={view.dicts.product} selected={pick.prod} onPick={(k) => setParam({ prod: k })} />
            </GlassPanel>

          </div>

          <p className="mt-6 text-sm text-ink-lo">
            Chỉ gồm phản hồi được tính vào chỉ số (đã qua Trust Layer). Tỉ lệ tiêu cực tính theo trọng số tin cậy, khớp với trang Tổng quan.
          </p>
        </>
      )}
    </div>
  );
};

export default Insights;
