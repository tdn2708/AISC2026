import React, { useState, useEffect } from 'react';
import axios from 'axios';

const SENTIMENT = {
  Positive: { label: 'Tích cực', cls: 'fb-pos' },
  Negative: { label: 'Tiêu cực', cls: 'fb-neg' },
  Neutral:  { label: 'Trung tính', cls: 'fb-neu' },
};

const initials = (name) =>
  name.trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();

const formatDateTime = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const date = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
};

const FeedbackTable = ({ timeFilter, sourceFilter, productFilter }) => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const loadFeedbacks = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (timeFilter && timeFilter !== 'All') params.append('time', timeFilter);
        if (sourceFilter && sourceFilter !== 'All') params.append('source', sourceFilter);
        if (productFilter && productFilter !== 'All') params.append('product', productFilter);
        const q = params.toString() ? `?${params.toString()}` : '';

        const response = await axios.get(`/feedbacks${q}`);
        setFeedbacks(response.data);
        setCurrentPage(1); // Reset to page 1 when data changes
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadFeedbacks();
  }, [timeFilter, sourceFilter, productFilter]);

  const totalPages = Math.ceil(feedbacks.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const currentFeedbacks = feedbacks.slice(startIdx, startIdx + itemsPerPage);

  const getSentiment = (sentiment) => {
    const s = SENTIMENT[sentiment] || SENTIMENT.Neutral;
    return <span className={`fb-status ${s.cls}`}>{s.label}</span>;
  };

  /**
   * Cột này trước đây hiển thị "Severity" của từng phản hồi. Mức nghiêm
   * trọng không phải thuộc tính của một câu văn — nó là kết quả kiểm
   * định thống kê trên cả cụm phản hồi, phụ thuộc quy mô và xu hướng.
   * Thay bằng hạng tin cậy của nguồn, thứ thật sự thuộc về từng phản hồi.
   */
  const getTrust = (trust) => {
    if (!trust) return <span className="fb-source">—</span>;
    const w = trust.tierWeight ?? 0;
    const color =
      w >= 0.9 ? 'var(--sev-ok)' :
      w >= 0.6 ? 'var(--text-mid)' :
      w >= 0.4 ? 'var(--sev-high)' : 'var(--sev-crit)';
    return (
      <div className="fb-trust" style={{ color }} title={`Trọng số tin cậy ${trust.weight}`}>
        <span className="fb-trust-tier">{trust.tier}</span>
        <span className="fb-trust-bar">
          <span style={{ width: `${Math.round(Math.min(Math.max(w, 0), 1) * 100)}%` }} />
        </span>
      </div>
    );
  };

  const pageItems = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 4) return [1, 2, 3, 4, 5, '...', totalPages];
    if (currentPage >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  })();

  return (
    <div className="glass-panel" style={{ marginTop: '1.5rem', padding: 0, overflow: 'hidden' }}>
      <div className="fb-panel-head">
        <div>
          <h3>Phản hồi gần đây</h3>
          <p>Chỉ hiển thị phản hồi đã qua tầng kiểm soát tin cậy</p>
        </div>
        {!loading && feedbacks.length > 0 && (
          <span className="fb-count"><b>{feedbacks.length.toLocaleString('vi-VN')}</b> phản hồi</span>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="fb-table">
          <colgroup>
            <col style={{ width: '19%' }} />
            <col style={{ width: '31%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '7%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th>Nội dung phản hồi</th>
              <th>Sản phẩm</th>
              <th>Danh mục</th>
              <th>Cảm xúc</th>
              <th>Tin cậy</th>
              <th>Nguồn</th>
            </tr>
          </thead>
          <tbody>
            {loading || feedbacks.length === 0 ? (
              <tr>
                <td colSpan="7" className="fb-empty">
                  {loading ? 'Đang tải dữ liệu...' : 'Không có phản hồi nào khớp bộ lọc'}
                </td>
              </tr>
            ) : (
              currentFeedbacks.map((item, idx) => {
                const author = item.author || `user_${startIdx + idx}`;
                const category = item.categoryLabel || item.category;
                return (
                  <tr key={item.id ?? `${startIdx}-${idx}`}>
                    <td>
                      <div className="fb-user">
                        <span className="fb-avatar" aria-hidden="true">{initials(author)}</span>
                        <div className="fb-user-text">
                          <div className="fb-user-name" title={author}>{author}</div>
                          <div className="fb-meta">{formatDateTime(item.timestamp)}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="fb-clamp" title={item.originalText}>{item.originalText}</div>
                    </td>
                    <td>
                      <div className="fb-clamp fb-product" title={item.productName}>{item.productName || '—'}</div>
                    </td>
                    <td>{category ? <span className="fb-chip" title={category}>{category}</span> : '—'}</td>
                    <td>{getSentiment(item.sentiment)}</td>
                    <td>{getTrust(item.trust)}</td>
                    <td><span className="fb-source">{item.source}</span></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && feedbacks.length > itemsPerPage && (
        <div className="fb-pager">
          <span className="fb-pager-info">
            {startIdx + 1}–{Math.min(startIdx + itemsPerPage, feedbacks.length)} / {feedbacks.length.toLocaleString('vi-VN')}
          </span>
          <div className="fb-pager-btns">
            <button
              className="fb-page-btn"
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              aria-label="Trang trước"
            >
              ‹ Trước
            </button>
            {pageItems.map((page, index) =>
              page === '...' ? (
                <span key={`gap-${index}`} className="fb-page-gap">…</span>
              ) : (
                <button
                  key={page}
                  className={`fb-page-btn${currentPage === page ? ' is-active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                  aria-current={currentPage === page ? 'page' : undefined}
                >
                  {page}
                </button>
              )
            )}
            <button
              className="fb-page-btn"
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              aria-label="Trang sau"
            >
              Sau ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackTable;
