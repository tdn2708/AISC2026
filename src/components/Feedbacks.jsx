import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Search, X, ChevronLeft, ChevronRight, Copy, Zap, UserX, Star, Receipt, HelpCircle } from 'lucide-react';
import FilterBar from './FilterBar';
import ReplyDraft from './feedback/ReplyDraft';
import { PageHeader, GlassPanel, Chip, Drawer, EmptyState, SentimentFace, Badge, ProgressBar, EvidenceTag, EvidenceSwatch } from './ui';
import { buildQuery, fmtInt, fmtDateTime, initials, SENTIMENT_MAP, foldVi, evidenceOf, exclusionLabel, LABELLER_LABEL, sarcasmTag } from '../lib/format';
import { readStorage, writeStorage } from '../lib/storage';

/**
 * PHẢN HỒI
 * ------------------------------------------------------------------
 * Lọc theo cảm xúc và theo BẰNG CHỨNG (đối soát được / người đã duyệt / AI
 * suy luận) — cùng ngôn ngữ với thanh bằng chứng trên Tổng quan, thay cho
 * ký hiệu hạng P1–P5 mà người dùng doanh nghiệp không có lý do để thuộc.
 */

const PAGE_SIZE = 20;
const PosMark = () => <SentimentFace sentiment="Positive" size={24} />;
const NeuMark = () => <SentimentFace sentiment="Neutral" size={24} />;
const NegMark = () => <SentimentFace sentiment="Negative" size={24} />;
const MOODS = [
  { value: 'Positive', label: 'Tích cực', icon: PosMark },
  { value: 'Neutral', label: 'Trung tính', icon: NeuMark },
  { value: 'Negative', label: 'Tiêu cực', icon: NegMark }
];
const EVIDENCE_FILTERS = [
  { value: 'verified', label: 'Có chứng từ' },
  { value: 'human', label: 'Người đã duyệt' },
  { value: 'inferred', label: 'AI đoán' }
];
const SIGNAL_ICONS = {
  'Trùng lặp gần về nội dung': Copy,
  'Đột biến thời gian': Zap,
  'Bất thường hành vi tài khoản': UserX,
  'Bất nhất điểm sao và nội dung': Star,
  'Bất nhất với dữ liệu giao dịch': Receipt
};

