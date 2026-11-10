import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { EmptyState, Pager } from './ui';
import { fmtInt } from '../lib/format';
import useFeedbackPage from '../hooks/useFeedbackPage';
import FeedbackList, { FeedbackListSkeleton } from './feedback/FeedbackList';
import FeedbackDetail from './feedback/FeedbackDetail';

/**
 * PHẢN HỒI GẦN ĐÂY (trang Tổng quan)
 * Mười phản hồi mới nhất theo bộ lọc đang chọn, tải từng trang từ máy chủ.
 * Bấm một dòng mở chi tiết ngay tại chỗ, không phải sang trang Phản hồi.
 */

const PAGE_SIZE = 10;

const FeedbackTable = ({ timeFilter, sourceFilter, productFilter }) => {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  useEffect(() => setPage(1), [timeFilter, sourceFilter, productFilter]);

  const { items, total, pages, loading, error } = useFeedbackPage({
    time: timeFilter, source: sourceFilter, product: productFilter, page, limit: PAGE_SIZE
  });

  // Giữ nguyên bộ lọc khi sang trang Phản hồi
  const all = new URLSearchParams();
  if (timeFilter && timeFilter !== 'All') all.set('time', timeFilter);
  if (sourceFilter && sourceFilter !== 'All') all.set('source', sourceFilter);
  if (productFilter && productFilter !== 'All') all.set('product', productFilter);
  const allHref = `/feedbacks${all.toString() ? `?${all}` : ''}`;

  return (
    <div className="overflow-hidden glass-strong rounded-xl">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-heading font-semibold text-ink-hi">Phản hồi gần đây</h2>
          <p className="mt-0.5 text-sm text-ink-mid">Mới nhất trước, chỉ gồm phản hồi được tính vào chỉ số. Bấm một dòng để xem chi tiết.</p>
        </div>
        {total > 0 && (
          <Link to={allHref} className="inline-flex items-center gap-1 text-sm font-semibold text-accent-hi hover:underline">
            Xem cả {fmtInt(total)} phản hồi <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        )}
      </header>

      {error ? (
        <EmptyState variant="error" compact title="Không tải được phản hồi" description={error} />
      ) : loading && items.length === 0 ? (
        <FeedbackListSkeleton rows={6} />
      ) : items.length === 0 ? (
        <EmptyState compact title="Không có phản hồi nào khớp bộ lọc" description="Đổi khoảng thời gian, nguồn hoặc sản phẩm ở thanh lọc phía trên." />
      ) : (
        <FeedbackList items={items} showProduct onSelect={setSelected} dimmed={loading} />
      )}

      <Pager page={page} pages={pages} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      <FeedbackDetail item={selected} onClose={() => setSelected(null)} />
    </div>
  );
};

export default FeedbackTable;
