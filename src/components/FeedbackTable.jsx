import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { EvidenceTag } from './ui';
import { evidenceOf } from '../lib/format';

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
  return `${date} ${time}`;
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

  // Bằng chứng của từng phản hồi — cùng ngôn ngữ với thanh bằng chứng phía trên
  const getTrust = (item) => (item.trust ? <EvidenceTag evidence={evidenceOf(item)} /> : <span className="fb-source">—</span>);

  const pageItems = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 4) return [1, 2, 3, 4, 5, '...', totalPages];
    if (currentPage >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  })();

  return (
    <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="fb-panel-head">
        <div>
          <h3>Phản hồi gần đây</h3>
          <p>Mới nhất trước, chỉ gồm phản hồi được tính vào chỉ số</p>
        </div>
        {!loading && feedbacks.length > 0 && (
          <Link to="/feedbacks" className="fb-count hover:underline">
            <b>{feedbacks.length.toLocaleString('vi-VN')}</b> phản hồi, xem tất cả
          </Link>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="fb-table">
          <colgroup>
            <col style={{ width: '19%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '7%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th>Nội dung</th>
              <th>Sản phẩm</th>
              <th>Nhóm vấn đề</th>
              <th>Cảm xúc</th>
              <th>Bằng chứng</th>
              <th>Nguồn</th>
            </tr>
          </thead>
          <tbody>
            {loading || feedbacks.length === 0 ? (
              <tr>
                <td colSpan="7" className="fb-empty">
                  {loading ? 'Đang tải…' : 'Không có phản hồi nào khớp bộ lọc'}
                </td>
              </tr>
            ) : (
              currentFeedbacks.map((item, idx) => {
                const author = item.author || 'Ẩn danh';
                const category = item.categoryLabel || item.category;
                return (
                  <tr key={item.id ?? `${startIdx}-${idx}`}>
                    <td className="fb-c-user">
                      <div className="fb-user">
                        <span className="fb-avatar" aria-hidden="true">{initials(author)}</span>
                        <div className="fb-user-text">
                          <div className="fb-user-name" title={author}>{author}</div>
                          <div className="fb-meta">{formatDateTime(item.timestamp)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="fb-c-text">
                      <div className="fb-clamp" title={item.originalText}>{item.originalText}</div>
                    </td>
                    <td className="fb-c-product">
                      <div className="fb-clamp fb-product" title={item.productName}>{item.productName || '—'}</div>
                    </td>
                    <td className="fb-c-cat">{category && item.category !== 'Other' ? <span className="fb-chip" title={category}>{category}</span> : <span className="text-xs text-ink-lo">Không nêu vấn đề</span>}</td>
                    <td className="fb-c-sent">{getSentiment(item.sentiment)}</td>
                    <td className="fb-c-trust">{getTrust(item)}</td>
                    <td className="fb-c-src"><span className="fb-source">{item.source}</span></td>
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
