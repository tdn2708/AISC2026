import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Search, X, ChevronLeft, ChevronRight, Copy, Zap, UserX, Star, Receipt, HelpCircle, Laugh, Meh, Frown } from 'lucide-react';
import FilterBar from './FilterBar';
import { PageHeader, GlassPanel, Chip, Drawer, EmptyState, SentimentFace, Badge, ProgressBar } from './ui';
import { buildQuery, fmtInt, fmtDateTime, initials, SENTIMENT_MAP } from '../lib/format';

/**
 * KHO PHẢN HỒI
 * ------------------------------------------------------------------
 * Bộ lọc "mức độ" của bản cũ lọc theo Critical/High trên một trường
 * không tồn tại — chọn gì cũng ra rỗng. Mức nghiêm trọng là thuộc tính
 * của một CỤM phản hồi đã qua kiểm định, không phải của một câu văn;
 * thứ thuộc về từng phản hồi là HẠNG TIN CẬY của nguồn, nên lọc theo đó.
 */

const PAGE_SIZE = 20;
const TIERS = ['P1', 'P2', 'P3', 'P4', 'P5'];
const MOODS = [
  { value: 'Positive', label: 'Tích cực', icon: Laugh },
  { value: 'Neutral', label: 'Trung tính', icon: Meh },
  { value: 'Negative', label: 'Tiêu cực', icon: Frown }
];
const SIGNAL_ICONS = {
  'Trùng lặp gần về nội dung': Copy,
  'Đột biến thời gian': Zap,
  'Bất thường hành vi tài khoản': UserX,
  'Bất nhất điểm sao và nội dung': Star,
  'Bất nhất với dữ liệu giao dịch': Receipt
};

const strip = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').toLowerCase();

const tierTone = (w = 0) => (w >= 0.9 ? 'text-ok' : w >= 0.6 ? 'text-ink-mid' : w >= 0.4 ? 'text-high' : 'text-crit');

