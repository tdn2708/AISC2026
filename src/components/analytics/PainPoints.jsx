import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, ChevronDown } from 'lucide-react';
import FilterBar from '../FilterBar';
import { GlassPanel, PanelHeader, EmptyState, Button, Badge, Skeleton } from '../ui';
import { buildQuery, fmtInt, fmtPct, fmtDate, spanWords } from '../../lib/format';
import { readStorage, writeStorage } from '../../lib/storage';
import { useDataVersion } from '../../lib/dataVersion';
import { BarGrow, STAGGER_STEP, useReducedMotion } from '../motion';

/**
 * ĐIỂM ĐAU CỤ THỂ
 * ------------------------------------------------------------------
 * Nhóm vấn đề cho biết BỘ PHẬN nào phải sửa; tab này cho biết khách đang
 * than CHUYỆN GÌ, theo từng mảng hàng: máy tự tìm cụm từ mà câu chê của
 * mảng đó nhắc nhiều hơn hẳn phần còn lại (backend services/pain_points.js).
 * Không có danh sách nào viết trước, nên mảng hàng mới cũng tự có điểm đau.
 * Mỗi điểm đau mở được một hồ sơ xử lý (/cases).
 */

/** Xu hướng kỳ gần nhất so với kỳ liền trước, bằng chữ. Độ dài kỳ theo nhịp của kho (`days`, kho dày 28 ngày) */
const trendWords = ({ recent, previous, days = 28 }) => {
  if (recent + previous < 3) return null;
  const k = days === 28 ? '4 tuần' : spanWords(days);
  if (previous === 0) return `${fmtInt(recent)} câu trong ${k} gần nhất, ${k} trước không có`;
  const rel = (recent - previous) / previous;
  if (Math.abs(rel) < 0.1) return `${k} gần nhất ${fmtInt(recent)} câu, gần bằng ${k} trước`;
  return `${k} gần nhất ${fmtInt(recent)} câu, ${rel > 0 ? 'nhiều' : 'ít'} hơn ${k} trước (${fmtInt(previous)})`;
};

const GroupRow = ({ g, active, max, onClick, index }) => {
  const reduced = useReducedMotion();
  const n = g.painPoints.length;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`block w-full rounded-ctrl border px-3 py-2.5 text-left transition-[background-color,border-color] duration-micro ease-out ${active ? 'border-accent bg-accent-dim' : 'border-transparent hover:bg-raised'}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className={`min-w-0 truncate text-sm text-ink-hi ${active ? 'font-semibold' : ''}`}>{g.label}</span>
        <span className="shrink-0 tabular-nums text-xs text-ink-mid">{fmtInt(g.negatives)} câu chê</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
        <BarGrow value={max ? Math.max(0.03, g.negatives / max) : 0} className="rounded-full bg-neg" style={reduced ? undefined : { transitionDelay: `${Math.min(index, 12) * STAGGER_STEP}ms` }} />
      </div>
      <p className="mt-1 text-xs text-ink-lo">
        {g.status === 'too_few' ? `Chưa đủ câu để tách (cần ${fmtInt(g.minNegatives)})` : n ? `${fmtInt(n)} điểm đau` : 'Không thấy chuyện nào lặp lại'}
      </p>
    </button>
  );
};

/** Một điểm đau: câu khách hay nói, quy mô, nguyên nhân, câu gốc, nút mở hồ sơ */
const PainRow = ({ p, negatives, onOpen }) => {
  const [open, setOpen] = useState(false);
  const trend = trendWords(p.trend);
  return (
    <li className="py-5 first:pt-1 last:pb-1">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-[1_1_18rem]">
          <p className="text-heading font-semibold text-ink-hi">"{p.phrase}"</p>
          <p className="mt-1 text-sm text-ink-mid">
            <span className="tabular-nums font-semibold text-ink-hi">{fmtInt(p.customers)}</span> khách nhắc, {fmtPct(p.shareOfNegatives, 0)} câu chê của mảng này
            {p.verified > 0 && <>, <span className="tabular-nums">{fmtInt(p.verified)}</span> câu có chứng từ</>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.causeLabel && <Badge tone="neutral">{p.categoryLabel}: {p.causeLabel}</Badge>}
            {p.owner && <Badge tone="accent">{p.owner}</Badge>}
          </div>
          {trend && <p className="mt-2 text-xs text-ink-lo">{trend}</p>}
          {p.variants.length > 0 && (
            <p className="mt-1 text-xs text-ink-lo">Khách cũng viết: {p.variants.slice(0, 4).map((v) => `"${v}"`).join(', ')}</p>
          )}
        </div>
        <Button size="sm" iconRight={ArrowRight} onClick={() => onOpen(p)}>Xử lý</Button>
      </div>
      <ul className="paper mt-3 flex list-none flex-col divide-y divide-line-soft px-3 py-2">
        {p.examples.slice(0, 2).map((e) => (
          <li key={e.id} className="py-2">
            <p className="text-sm leading-relaxed text-ink-hi">{e.text}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-lo">
              {e.productName && <span className="max-w-[28ch] truncate">{e.productName}</span>}
              <span className="tabular-nums">{fmtDate(e.timestamp)}</span>
              {e.source && <span>{e.source}</span>}
            </p>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs text-ink-lo hover:text-accent-hi"
      >
        <ChevronDown size={14} className={`transition-transform duration-micro ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        Số liệu kiểm định
      </button>
      {open && (
        <div className="paper mt-1 px-3 py-2 font-code text-xs leading-relaxed text-ink-mid">
          <p>chê có cụm {p.stats.inNegatives}/{p.stats.negatives}; còn lại có cụm {p.stats.inRest}/{p.stats.rest}</p>
          <p>z (log-odds) {String(p.stats.z).replace('.', ',')}; lift {String(p.stats.lift).replace('.', ',')}
            {p.stats.zSameGroup != null && <>; z so câu không chê cùng mảng {String(p.stats.zSameGroup).replace('.', ',')}</>}
            {p.stats.zOtherNegatives != null && <>; z so câu chê mảng khác {String(p.stats.zOtherNegatives).replace('.', ',')}</>}
          </p>
          <p>cụm có ở {p.stats.groupsWithPhrase}/{p.stats.groupsTotal} mảng; {fmtInt(p.days)} ngày khác nhau; nguyên nhân chiếm đa số {fmtPct(p.causeShare, 0)}</p>
          <p>trên {fmtInt(negatives)} câu chê của mảng</p>
        </div>
      )}
    </li>
  );
};

