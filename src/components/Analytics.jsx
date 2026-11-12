import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { readStorage, writeStorage } from '../lib/storage';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowDownRight, ArrowUpRight, ScanSearch, Users, GitCompareArrows } from 'lucide-react';
import FilterBar from './FilterBar';
import Segments from './Segments';
import Compare from './analytics/Compare';
import { PageHeader, GlassPanel, PanelHeader, Tabs, EmptyState, Button, Stat, ChartTooltip } from './ui';
import { buildQuery, fmtInt, fmtPct, fmtSignedPct, fmtDate } from '../lib/format';
import { useDataVersion } from '../lib/dataVersion';

/**
 * PHÂN TÍCH NGUYÊN NHÂN
 * ------------------------------------------------------------------
 * Thay cho "báo cáo AI" cũ — một đoạn văn do mô hình ngôn ngữ viết tự do,
 * không truy ngược được về con số nào. Trang này dựng HOÀN TOÀN từ phản
 * hồi đã qua Trust Layer: chọn một nhóm vấn đề → thấy nguyên nhân cấp 2
 * xếp hạng → thấy diễn biến theo ngày → mở tới phản hồi gốc. Mọi con số
 * đều đếm được bằng tay nếu muốn kiểm tra.
 */

const DAYS = 28;
const AXIS = { fontSize: 11, fill: 'var(--text-lo)' };

const dayKey = (d) => d.toISOString().slice(0, 10);

/**
 * Mốc "hôm nay" của phân tích: phản hồi mới nhất, nếu nó cũ hơn hôm nay.
 * Kho dữ liệu thật trên sàn thưa (đánh giá mới nhất có khi cách cả tháng);
 * neo theo đồng hồ thì "28 ngày gần nhất" trống trơn dù kho có hàng nghìn khiếu nại.
 */
const anchorOf = (items) => {
  let latest = 0;
  for (const f of items) {
    const t = new Date(f.timestamp).getTime();
    if (t > latest) latest = t;
  }
  return latest && latest < Date.now() ? latest : Date.now();
};

/** Đếm khiếu nại theo ngày trong 28 ngày tính tới mốc */
const dailySeries = (items, anchor) => {
  const now = new Date(anchor);
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (DAYS - 1 - i));
    return { key: dayKey(d), name: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, value: 0 };
  });
  const idx = Object.fromEntries(days.map((d, i) => [d.key, i]));
  for (const f of items) {
    const t = new Date(f.timestamp);
    if (Number.isNaN(t.getTime())) continue;
    const k = dayKey(new Date(t.getFullYear(), t.getMonth(), t.getDate()));
    if (idx[k] != null) days[idx[k]].value += 1;
  }
  return days;
};

/** So 7 ngày gần nhất với 7 ngày liền trước */
const weekDelta = (items, anchor) => {
  const now = anchor;
  const W = 7 * 86400000;
  let cur = 0;
  let prev = 0;
  for (const f of items) {
    const t = new Date(f.timestamp).getTime();
    if (t > now - W) cur += 1;
    else if (t > now - 2 * W) prev += 1;
  }
  return { cur, prev, rel: prev ? (cur - prev) / prev : null };
};

