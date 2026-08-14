import React, { useState, useEffect } from 'react';
import axios from 'axios';

const FeedbackTable = ({ timeFilter, sourceFilter, productFilter }) => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [showAll, setShowAll] = useState(false);

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
      } catch (err) {
        console.error(err);
      }
    };
    loadFeedbacks();
  }, [timeFilter, sourceFilter, productFilter]);

  const getSentimentBadge = (sentiment) => {
    switch (sentiment) {
      case 'Positive': return <span className="badge badge-low">Positive</span>;
      case 'Negative': return <span className="badge badge-critical">Negative</span>;
      default: return <span className="badge badge-medium">Neutral</span>;
    }
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'Critical': return <span className="cat-badge" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>Critical</span>;
      case 'High': return <span className="cat-badge" style={{ color: '#f97316', borderColor: 'rgba(249,115,22,0.3)' }}>High</span>;
      case 'Medium': return <span className="cat-badge" style={{ color: '#eab308', borderColor: 'rgba(234,179,8,0.3)' }}>Medium</span>;
      default: return <span className="cat-badge" style={{ color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>Low</span>;
    }
  };

  return (
    <div className="glass-panel" style={{ marginTop: '1.5rem', padding: '0' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Recent Feedbacks</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Latest reviews analyzed by AI</p>
      </div>
      
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th style={{ width: '35%' }}>Feedback</th>
              <th>Product</th>
              <th>Category</th>
              <th>Sentiment</th>
              <th>Severity</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {feedbacks.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Loading data...</td>
              </tr>
            ) : (
              (showAll ? feedbacks : feedbacks.slice(0, 4)).map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <div style={{ fontWeight: 500 }}>@{item.author || `user_${idx}`}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(item.timestamp).toLocaleDateString()}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>{item.originalText}</div>
                  </td>
                  <td><div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.productName || 'N/A'}</div></td>
                  <td><span className="cat-badge">{item.category}</span></td>
                  <td>{getSentimentBadge(item.sentiment)}</td>
                  <td>{getSeverityBadge(item.severity)}</td>
                  <td>{item.source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {feedbacks.length > 4 && (
        <div style={{ padding: '1rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button 
            onClick={() => setShowAll(!showAll)}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-secondary)',
              padding: '0.5rem 1.5rem',
              borderRadius: '99px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => e.currentTarget.style.color = 'white'}
            onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            {showAll ? 'Show Less' : `View All (${feedbacks.length})`}
          </button>
        </div>
      )}
    </div>
  );
};

export default FeedbackTable;