const nf2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FeedbackDetail = ({ item, onClose }) => {
  const t = item?.trust;
  const ev = item ? evidenceOf(item) : null;
  return (
    <Drawer open={Boolean(item)} onClose={onClose} title="Chi tiết phản hồi" subtitle={item ? `${item.source}, ${fmtDateTime(item.timestamp)}` : ''}>
      {item && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-accent-dim text-sm font-semibold text-accent-hi">
              {initials(item.author || 'Ẩn danh')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink-hi">{item.author || 'Ẩn danh'}</p>
              <p className="truncate text-xs text-ink-lo">{item.productName || 'Không gắn sản phẩm'}{item.region ? `, ${item.region}` : ''}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-mid">
              <SentimentFace sentiment={item.sentiment} size={28} />
              {(SENTIMENT_MAP[item.sentiment] || SENTIMENT_MAP.Neutral).label}
            </span>
          </div>

          <blockquote className="rounded-lg border border-line-soft p-4 text-[0.95rem] leading-relaxed text-ink-hi">
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

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {item.category && item.category !== 'Other' ? (
              <>
                <div>
                  <dt className="text-xs text-ink-lo">Nhóm vấn đề</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-hi">{item.categoryLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-lo">Nguyên nhân</dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink-hi">{item.causeLabel || 'Chưa xác định'}</dd>
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <dt className="text-xs text-ink-lo">Nhóm vấn đề</dt>
                <dd className="mt-0.5 text-sm text-ink-mid">Không nêu vấn đề cụ thể</dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="text-xs text-ink-lo">Ai gán nhãn</dt>
              <dd className="mt-0.5 text-sm text-ink-mid">
                {LABELLER_LABEL[item.labelledBy] || item.labelledBy}
                {item.machineLabel && (
                  <span className="block text-xs text-ink-lo">
                    Máy từng gán: {(SENTIMENT_MAP[item.machineLabel.sentiment] || SENTIMENT_MAP.Neutral).label.toLowerCase()}, {item.machineLabel.categoryLabel || 'không nêu vấn đề'}
                  </span>
                )}
              </dd>
            </div>
          </dl>

          {(item.sarcasm?.suspected || item.sarcasm?.verdict === 'sarcastic') && (
            <div className="rounded-lg border border-high/30 bg-high/8 px-4 py-3 text-sm text-ink-mid">
              <p className="font-semibold text-ink-hi">
                {item.sarcasm.verdict === 'sarcastic' ? 'Câu mỉa mai: lời khen ngoài miệng, thật ra là chê' : item.sarcasm.verdict === 'literal' ? 'Đã kiểm tra: không phải mỉa mai' : 'Nghi mỉa mai, chờ xác nhận'}
              </p>
              {item.sarcasm.signals?.length > 0 && <p className="mt-1 text-xs">Dấu hiệu: {item.sarcasm.signals.join('; ')}.</p>}
              {item.sarcasm.reason && <p className="mt-1 text-xs">Mô hình thứ hai: “{item.sarcasm.reason}”</p>}
              {item.needsReview && (
                <a href="/trust?tab=audit" className="mt-1.5 inline-block text-xs font-semibold text-accent hover:underline">Các mô hình chưa thống nhất, mở hàng cần duyệt</a>
              )}
            </div>
          )}

          {item.aiSummary && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink-hi">Tóm tắt</h3>
              <p className="text-sm leading-relaxed text-ink-mid">{item.aiSummary}</p>
            </div>
          )}

          {t && (
            <div className="border-t border-line-soft pt-5">
              <h3 className="text-sm font-semibold text-ink-hi">{ev.counted ? 'Vì sao phản hồi này được tính' : 'Vì sao phản hồi này không được tính'}</h3>
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-hi">
                <EvidenceSwatch kind={ev.kind} size={12} />
                {ev.label}
                {!ev.counted && <Badge tone="crit">{exclusionLabel(t)}</Badge>}
                {ev.counted && t.lowInfo && <Badge>Đánh giá ngắn, ít thông tin</Badge>}
              </p>
              <ProgressBar
                className="mt-4"
                value={t.weight}
                label={`Mức đóng góp vào chỉ số: ${nf2.format(Number(t.weight) || 0)} trên tối đa 1`}
              />
              <p className="mt-2 text-xs leading-relaxed text-ink-lo">
                Mức này phụ thuộc độ tin của nguồn (hạng {t.tier}, tối đa {nf2.format(t.tierWeight ?? 0)}) và giảm dần khi phản hồi cũ đi
                {t.triggeredSignals?.length > 0 ? ' hoặc có dấu hiệu bất thường.' : '.'}
              </p>
              {t.triggeredSignals?.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-ink-mid">Dấu hiệu bất thường</p>
                  <div className="flex flex-wrap gap-2">
                    {t.triggeredSignals.map((s, i) => {
                      const Icon = SIGNAL_ICONS[s.signal] || HelpCircle;
                      return <Badge key={i} tone="high" icon={Icon}>{s.signal}</Badge>;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chỉ phản hồi chê mới cần trả lời xin lỗi / xử lý */}
          {item.sentiment === 'Negative' && <ReplyDraft feedbackId={item._id} />}
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
  const [evidence, setEvidence] = useState('All');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  // Bộ lọc trên đường dẫn (?source=&product=&time=) thắng bộ lọc đã nhớ: trang
  // Nguồn dữ liệu mở thẳng tới đúng lô phản hồi vừa thu thập theo cách này
  const [timeFilter, setTimeFilter] = useState(params.get('time') || readStorage('timeFilter') || 'All');
  const [sourceFilter, setSourceFilter] = useState(params.get('source') || readStorage('sourceFilter') || 'All');
  const [productFilter, setProductFilter] = useState(params.get('product') || readStorage('productFilter') || 'All');
  // ?include=all: xem ĐỦ lô vừa thu thập, kể cả phản hồi không được tính vào
  // chỉ số (rác, nghi ảo, hoặc quá cũ nên trọng số về 0) — mở từ trang Nguồn
  // dữ liệu, nếu không người xem chỉ thấy 11/47 đánh giá vừa cào và tưởng mất dữ liệu
  const includeAll = params.get('include') === 'all';

  // Mở bằng đường dẫn có sẵn bộ lọc là xem một lô cụ thể, không phải chọn bộ
  // lọc làm việc: không lưu lại, nếu không trang Tổng quan mở sau đó bị lọc
  // theo đúng một sản phẩm vừa cào và trắng trơn
  const [deepLinked] = useState(() => ['time', 'source', 'product'].some((k) => params.has(k)));

  useEffect(() => {
    if (deepLinked) return;
    writeStorage('timeFilter', timeFilter);
    writeStorage('sourceFilter', sourceFilter);
    writeStorage('productFilter', productFilter);
  }, [timeFilter, sourceFilter, productFilter, deepLinked]);

  // Đến từ bảng lệnh Ctrl+K với ?q=
  useEffect(() => {
    const q = params.get('q');
    if (q != null) setSearch(q);
  }, [params]);

  useEffect(() => {
    setLoading(true);
    axios
      .get(`/feedbacks${buildQuery({ time: timeFilter, source: sourceFilter, product: productFilter }, { include: includeAll ? 'all' : null })}`)
      .then((res) => {
        setFeedbacks(Array.isArray(res.data) ? res.data.map((f) => ({ ...f, _ev: evidenceOf(f) })) : []);
        setError(null);
      })
      .catch(() => setError('Không tải được phản hồi. Kiểm tra máy chủ đã chạy chưa.'))
      .finally(() => setLoading(false));
  }, [timeFilter, sourceFilter, productFilter, includeAll]);

  useEffect(() => setPage(1), [search, mood, evidence, timeFilter, sourceFilter, productFilter]);

  const countedTotal = useMemo(() => feedbacks.filter((f) => f._ev.counted).length, [feedbacks]);

  const q = foldVi(search.trim());
  const searched = useMemo(
    () => (q ? feedbacks.filter((f) => foldVi(`${f.originalText} ${f.author} ${f.productName}`).includes(q)) : feedbacks),
    [feedbacks, q]
  );
  const filtered = searched.filter((f) => (mood === 'All' || f.sentiment === mood) && (evidence === 'All' || f._ev.kind === evidence));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const countMood = (val) => searched.filter((f) => f.sentiment === val).length;
  const countEvidence = (val) => searched.filter((f) => f._ev.kind === val).length;

  const clearSearch = () => {
    setSearch('');
    if (params.get('q')) setParams({}, { replace: true });
  };

  return (
    <div className="cx">
      <PageHeader title="Phản hồi" subtitle="Bấm vào một dòng để xem nội dung đầy đủ và vì sao phản hồi được tính." />

      <FilterBar
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
        hideExportButton
      />

      {includeAll && !loading && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-dim px-4 py-3 text-sm text-ink-mid">
          <span>
            Đang xem cả phản hồi không được tính: <b className="text-ink-hi">{fmtInt(countedTotal)}</b> được tính,{' '}
            <b className="text-ink-hi">{fmtInt(feedbacks.length - countedTotal)}</b> không tính (rác, nghi ảo hoặc quá cũ).
          </span>
          <button
            type="button"
            onClick={() => { const next = new URLSearchParams(params); next.delete('include'); setParams(next, { replace: true }); }}
            className="text-xs font-semibold text-accent hover:underline"
          >
            Chỉ xem phản hồi được tính
          </button>
        </div>
      )}

      <GlassPanel tone="strong" className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line-soft p-5">
          <div className="relative">
            <Search size={17} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-lo" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm nội dung, khách hàng, sản phẩm (gõ không dấu cũng được)"
              aria-label="Tìm phản hồi"
              className="h-11 w-full rounded-lg border border-line bg-surface pr-12 pl-11 text-sm text-ink-hi outline-none transition-[border-color,box-shadow] placeholder:text-ink-lo focus:border-accent focus:ring-4 focus:ring-accent-dim"
            />
            {search && (
              <button type="button" onClick={clearSearch} aria-label="Xoá tìm kiếm" className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-lo hover:bg-raised hover:text-ink-hi">
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo cảm xúc">
              <Chip active={mood === 'All'} onClick={() => setMood('All')} count={searched.length}>Mọi cảm xúc</Chip>
              {MOODS.map((m) => (
                <Chip key={m.value} active={mood === m.value} onClick={() => setMood(m.value)} icon={m.icon} count={countMood(m.value)}>
                  {m.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo bằng chứng">
              <Chip active={evidence === 'All'} onClick={() => setEvidence('All')}>Mọi bằng chứng</Chip>
              {EVIDENCE_FILTERS.map((o) => (
                <Chip key={o.value} active={evidence === o.value} onClick={() => setEvidence(o.value)} count={countEvidence(o.value)}>
                  <EvidenceSwatch kind={o.value} /> {o.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <EmptyState variant="error" title="Không tải được phản hồi" description={error} />
        ) : loading && feedbacks.length === 0 ? (
          <div className="flex flex-col gap-2 p-5">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-raised" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Không có phản hồi khớp" description="Bỏ bớt điều kiện lọc hoặc đổi từ khoá tìm kiếm." />
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <table className="fb-table">
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '37%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '10%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Nội dung</th>
                  <th>Nhóm vấn đề</th>
                  <th>Cảm xúc</th>
                  <th>Bằng chứng</th>
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
                      <td className="fb-c-user">
                        <div className="fb-user">
                          <span className="fb-avatar" aria-hidden="true">{initials(author)}</span>
                          <div className="fb-user-text">
                            <div className="fb-user-name" title={author}>{author}</div>
                            <div className="fb-meta">{fmtDateTime(f.timestamp)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="fb-c-text"><div className="fb-clamp" title={f.originalText}>{f.originalText}</div></td>
                      <td className="fb-c-cat">{f.categoryLabel && f.category !== 'Other' ? <span className="fb-chip" title={f.categoryLabel}>{f.categoryLabel}</span> : <span className="text-ink-lo" title="Không nêu vấn đề cụ thể">—</span>}</td>
                      <td className="fb-c-sent">
                        <span className="inline-flex items-center gap-2 text-[0.8rem] text-ink-mid">
                          <SentimentFace sentiment={f.sentiment} size={22} />
                          {s.label}
                        </span>
                        {(sarcasmTag(f) || f.needsReview) && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {sarcasmTag(f) && <Badge tone={sarcasmTag(f).tone}>{sarcasmTag(f).label}</Badge>}
                            {f.needsReview && <Badge>Chờ duyệt</Badge>}
                          </span>
                        )}
                      </td>
                      <td className="fb-c-trust">
                        {f._ev.counted ? <EvidenceTag evidence={f._ev} /> : <Badge tone="crit">{exclusionLabel(f.trust)}</Badge>}
                      </td>
                      <td className="fb-c-src"><span className="fb-source">{f.source}</span></td>
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
              {fmtInt((page - 1) * PAGE_SIZE + 1)}–{fmtInt(Math.min(page * PAGE_SIZE, filtered.length))} trên {fmtInt(filtered.length)}
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