const groupCount = (items, keyFn, labelFn) => {
  const m = new Map();
  for (const f of items) {
    const k = keyFn(f);
    if (!k) continue;
    if (!m.has(k)) m.set(k, { key: k, label: labelFn(f), count: 0 });
    m.get(k).count += 1;
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
};

/** Hàng xếp hạng — chỉ là nút khi có hành động; không thì là khối thường */
const RankBar = ({ label, count, max, total, active, onClick, tone = 'bg-neg' }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
  <Tag
    {...(onClick ? { type: 'button', onClick, 'aria-pressed': active } : {})}
    className={`block w-full rounded-lg px-3 py-2.5 text-left transition-[background-color,box-shadow] ${
      active ? 'bg-surface shadow-[0_0_0_2px_var(--accent)]' : onClick ? 'hover:bg-surface/70' : ''
    }`}
  >
    <div className="flex items-baseline justify-between gap-3">
      <span className={`min-w-0 truncate text-sm ${active ? 'font-semibold text-ink-hi' : 'text-ink-hi'}`}>{label}</span>
      <span className="shrink-0 font-mono text-xs text-ink-mid">
        {fmtInt(count)} <span className="text-ink-lo">({fmtPct(total ? count / total : null, 0)})</span>
      </span>
    </div>
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${max ? Math.max(3, (count / max) * 100) : 0}%` }} />
    </div>
  </Tag>
  );
};

const TrendTip = ({ active, payload, label }) =>
  active && payload?.length ? (
    <ChartTooltip title={`Ngày ${label}`}>
      <p><span className="font-semibold text-ink-hi">{fmtInt(payload[0].value)}</span> khiếu nại</p>
    </ChartTooltip>
  ) : null;

const RootCauses = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [anchorAt, setAnchorAt] = useState(null);
  const dataVersion = useDataVersion();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const drillRef = useRef(null);
  // Màn hẹp: phần bóc tách nằm DƯỚI danh sách nhóm — chọn xong phải cuộn tới đó
  const pick = (key) => {
    setSelected(key);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };
  const [timeFilter, setTimeFilter] = useState(readStorage('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(readStorage('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(readStorage('productFilter') || 'All');

  useEffect(() => {
    writeStorage('timeFilter', timeFilter);
    writeStorage('sourceFilter', sourceFilter);
    writeStorage('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  useEffect(() => {
    setLoading(true);
    axios
      .get(`/feedbacks${buildQuery({ time: timeFilter, source: sourceFilter, product: productFilter }, { view: 'negative' })}`)
      .then((r) => {
        // Chỉ phản hồi tiêu cực (bản gọn) và mốc thời gian của cả phạm vi:
        // trang này chỉ phân tích khiếu nại, không cần tải cả kho
        setItems(Array.isArray(r.data?.items) ? r.data.items : []);
        setAnchorAt(r.data?.anchor ? new Date(r.data.anchor).getTime() : null);
        setError(null);
      })
      .catch(() => setError('Không tải được dữ liệu phân tích.'))
      .finally(() => setLoading(false));
  }, [timeFilter, sourceFilter, productFilter, dataVersion]);

  // Phân tích nguyên nhân trên KHIẾU NẠI — phản hồi tiêu cực đã được phân loại
  const complaints = useMemo(() => items.filter((f) => f.sentiment === 'Negative' && f.category && f.category !== 'Other'), [items]);
  const categories = useMemo(() => groupCount(complaints, (f) => f.category, (f) => f.categoryLabel || f.category), [complaints]);
  const current = categories.find((c) => c.key === selected) || categories[0] || null;
  const scoped = useMemo(() => (current ? complaints.filter((f) => f.category === current.key) : []), [complaints, current]);
  const causes = useMemo(() => groupCount(scoped, (f) => f.subCategory, (f) => f.causeLabel || f.subCategory), [scoped]);
  const products = useMemo(() => groupCount(scoped, (f) => f.productName, (f) => f.productName).slice(0, 5), [scoped]);
  const anchor = useMemo(() => (anchorAt && anchorAt < Date.now() ? anchorAt : anchorOf(items)), [anchorAt, items]);
  const series = useMemo(() => dailySeries(scoped, anchor), [scoped, anchor]);
  const delta = useMemo(() => weekDelta(scoped, anchor), [scoped, anchor]);
  const samples = useMemo(
    () => [...scoped].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 4),
    [scoped]
  );
  const unclassified = items.filter((f) => f.sentiment === 'Negative' && (!f.category || f.category === 'Other')).length;

  const filters = (
    <FilterBar
      timeFilter={timeFilter} setTimeFilter={setTimeFilter}
      sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
      productFilter={productFilter} setProductFilter={setProductFilter}
      hideExportButton
    />
  );

  if (error) return <>{filters}<GlassPanel><EmptyState variant="error" title="Không tải được" description={error} /></GlassPanel></>;
  if (loading && items.length === 0) {
    return (
      <>
        {filters}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <div className="h-[520px] animate-pulse rounded-xl bg-surface/50" />
          <div className="h-[520px] animate-pulse rounded-xl bg-surface/50" />
        </div>
      </>
    );
  }
  if (!current) {
    return <>{filters}<GlassPanel><EmptyState title="Chưa có khiếu nại nào được phân loại" description="Trong phạm vi đang lọc không có phản hồi tiêu cực nào gắn được nhóm vấn đề." /></GlassPanel></>;
  }

  const up = delta.rel != null && delta.rel > 0.005;

  return (
    <>
      {filters}
      <div className={`grid items-start gap-6 transition-opacity lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] ${loading ? 'opacity-60' : ''}`}>
        {/* Cột trái — nhóm vấn đề xếp hạng */}
        <GlassPanel tone="strong" className="p-5 lg:sticky lg:top-20">
          <PanelHeader title="Nhóm vấn đề" subtitle={`${fmtInt(complaints.length)} khiếu nại đã phân loại`} />
          <div className="flex flex-col gap-1">
            {categories.map((c) => (
              <RankBar
                key={c.key}
                label={c.label}
                count={c.count}
                max={categories[0].count}
                total={complaints.length}
                active={c.key === current.key}
                onClick={() => pick(c.key)}
              />
            ))}
          </div>
          {unclassified > 0 && (
            <p className="mt-4 border-t border-line-soft pt-3 text-xs leading-relaxed text-ink-lo">
              <span className="font-mono text-ink-mid">{fmtInt(unclassified)}</span> phản hồi tiêu cực khác chưa xếp được vào nhóm nào.
            </p>
          )}
        </GlassPanel>

        {/* Cột phải — bóc tách nhóm đang chọn */}
        <div ref={drillRef} className="flex scroll-mt-20 flex-col gap-6" key={current.key}>
          <GlassPanel className="p-6">
            <h2 className="text-2xl font-semibold text-ink-hi">{current.label}</h2>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Khiếu nại" value={fmtInt(current.count)} />
              <Stat label="Tỉ trọng trong mọi khiếu nại" value={fmtPct(current.count / complaints.length, 1)} />
              <div className="min-w-0 border-t border-line pt-3">
                <p className="text-sm text-ink-mid">7 ngày gần nhất</p>
                <p className="mt-1 text-metric font-semibold tracking-tight text-ink-hi tabular-nums">{fmtInt(delta.cur)}</p>
                {delta.rel == null ? (
                  <p className="mt-0.5 text-xs text-ink-lo">Chưa đủ dữ liệu tuần trước để so</p>
                ) : (
                  <p className={`mt-0.5 inline-flex items-center gap-1 text-xs font-semibold ${up ? 'text-crit' : 'text-ok'}`}>
                    {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {fmtSignedPct(delta.rel)} <span className="font-normal text-ink-lo">so với {fmtInt(delta.prev)} ở tuần trước</span>
                  </p>
                )}
              </div>
            </div>
          </GlassPanel>

          <div className="grid gap-6 xl:grid-cols-2">
            <GlassPanel tone="strong" className="p-5">
              <PanelHeader title="Nguyên nhân" />
              {causes.length === 0 ? (
                <p className="text-sm text-ink-lo">Nhóm này chưa có nguyên nhân cấp 2 nào được gán.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {causes.slice(0, 7).map((c) => (
                    <RankBar key={c.key} label={c.label} count={c.count} max={causes[0].count} total={current.count} tone="bg-accent" />
                  ))}
                </div>
              )}
            </GlassPanel>

            <GlassPanel tone="strong" className="p-5">
              <PanelHeader title={`Khiếu nại mỗi ngày, ${DAYS} ngày gần nhất`} />
              <div className="h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rc-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--viz-neg)" stopOpacity={0.22} />
                        <stop offset="1" stopColor="var(--viz-neg)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                    <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} dy={6} />
                    <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
                    <Tooltip content={<TrendTip />} cursor={{ stroke: 'var(--text-lo)', strokeWidth: 1 }} />
                    <Area type="monotone" dataKey="value" stroke="var(--viz-neg)" strokeWidth={2} fill="url(#rc-fill)" isAnimationActive={false} activeDot={{ r: 4, stroke: 'var(--surface-solid)', strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlassPanel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <GlassPanel tone="strong" className="p-5">
              <PanelHeader title="Sản phẩm bị chê nhiều nhất" />
              <ol className="flex list-none flex-col gap-1">
                {products.map((p, i) => (
                  <li key={p.key} className="flex items-center gap-3 rounded-lg px-1 py-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded bg-raised font-mono text-xs text-ink-mid">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-hi" title={p.label}>{p.label}</span>
                    <span className="font-mono text-xs text-ink-mid">{fmtInt(p.count)}</span>
                  </li>
                ))}
                {products.length === 0 && <p className="text-sm text-ink-lo">Không có phản hồi gắn sản phẩm.</p>}
              </ol>
            </GlassPanel>

            <GlassPanel tone="strong" className="p-5">
              <PanelHeader title="Phản hồi mới nhất" />
              <ul className="flex list-none flex-col divide-y divide-line-soft">
                {samples.map((f) => (
                  <li key={f._id} className="py-3 first:pt-0 last:pb-0">
                    <p className="line-clamp-2 text-sm leading-relaxed text-ink-hi">{f.originalText}</p>
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-ink-lo">
                      {f.causeLabel && <span>{f.causeLabel}</span>}
                      <span className="font-mono">{fmtDate(f.timestamp)}</span>
                      <span>{f.source}</span>
                    </p>
                  </li>
                ))}
              </ul>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => navigate(`/feedbacks?q=${encodeURIComponent(causes[0]?.label || current.label)}`)}
              >
                Xem thêm phản hồi như thế này
              </Button>
            </GlassPanel>
          </div>
        </div>
      </div>
    </>
  );
};

const Analytics = () => {
  const [params, setParams] = useSearchParams();
  const tab = ['segments', 'compare'].includes(params.get('tab')) ? params.get('tab') : 'causes';

  return (
    <div className="cx">
      <PageHeader
        title="Phân tích nguyên nhân"
        subtitle={{
          causes: 'Chọn một nhóm vấn đề để xem nguyên nhân, sản phẩm bị chê và phản hồi gốc.',
          compare: 'Đặt sản phẩm của bạn cạnh sản phẩm đối thủ, xem bên nào bị chê nhiều hơn và vì sao.',
          segments: 'Nhóm khách hàng theo cảm xúc trong các phản hồi của họ.'
        }[tab]}
      />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(v) => setParams(v === 'causes' ? {} : { tab: v }, { replace: true })}
        tabs={[
          { value: 'causes', label: 'Theo nhóm vấn đề', icon: ScanSearch },
          { value: 'compare', label: 'So sánh sản phẩm', icon: GitCompareArrows },
          { value: 'segments', label: 'Phân khúc khách hàng', icon: Users }
        ]}
      />
      {tab === 'segments' ? <Segments /> : tab === 'compare' ? <Compare /> : <RootCauses />}
    </div>
  );
};

export default Analytics;
