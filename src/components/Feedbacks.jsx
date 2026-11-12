import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import FilterBar from './FilterBar';
import FeedbackList, { FeedbackListSkeleton } from './feedback/FeedbackList';
import FeedbackDetail from './feedback/FeedbackDetail';
import { PageHeader, GlassPanel, Button, IconButton, fieldClass, Chip, EmptyState, SentimentFace, EvidenceSwatch, Pager } from './ui';
import { fmtInt } from '../lib/format';
import { readStorage, writeStorage } from '../lib/storage';
import useFeedbackPage from '../hooks/useFeedbackPage';

/**
 * PHẢN HỒI
 * ------------------------------------------------------------------
 * Lọc theo cảm xúc và theo BẰNG CHỨNG (có chứng từ / người đã duyệt / AI
 * đoán) — cùng ngôn ngữ với thanh bằng chứng trên Tổng quan, thay cho ký hiệu
 * hạng P1–P5 mà người dùng doanh nghiệp không có lý do để thuộc.
 *
 * Tìm, lọc và phân trang chạy ở máy chủ: trình duyệt chỉ giữ đúng trang đang
 * xem. Con số trên các nút lọc đếm theo kết quả tìm, nên luôn khớp với bảng.
 */

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 280;
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

const Feedbacks = () => {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const [query, setQuery] = useState(params.get('q') || '');
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

  // Đến từ bảng lệnh Ctrl+K hoặc trợ lý với ?q=
  useEffect(() => {
    const q = params.get('q');
    if (q != null) {
      setSearch(q);
      setQuery(q);
    }
  }, [params]);

  // Chờ người dùng ngừng gõ rồi mới hỏi máy chủ
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [query, mood, evidence, timeFilter, sourceFilter, productFilter]);

  const { items, total, pages, counts, loading, error } = useFeedbackPage({
    time: timeFilter, source: sourceFilter, product: productFilter,
    q: query, sentiment: mood, evidence, includeAll, page, limit: PAGE_SIZE
  });
  const firstLoad = loading && !counts;

  const clearSearch = () => {
    setSearch('');
    setQuery('');
    if (params.get('q')) {
      const next = new URLSearchParams(params);
      next.delete('q');
      setParams(next, { replace: true });
    }
  };

  const clearAll = () => {
    clearSearch();
    setMood('All');
    setEvidence('All');
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

      {includeAll && counts && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-dim px-4 py-3 text-sm text-ink-mid">
          <span>
            Đang xem cả phản hồi không được tính: <b className="text-ink-hi">{fmtInt(counts.counted)}</b> được tính,{' '}
            <b className="text-ink-hi">{fmtInt(counts.all - counts.counted)}</b> không tính (rác, nghi ảo hoặc quá cũ).
          </span>
          <Button variant="link" size="sm" onClick={() => { const next = new URLSearchParams(params); next.delete('include'); setParams(next, { replace: true }); }}>
            Chỉ xem phản hồi được tính
          </Button>
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
              className={`pr-12 pl-11 ${fieldClass()}`}
            />
            {search && (
              <IconButton icon={X} variant="ghost" size={28} label="Xoá tìm kiếm" onClick={clearSearch} className="absolute! top-1/2 right-3 -translate-y-1/2" />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo cảm xúc">
              <Chip active={mood === 'All'} onClick={() => setMood('All')} count={counts?.all}>Mọi cảm xúc</Chip>
              {MOODS.map((m) => (
                <Chip key={m.value} active={mood === m.value} onClick={() => setMood(m.value)} icon={m.icon} count={counts?.sentiment[m.value]}>
                  {m.label}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo bằng chứng">
              <Chip active={evidence === 'All'} onClick={() => setEvidence('All')}>Mọi bằng chứng</Chip>
              {EVIDENCE_FILTERS.map((o) => (
                <Chip key={o.value} active={evidence === o.value} onClick={() => setEvidence(o.value)} count={counts?.evidence[o.value]}>
                  <EvidenceSwatch kind={o.value} /> {o.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <EmptyState variant="error" title="Không tải được phản hồi" description={error} />
        ) : firstLoad ? (
          <FeedbackListSkeleton rows={8} />
        ) : total === 0 ? (
          <EmptyState
            title="Không có phản hồi khớp"
            description={query ? `Không tìm thấy "${query}" trong phạm vi đang lọc.` : 'Bỏ bớt điều kiện lọc hoặc đổi khoảng thời gian.'}
            action={(query || mood !== 'All' || evidence !== 'All') && (
              <Button variant="link" onClick={clearAll}>Xoá tìm kiếm và bộ lọc</Button>
            )}
          />
        ) : (
          <FeedbackList items={items} onSelect={setSelected} dimmed={loading} />
        )}

        <Pager page={page} pages={pages} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </GlassPanel>

      <FeedbackDetail item={selected} onClose={() => setSelected(null)} />
    </div>
  );
};

export default Feedbacks;
