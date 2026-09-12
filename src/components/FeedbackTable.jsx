import React, { useState, useEffect } from 'react';
import axios from 'axios';

const FeedbackTable = ({ timeFilter, sourceFilter, productFilter }) => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const loadFeedbacks = async () => {
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
      }
    };
    loadFeedbacks();
  }, [timeFilter, sourceFilter, productFilter]);

  const totalPages = Math.ceil(feedbacks.length / itemsPerPage);
  
  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };
  
  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  };

  const currentFeedbacks = feedbacks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getSentimentBadge = (sentiment) => {
    switch (sentiment) {
      case 'Positive': return <span className="badge badge-low">Tích cực</span>;
      case 'Negative': return <span className="badge badge-critical">Tiêu cực</span>;
      default: return <span className="badge badge-medium">Trung tính</span>;
    }
  };

  /**
   * Cột này trước đây hiển thị "Severity" của từng phản hồi. Mức nghiêm
   * trọng không phải thuộc tính của một câu văn — nó là kết quả kiểm
   * định thống kê trên cả cụm phản hồi, phụ thuộc quy mô và xu hướng.
   * Thay bằng hạng tin cậy của nguồn, thứ thật sự thuộc về từng phản hồi.
   */
  const getTrustBadge = (trust) => {
    if (!trust) return <span className="cat-badge">—</span>;
    const color =
      trust.tierWeight >= 0.9 ? '#10b981' :
      trust.tierWeight >= 0.6 ? '#eab308' :
      trust.tierWeight >= 0.4 ? '#f97316' : '#ef4444';
    return (
      <span className="cat-badge" style={{ color, borderColor: color + '4d' }}
            title={`Trọng số tin cậy ${trust.weight}`}>
        {trust.tier}
      </span>
    );
  };

  return (
    <div className="glass-panel" style={{ marginTop: '1.5rem', padding: '0' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Phản hồi gần đây</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Chỉ hiển thị phản hồi đã qua tầng kiểm soát tin cậy</p>
      </div>
      
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Khách hàng</th>
              <th style={{ width: '35%' }}>Nội dung phản hồi</th>
              <th>Sản phẩm</th>
              <th>Danh mục</th>
              <th>Cảm xúc</th>
              <th>Độ tin cậy</th>
              <th>Nguồn</th>
            </tr>
          </thead>
          <tbody>
            {feedbacks.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Đang tải dữ liệu...</td>
              </tr>
            ) : (
              currentFeedbacks.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <div style={{ fontWeight: 500 }}>@{item.author || `user_${idx}`}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(item.timestamp).toLocaleDateString()}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>{item.originalText}</div>
                  </td>
                  <td><div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.productName || 'N/A'}</div></td>
                  <td><span className="cat-badge">{item.categoryLabel || item.category}</span></td>
                  <td>{getSentimentBadge(item.sentiment)}</td>
                  <td>{getTrustBadge(item.trust)}</td>
                  <td>{item.source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {feedbacks.length > itemsPerPage && (
        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap' }}>
          <button 
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              transition: 'background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out',
            }}
          >
            Trang trước
          </button>
          
          {(() => {
            const pages = [];
            if (totalPages <= 7) {
              for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
              if (currentPage <= 4) {
                pages.push(1, 2, 3, 4, 5, '...', totalPages);
              } else if (currentPage >= totalPages - 3) {
                pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
              } else {
                pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
              }
            }
            return pages.map((page, index) => (
              <button
                key={index}
                onClick={() => page !== '...' && setCurrentPage(page)}
                disabled={page === '...'}
                style={{
                  background: currentPage === page ? 'var(--accent-dim)' : 'transparent',
                  border: currentPage === page ? '1px solid var(--accent-blue)' : '1px solid rgba(255,255,255,0.1)',
                  color: currentPage === page ? 'var(--accent-blue)' : (page === '...' ? 'var(--text-muted)' : 'var(--text-secondary)'),
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  cursor: page === '...' ? 'default' : 'pointer',
                  fontSize: '0.85rem',
                  minWidth: '36px',
                  transition: 'background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out',
                }}
              >
                {page}
              </button>
            ));
          })()}

          <button 
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem',
              transition: 'background-color 120ms ease-out, border-color 120ms ease-out, color 120ms ease-out',
            }}
          >
            Trang sau
          </button>
        </div>
      )}
    </div>
  );
};

export default FeedbackTable;