const foldVi = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase().trim();

const PainPoints = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const wanted = foldVi(params.get('group')); // từ "Việc gấp nhất": chọn sẵn mảng khớp tên sản phẩm của cảnh báo
  const dataVersion = useDataVersion();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [timeFilter, setTimeFilter] = useState(readStorage('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(readStorage('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(readStorage('productFilter') || 'All');

  useEffect(() => {
    writeStorage('timeFilter', timeFilter);
    writeStorage('sourceFilter', sourceFilter);
    writeStorage('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  const query = buildQuery({ time: timeFilter, source: sourceFilter, product: productFilter });
  useEffect(() => {
    // Đổi bộ lọc nhanh: kết quả của bộ lọc cũ về muộn không được ghi đè bộ lọc mới
    let alive = true;
    setLoading(true);
    axios.get(`/pain-points${query}`)
      .then((r) => { if (alive) { setData(r.data); setError(null); } })
      .catch(() => { if (alive) setError('Không tải được điểm đau. Tải lại trang, hoặc kiểm tra mạng.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query, dataVersion]);

  // Mảng có điểm đau lên trước, rồi theo số câu chê
  const groups = useMemo(() => {
    if (!data) return [];
    const list = [...data.groups].sort((a, b) => (b.painPoints.length > 0) - (a.painPoints.length > 0) || b.negatives - a.negatives);
    return data.shop?.painPoints?.length ? [{ ...data.shop, label: 'Chuyện chung nhiều mảng' }, ...list] : list;
  }, [data]);
  const fromLink = wanted ? groups.find((g) => g.scope !== 'shop' && (foldVi(g.label).includes(wanted) || wanted.includes(foldVi(g.label)))) : null;
  const current = groups.find((g) => g.key === selected) || fromLink || groups[0] || null;
  const total = useMemo(() => groups.reduce((s, g) => s + (g.scope === 'shop' ? 0 : g.painPoints.length), 0), [groups]);
  const maxNeg = useMemo(() => Math.max(0, ...groups.filter((g) => g.scope !== 'shop').map((g) => g.negatives)), [groups]);

  const open = (p) => navigate(`/cases?key=${encodeURIComponent(p.key)}${query ? `&${query.slice(1)}` : ''}`);

  const filters = (
    <FilterBar
      timeFilter={timeFilter} setTimeFilter={setTimeFilter}
      sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
      productFilter={productFilter} setProductFilter={setProductFilter}
      hideExportButton
    />
  );

  if (error) return <>{filters}<GlassPanel><EmptyState variant="error" title="Không tải được" description={error} /></GlassPanel></>;
  if (loading && !data) {
    return (
      <>
        {filters}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <Skeleton as="div" className="h-[520px] rounded-surf bg-surface/50" />
          <Skeleton as="div" className="h-[520px] rounded-surf bg-surface/50" />
        </div>
      </>
    );
  }
  if (!current) {
    return <>{filters}<GlassPanel><EmptyState title="Chưa có phản hồi nào được tính" description="Trong phạm vi đang lọc không có phản hồi nào để tìm điểm đau." /></GlassPanel></>;
  }

  const groupCount = groups.filter((g) => g.scope !== 'shop').length;

  return (
    <>
      {filters}
      <p className="mb-5 max-w-3xl text-sm leading-relaxed text-ink-mid">
        Máy tìm được <span className="tabular-nums font-semibold text-ink-hi">{fmtInt(total)}</span> điểm đau trong{' '}
        <span className="tabular-nums font-semibold text-ink-hi">{fmtInt(groupCount)}</span> mảng hàng, từ{' '}
        <span className="tabular-nums">{fmtInt(data.counted)}</span> phản hồi được tính. Một điểm đau là chuyện mà ít nhất{' '}
        {fmtInt(data.thresholds.minCustomers)} khách khác nhau cùng nhắc, vào ít nhất {fmtInt(data.thresholds.minDays)} ngày khác nhau.
      </p>
      <div className={`grid items-start gap-6 transition-opacity lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] ${loading ? 'opacity-60' : ''}`}>
        <GlassPanel tone="strong" className="p-5 lg:sticky lg:top-[calc(var(--topbar-h,5rem)+var(--filter-h,0px))]">
          <PanelHeader title="Mảng hàng" subtitle={current.scope === 'shop' ? 'Chuyện lặp lại ở nhiều mảng' : `Mảng hàng lấy từ: ${current.sourceLabel}`} />
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {groups.map((g, i) => (
              <GroupRow key={g.key} g={g} index={i} max={g.scope === 'shop' ? g.negatives : maxNeg} active={g.key === current.key} onClick={() => setSelected(g.key)} />
            ))}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6" key={current.key}>
          <h2 className="text-display font-semibold text-ink-hi">{current.label}</h2>
          <p className="mt-1 text-sm text-ink-mid">
            {fmtInt(current.negatives)} câu chê trên {fmtInt(current.feedbacks)} phản hồi được tính ({fmtPct(current.negativeShare, 0)})
          </p>
          {current.status === 'too_few' ? (
            <>
              <p className="mt-5 text-sm leading-relaxed text-ink-mid">
                Mảng này mới có {fmtInt(current.negatives)} câu chê, chưa đủ {fmtInt(current.minNegatives)} câu để tách ra chuyện cụ thể. Máy không đoán; đây là các câu gốc:
              </p>
              <ul className="paper mt-3 flex list-none flex-col divide-y divide-line-soft px-3 py-2">
                {current.examples.map((e) => <li key={e.id} className="py-2 text-sm leading-relaxed text-ink-hi">{e.text}</li>)}
              </ul>
            </>
          ) : current.painPoints.length === 0 ? (
            <>
              <p className="mt-5 text-sm leading-relaxed text-ink-mid">
                Không có chuyện nào được đủ nhiều khách nhắc bằng những chữ giống nhau. Có thể mỗi người tả một kiểu: đọc câu gốc ở trang Phản hồi.
              </p>
              <ul className="paper mt-3 flex list-none flex-col divide-y divide-line-soft px-3 py-2">
                {current.examples.map((e) => <li key={e.id} className="py-2 text-sm leading-relaxed text-ink-hi">{e.text}</li>)}
              </ul>
            </>
          ) : (
            <>
              <ul className="mt-4 flex list-none flex-col divide-y divide-line-soft">
                {current.painPoints.map((p) => <PainRow key={p.key} p={p} negatives={current.negatives} onOpen={open} />)}
              </ul>
              {current.uncovered > 0 && (
                <p className="mt-4 border-t border-line-soft pt-3 text-xs leading-relaxed text-ink-lo">
                  <span className="tabular-nums text-ink-mid">{fmtInt(current.uncovered)}</span> câu chê khác của mảng này không lặp lại đủ để gom thành điểm đau.
                </p>
              )}
            </>
          )}
        </GlassPanel>
      </div>
    </>
  );
};

export default PainPoints;
