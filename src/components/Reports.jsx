import React, { useState } from 'react';
import { Download, FileText, FileSpreadsheet, Calendar, Filter, Zap, CheckCircle } from 'lucide-react';
import axios from 'axios';

const Reports = () => {
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [showToast, setShowToast] = useState(false);

  const handleExportCSV = async () => {
    try {
      setDownloadingCsv(true);
      const res = await axios.get('/feedbacks');
      const data = res.data;
      
      // Convert JSON to CSV
      const headers = ['Date', 'Source', 'Author', 'Category', 'Sentiment', 'Severity', 'Original Text', 'AI Summary'];
      const csvRows = [headers.join(',')];
      
      data.forEach(row => {
        const values = [
          new Date(row.timestamp).toLocaleDateString(),
          row.source,
          row.author || 'Anonymous',
          row.category,
          row.sentiment,
          row.severity,
          `"${(row.originalText || '').replace(/"/g, '""')}"`,
          `"${(row.aiSummary || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(values.join(','));
      });
      
      const csvString = csvRows.join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `CX_Report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (error) {
      alert("Lỗi khi tải CSV: " + error.message);
    } finally {
      setDownloadingCsv(false);
    }
  };

  const handleExportPDF = () => {
    // For a real app, this would use jspdf or trigger a backend PDF generator
    alert("Tính năng xuất PDF Executive Report đang được phát triển. Tạm thời bạn có thể dùng (Ctrl+P) để in Dashboard nhé!");
  };

  const recentReports = [
    { id: 1, name: "Q3 2026 Customer Experience Summary", type: "PDF", date: "2026-08-01", size: "2.4 MB" },
    { id: 2, name: "July Escalation Logs", type: "CSV", date: "2026-07-31", size: "1.1 MB" },
    { id: 3, name: "Product Quality Sentiment Analysis", type: "PDF", date: "2026-07-15", size: "3.8 MB" }
  ];

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>Reports & Exports</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
          Generate, download, and manage your CX data reports.
        </p>
      </header>

      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="glass-panel col-span-6" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '4px solid var(--accent-blue)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileSpreadsheet size={24} color="var(--accent-blue)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Raw Data Export</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Export filtered feedbacks to CSV for Excel/BI tools</p>
            </div>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0.5rem 0' }}>
            Includes all data fields: timestamps, customer verbatim, AI sentiment, categories, and risk scores.
          </p>
          <button 
            onClick={handleExportCSV}
            disabled={downloadingCsv}
            style={{ 
              marginTop: 'auto', background: 'var(--accent-blue)', color: 'white', border: 'none', 
              padding: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600, 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              cursor: downloadingCsv ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: downloadingCsv ? 0.7 : 1
            }}
          >
            {downloadingCsv ? <Zap size={18} className="animate-pulse" /> : <Download size={18} />}
            {downloadingCsv ? 'Generating CSV...' : 'Download CSV'}
          </button>
        </div>

        <div className="glass-panel col-span-6" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '4px solid var(--accent-purple)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'rgba(168, 85, 247, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={24} color="var(--accent-purple)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Executive Report</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Auto-generated summary for management</p>
            </div>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0.5rem 0' }}>
            A comprehensive PDF including trend charts, risk matrix, and AI-driven action plans.
          </p>
          <button 
            onClick={handleExportPDF}
            style={{ 
              marginTop: 'auto', background: 'var(--accent-purple)', color: 'white', border: 'none', 
              padding: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600, 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            <Download size={18} />
            Generate PDF
          </button>
        </div>
      </div>

      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Report History</h3>
          <button style={{ 
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)',
            padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.85rem', cursor: 'pointer'
          }}>
            <Filter size={14} /> Filter
          </button>
        </div>
        
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'left' }}>
              <th style={{ padding: '1rem 0.5rem', fontWeight: 500 }}>Report Name</th>
              <th style={{ padding: '1rem 0.5rem', fontWeight: 500 }}>Type</th>
              <th style={{ padding: '1rem 0.5rem', fontWeight: 500 }}>Generated Date</th>
              <th style={{ padding: '1rem 0.5rem', fontWeight: 500 }}>Size</th>
              <th style={{ padding: '1rem 0.5rem', fontWeight: 500, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {recentReports.map(report => (
              <tr key={report.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '1rem 0.5rem', fontSize: '0.95rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {report.type === 'PDF' ? <FileText size={16} color="var(--accent-purple)" /> : <FileSpreadsheet size={16} color="var(--accent-blue)" />}
                    {report.name}
                  </div>
                </td>
                <td style={{ padding: '1rem 0.5rem' }}>
                  <span className="badge badge-medium" style={{ background: report.type === 'PDF' ? 'rgba(168, 85, 247, 0.1)' : 'rgba(56, 189, 248, 0.1)', color: report.type === 'PDF' ? 'var(--accent-purple)' : 'var(--accent-blue)' }}>
                    {report.type}
                  </span>
                </td>
                <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Calendar size={14} /> {report.date}
                  </div>
                </td>
                <td style={{ padding: '1rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{report.size}</td>
                <td style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>
                  <button style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.25rem' }}>
                    <Download size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showToast && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', background: 'var(--risk-low)', color: 'var(--bg-dark)',
          padding: '1rem 1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.75rem',
          fontWeight: 600, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 9999, animation: 'slideIn 0.3s ease-out'
        }}>
          <CheckCircle size={20} />
          Exported CSV successfully!
        </div>
      )}
    </div>
  );
};

export default Reports;
