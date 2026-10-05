import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowDownRight, ArrowUpRight, ScanSearch, Users, Package, MessageSquareQuote, ArrowRight } from 'lucide-react';
import FilterBar from './FilterBar';
import Segments from './Segments';
import { PageHeader, GlassPanel, PanelHeader, Tabs, EmptyState, SentimentFace, Button, Stat } from './ui';
import { buildQuery, fmtInt, fmtPct, fmtSignedPct, fmtDate } from '../lib/format';

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

/** Đếm khiếu nại theo ngày trong 28 ngày gần nhất */
const dailySeries = (items) => {
  const now = new Date();
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
const weekDelta = (items) => {
  const now = Date.now();
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
        {fmtInt(count)} <span className="text-ink-lo">· {fmtPct(total ? count / total : null, 0)}</span>
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
    <div className="glass-strong rounded-lg px-3 py-2 text-xs">
      <p className="text-ink-lo">Ngày {label}</p>
      <p className="mt-0.5"><span className="font-mono font-semibold text-ink-hi">{fmtInt(payload[0].value)}</span> <span className="text-ink-mid">khiếu nại</span></p>
    </div>
  ) : null;

const RootCauses = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [timeFilter, setTimeFilter] = useState(localStorage.getItem('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(localStorage.getItem('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(localStorage.getItem('productFilter') || 'All');

  useEffect(() => {
    localStorage.setItem('timeFilter', timeFilter);
    localStorage.setItem('sourceFilter', sourceFilter);
    localStorage.setItem('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  useEffect(() => {
    setLoading(true);
    axios
      .get(`/feedbacks${buildQuery({ time: timeFilter, source: sourceFilter, product: productFilter })}`)
      .then((r) => {
        setItems(Array.isArray(r.data) ? r.data : []);
        setError(null);
      })
      .catch(() => setError('Không tải được dữ liệu phân tích.'))
      .finally(() => setLoading(false));
  }, [timeFilter, sourceFilter, productFilter]);

  // Phân tích nguyên nhân trên KHIẾU NẠI — phản hồi tiêu cực đã được phân loại
  const complaints = useMemo(() => items.filter((f) => f.sentiment === 'Negative' && f.category && f.category !== 'Other'), [items]);
  const categories = useMemo(() => groupCount(complaints, (f) => f.category, (f) => f.categoryLabel || f.category), [complaints]);
  const current = categories.find((c) => c.key === selected) || categories[0] || null;
  const scoped = useMemo(() => (current ? complaints.filter((f) => f.category === current.key) : []), [complaints, current]);
  const causes = useMemo(() => groupCount(scoped, (f) => f.subCategory, (f) => f.causeLabel || f.subCategory), [scoped]);
  const products = useMemo(() => groupCount(scoped, (f) => f.productName, (f) => f.productName).slice(0, 5), [scoped]);
  const series = useMemo(() => dailySeries(scoped), [scoped]);
  const delta = useMemo(() => weekDelta(scoped), [scoped]);
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
          <PanelHeader
            title="Nhóm vấn đề"
            subtitle={`${fmtInt(complaints.length)} khiếu nại đã phân loại · chọn một nhóm để bóc tách`}
          />
          <div className="flex flex-col gap-1">
            {categories.map((c) => (
              <RankBar
                key={c.key}
                label={c.label}
                count={c.count}
                max={categories[0].count}
                total={complaints.length}
                active={c.key === current.key}
                onClick={() => setSelected(c.key)}
              />
            ))}
          </div>
          {unclassified > 0 && (
            <p className="mt-4 border-t border-line-soft pt-3 text-xs leading-relaxed text-ink-lo">
              <span className="font-mono text-ink-mid">{fmtInt(unclassified)}</span> phản hồi tiêu cực chưa gắn được nhóm nào — đây là phần taxonomy đang bỏ sót.
            </p>
          )}
        </GlassPanel>

        {/* Cột phải — bóc tách nhóm đang chọn */}
        <div className="flex flex-col gap-6" key={current.key}>
          <GlassPanel className="p-6 animate-fade-up">
            <p className="eyebrow mb-1.5">Đang bóc tách</p>
            <h2 className="text-2xl font-semibold text-ink-hi">{current.label}</h2>
            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Khiếu nại" value={fmtInt(current.count)} />
              <Stat label="Tỉ trọng" value={fmtPct(current.count / complaints.length, 1)} sub="trong mọi khiếu nại" />
              <Stat label="7 ngày qua" value={fmtInt(delta.cur)} sub={`trước đó ${fmtInt(delta.prev)}`} />
              <div className="rounded-lg bg-surface/55 p-4">
                <p className="eyebrow">Xu hướng tuần</p>
                {delta.rel == null ? (
                  <p className="mt-1.5 text-sm text-ink-lo">Chưa đủ dữ liệu</p>
                ) : (
                  <p className={`mt-1.5 inline-flex items-center gap-1 font-mono text-2xl font-semibold ${up ? 'text-crit' : 'text-ok'}`}>
                    {up ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                    {fmtSignedPct(delta.rel)}
                  </p>
                )}
              </div>
            </div>
          </GlassPanel>

          <div className="grid gap-6 xl:grid-cols-2">
            <GlassPanel tone="strong" className="p-5">
              <PanelHeader title="Nguyên nhân cốt lõi" subtitle="Bóc tách cấp 2 trong nhóm đang chọn" />
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
              <PanelHeader title="Diễn biến theo ngày" subtitle={`Số khiếu nại mỗi ngày · ${DAYS} ngày gần nhất`} />
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
              <PanelHeader title="Sản phẩm bị ảnh hưởng" subtitle="Năm sản phẩm có nhiều khiếu nại nhất trong nhóm" right={<Package size={16} className="text-ink-lo" />} />
              <ol className="flex list-none flex-col gap-2">
                {products.map((p, i) => (
                  <li key={p.key} className="flex items-center gap-3 rounded-lg bg-surface/55 px-3 py-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded bg-raised font-mono text-[0.68rem] text-ink-mid">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-hi" title={p.label}>{p.label}</span>
                    <span className="font-mono text-xs text-ink-mid">{fmtInt(p.count)}</span>
                  </li>
                ))}
                {products.length === 0 && <p className="text-sm text-ink-lo">Không có phản hồi gắn sản phẩm.</p>}
              </ol>
            </GlassPanel>

            <GlassPanel tone="strong" className="p-5">
              <PanelHeader title="Tiếng nói khách hàng" subtitle="Phản hồi mới nhất trong nhóm" right={<MessageSquareQuote size={16} className="text-ink-lo" />} />
              <ul className="flex list-none flex-col gap-2.5">
                {samples.map((f) => (
                  <li key={f._id} className="flex gap-3 rounded-lg bg-surface/55 p-3">
                    <SentimentFace sentiment={f.sentiment} size={26} />
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm leading-relaxed text-ink-hi">{f.originalText}</p>
                      <p className="mt-1 font-mono text-[0.68rem] text-ink-lo">{f.causeLabel || '—'} · {fmtDate(f.timestamp)} · {f.source}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Button
                variant="ghost"
                size="sm"
                iconRight={ArrowRight}
                className="mt-3"
                onClick={() => navigate(`/feedbacks?q=${encodeURIComponent(causes[0]?.label || current.label)}`)}
              >
                Mở trong kho phản hồi
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
  const tab = params.get('tab') === 'segments' ? 'segments' : 'causes';

  return (
    <div className="cx">
      <PageHeader
        section="Phân tích"
        title="Phân tích"
        accent="nguyên nhân"
        subtitle="Dựng hoàn toàn từ phản hồi đã qua tầng kiểm soát tin cậy — mọi con số đều truy ngược được về phản hồi gốc."
      />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(v) => setParams(v === 'segments' ? { tab: 'segments' } : {}, { replace: true })}
        tabs={[
          { value: 'causes', label: 'Nguyên nhân cốt lõi', icon: ScanSearch },
          { value: 'segments', label: 'Phân khúc khách hàng', icon: Users }
        ]}
      />
      {tab === 'segments' ? <Segments /> : <RootCauses />}
    </div>
  );
};

export default Analytics;