const FeedbackDetail = ({ item, onClose }) => {
  const t = item?.trust;
  return (
    <Drawer open={Boolean(item)} onClose={onClose} title="Chi tiết phản hồi" subtitle={item ? `${item.source} · ${fmtDateTime(item.timestamp)}` : ''}>
      {item && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-linear-to-br from-sky/70 to-blush/70 text-sm font-semibold text-ink-hi">
              {initials(item.author || 'Ẩn danh')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink-hi">{item.author || 'Ẩn danh'}</p>
              <p className="truncate text-xs text-ink-lo">{item.productName || 'Không gắn sản phẩm'}{item.region ? ` · ${item.region}` : ''}</p>
            </div>
            <SentimentFace sentiment={item.sentiment} size={36} />
          </div>

          <blockquote className="rounded-2xl bg-surface/65 p-4 text-[0.95rem] leading-relaxed text-ink-hi">
            {item.originalText}
            {item.rating != null && (
              <span className="mt-2 flex items-center gap-1 text-xs text-ink-lo">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} size={12} className={i < item.rating ? 'fill-high text-high' : 'text-line'} aria-hidden="true" />
                ))}
                <span className="ml-1 font-mono">{item.rating}/5</span>
              </span>
            )}
          </blockquote>

          {item.aiSummary && (
            <div>
              <p className="eyebrow mb-1.5">Tóm tắt</p>
              <p className="text-sm leading-relaxed text-ink-mid">{item.aiSummary}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface/55 p-3">
              <p className="text-[0.7rem] text-ink-lo">Nhóm vấn đề</p>
              <p className="mt-0.5 text-sm font-medium text-ink-hi">{item.categoryLabel || item.category || '—'}</p>
            </div>
            <div className="rounded-xl bg-surface/55 p-3">
              <p className="text-[0.7rem] text-ink-lo">Nguyên nhân</p>
              <p className="mt-0.5 text-sm font-medium text-ink-hi">{item.causeLabel || '—'}</p>
            </div>
          </div>

          {t && (
            <div>
              <p className="eyebrow mb-3">Tầng kiểm soát tin cậy</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-surface/55 p-3">
                  <p className="text-[0.7rem] text-ink-lo">Hạng nguồn</p>
                  <p className={`mt-0.5 font-mono text-lg font-semibold ${tierTone(t.tierWeight)}`}>{t.tier}</p>
                </div>
                <div className="rounded-xl bg-surface/55 p-3">
                  <p className="text-[0.7rem] text-ink-lo">Trọng số</p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-ink-hi">{Number(t.weight).toFixed(2)}</p>
                </div>
                <div className="rounded-xl bg-surface/55 p-3">
                  <p className="text-[0.7rem] text-ink-lo">Nghi vấn</p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-ink-hi">{t.authenticityScore != null ? Number(t.authenticityScore).toFixed(2) : '—'}</p>
                </div>
              </div>
              <ProgressBar className="mt-3" value={t.weight} label="Mức đóng góp vào chỉ số" showValue />
              {t.bandLabelVi && <p className="mt-2 text-xs text-ink-lo">Vùng: {t.bandLabelVi}</p>}
              {t.triggeredSignals?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.triggeredSignals.map((s, i) => {
                    const Icon = SIGNAL_ICONS[s.signal] || HelpCircle;
                    return <Badge key={i} tone="high" icon={Icon}>{s.signal}</Badge>;
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
};

const Feedbacks = () => {
  const [params, setParams] = useSearchParams();
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState(params.get('q') || '');
  const [mood, setMood] = useState('All');
  const [tier, setTier] = useState('All');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const [timeFilter, setTimeFilter] = useState(localStorage.getItem('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(localStorage.getItem('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(localStorage.getItem('productFilter') || 'All');

  useEffect(() => {
    localStorage.setItem('timeFilter', timeFilter);
    localStorage.setItem('sourceFilter', sourceFilter);
    localStorage.setItem('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter]);

  // Đến từ bảng lệnh Ctrl+K với ?q=
  useEffect(() => {
    const q = params.get('q');
    if (q != null) setSearch(q);
  }, [params]);

  useEffect(() => {
    setLoading(true);
    axios
      .get(`/feedbacks${buildQuery({ time: timeFilter, source: sourceFilter, product: productFilter })}`)
      .then((res) => {
        setFeedbacks(Array.isArray(res.data) ? res.data : []);
        setError(null);
      })
      .catch(() => setError('Không tải được phản hồi. Kiểm tra máy chủ đã chạy chưa.'))
      .finally(() => setLoading(false));
  }, [timeFilter, sourceFilter, productFilter]);

  useEffect(() => setPage(1), [search, mood, tier, timeFilter, sourceFilter, productFilter]);

  const q = strip(search.trim());
  const searched = useMemo(
    () => (q ? feedbacks.filter((f) => strip(`${f.originalText} ${f.author} ${f.productName}`).includes(q)) : feedbacks),
    [feedbacks, q]
  );
  const filtered = searched.filter((f) => (mood === 'All' || f.sentiment === mood) && (tier === 'All' || f.trust?.tier === tier));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const countBy = (key, val) => searched.filter((f) => (key === 'mood' ? f.sentiment === val : f.trust?.tier === val)).length;

  const clearSearch = () => {
    setSearch('');
    if (params.get('q')) setParams({}, { replace: true });
  };

  return (
    <div className="cx">
      <PageHeader
        section="Giám sát"
        title="Kho"
        accent="phản hồi"
        subtitle="Chỉ hiển thị phản hồi đã qua tầng kiểm soát tin cậy. Bấm vào một dòng để xem chi tiết và các tín hiệu đã kích hoạt."
      />

      <FilterBar
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
        hideExportButton
      />

      <GlassPanel tone="strong" className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line-soft p-5">
          <div className="relative">
            <Search size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-lo" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo nội dung, khách hàng hoặc sản phẩm — gõ không dấu cũng được"
              aria-label="Tìm phản hồi"
              className="h-12 w-full rounded-2xl border border-line bg-surface/70 pr-12 pl-11 text-sm text-ink-hi outline-none transition-[border-color,box-shadow] placeholder:text-ink-lo focus:border-accent focus:ring-4 focus:ring-accent-dim"
            />
            {search && (
              <button type="button" onClick={clearSearch} aria-label="Xoá tìm kiếm" className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-lo hover:bg-raised hover:text-ink-hi">
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo cảm xúc">
              <span className="eyebrow mr-1">Cảm xúc</span>
              <Chip active={mood === 'All'} onClick={() => setMood('All')} count={searched.length}>Tất cả</Chip>
              {MOODS.map((m) => (
                <Chip key={m.value} active={mood === m.value} onClick={() => setMood(m.value)} icon={m.icon} count={countBy('mood', m.value)}>
                  {m.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo hạng tin cậy">
              <span className="eyebrow mr-1">Hạng nguồn</span>
              <Chip active={tier === 'All'} onClick={() => setTier('All')}>Mọi hạng</Chip>
              {TIERS.map((t) => (
                <Chip key={t} active={tier === t} onClick={() => setTier(t)} count={countBy('tier', t)} className="font-mono">{t}</Chip>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <EmptyState variant="error" title="Không tải được phản hồi" description={error} />
        ) : loading && feedbacks.length === 0 ? (
          <div className="flex flex-col gap-2 p-5">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-raised" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Không có phản hồi khớp" description="Thử bỏ bớt điều kiện lọc hoặc đổi từ khoá tìm kiếm." />
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <table className="fb-table">
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '38%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Nội dung</th>
                  <th>Nhóm vấn đề</th>
                  <th>Cảm xúc</th>
                  <th>Hạng</th>
                  <th>Nguồn</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f, i) => {
                  const author = f.author || 'Ẩn danh';
                  const s = SENTIMENT_MAP[f.sentiment] || SENTIMENT_MAP.Neutral;
                  return (
                    <tr
                      key={f._id || i}
                      tabIndex={0}
                      onClick={() => setSelected(f)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(f))}
                      className="cursor-pointer focus-visible:bg-raised focus-visible:outline-none"
                    >
                      <td>
                        <div className="fb-user">
                          <span className="fb-avatar" aria-hidden="true">{initials(author)}</span>
                          <div className="fb-user-text">
                            <div className="fb-user-name" title={author}>{author}</div>
                            <div className="fb-meta">{fmtDateTime(f.timestamp)}</div>
                          </div>
                        </div>
                      </td>
                      <td><div className="fb-clamp" title={f.originalText}>{f.originalText}</div></td>
                      <td>{f.categoryLabel ? <span className="fb-chip" title={f.categoryLabel}>{f.categoryLabel}</span> : <span className="text-ink-lo">—</span>}</td>
                      <td>
                        <span className="inline-flex items-center gap-2 text-[0.8rem] text-ink-mid">
                          <SentimentFace sentiment={f.sentiment} size={22} />
                          {s.label}
                        </span>
                      </td>
                      <td><span className={`fb-trust-tier ${tierTone(f.trust?.tierWeight)}`}>{f.trust?.tier || '—'}</span></td>
                      <td><span className="fb-source">{f.source}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="fb-pager">
            <span className="fb-pager-info">
              {fmtInt((page - 1) * PAGE_SIZE + 1)}–{fmtInt(Math.min(page * PAGE_SIZE, filtered.length))} / {fmtInt(filtered.length)}
              {filtered.length !== feedbacks.length && <span className="text-ink-lo"> (trên {fmtInt(feedbacks.length)})</span>}
            </span>
            <div className="fb-pager-btns">
              <button className="fb-page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Trang trước"><ChevronLeft size={14} /></button>
              <span className="px-2 font-mono text-xs text-ink-mid">{page} / {totalPages}</span>
              <button className="fb-page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} aria-label="Trang sau"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </GlassPanel>

      <FeedbackDetail item={selected} onClose={() => setSelected(null)} />
    </div>
  );
};

export default Feedbacks;
