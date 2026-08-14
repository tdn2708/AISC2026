import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, Calendar, Filter, Zap, CheckCircle, Loader2, Trash2, ChevronDown } from 'lucide-react';
import axios from 'axios';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, Cell, PieChart, Pie, Legend } from 'recharts';
import FilterBar from './FilterBar';

const Reports = () => {
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [showToast, setShowToast] = useState('');
  const [pdfData, setPdfData] = useState(null);
  
  const [timeFilter, setTimeFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [productFilter, setProductFilter] = useState('All');
  
  // Report History
  const [reportHistory, setReportHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('reportHistory');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [historyFilter, setHistoryFilter] = useState('All'); // 'All', 'PDF', 'CSV'
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);

  useEffect(() => {
    localStorage.setItem('reportHistory', JSON.stringify(reportHistory));
  }, [reportHistory]);
  
  const pdfTemplateRef = useRef(null);

  const addToHistory = (name, type, size) => {
    const entry = {
      id: Date.now(),
      name,
      type,
      date: new Date().toISOString().split('T')[0],
      size
    };
    setReportHistory(prev => [entry, ...prev]);
  };

  const deleteFromHistory = (id) => {
    setReportHistory(prev => prev.filter(r => r.id !== id));
  };

  const clearAllHistory = () => {
    if (window.confirm('Bạn có chắc muốn xóa toàn bộ lịch sử báo cáo?')) {
      setReportHistory([]);
    }
  };

  const filteredHistory = historyFilter === 'All' 
    ? reportHistory 
    : reportHistory.filter(r => r.type === historyFilter);

  const handleExportCSV = async () => {
    // Prompt user for custom filename
    const userFilename = window.prompt('Đặt tên file CSV:', `CX_Report_${new Date().toISOString().split('T')[0]}`);
    if (userFilename === null) return; // User cancelled
    const filename = (userFilename.trim() || 'CX_Report') + '.csv';

    try {
      setDownloadingCsv(true);
      const params = new URLSearchParams();
      if (timeFilter !== 'All') params.append('time', timeFilter);
      if (sourceFilter !== 'All') params.append('source', sourceFilter);
      if (productFilter !== 'All') params.append('product', productFilter);
      const queryParams = params.toString() ? `?${params.toString()}` : '';

      const res = await axios.get(`/feedbacks${queryParams}`);
      const data = res.data;
      
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
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Add to history
      const sizeKB = Math.round(blob.size / 1024);
      addToHistory(filename.replace('.csv', ''), 'CSV', sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`);
      
      setShowToast('CSV');
      setTimeout(() => setShowToast(''), 3000);
    } catch (error) {
      alert("Lỗi khi tải CSV: " + error.message);
    } finally {
      setDownloadingCsv(false);
    }
  };

  const handleExportPDF = async () => {
    if (!pdfTemplateRef.current) return;

    // Prompt user for custom filename
    const userFilename = window.prompt('Đặt tên file PDF:', `Executive_Report_${new Date().toISOString().split('T')[0]}`);
    if (userFilename === null) return; // User cancelled
    const filename = (userFilename.trim() || 'Executive_Report') + '.pdf';

    try {
      setGeneratingPdf(true);
      
      // Fetch real data from backend
      const params = new URLSearchParams();
      if (timeFilter !== 'All') params.append('time', timeFilter);
      if (sourceFilter !== 'All') params.append('source', sourceFilter);
      if (productFilter !== 'All') params.append('product', productFilter);
      const queryParams = params.toString() ? `?${params.toString()}` : '';

      const [statsRes, trendRes, catRes] = await Promise.all([
        axios.get(`/stats${queryParams}`),
        axios.get(`/trend${queryParams}`),
        axios.get(`/categories${queryParams}`)
      ]);
      
      setPdfData({
        stats: statsRes.data,
        trend: trendRes.data,
        categories: catRes.data.slice(0, 5) // top 5 categories
      });

      // Give React time to render the new data in the hidden component
      await new Promise(r => setTimeout(r, 500));

      const canvas = await html2canvas(pdfTemplateRef.current, {
        scale: 2, // High resolution
        useCORS: true,
        logging: false,
        backgroundColor: '#0f172a'
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      // A4 paper dimensions (210x297 mm)
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(filename);

      // Add to history (estimate ~500KB per page)
      addToHistory(filename.replace('.pdf', ''), 'PDF', `${(pdfHeight / 297 * 0.5).toFixed(1)} MB`);
      
      setShowToast('PDF');
      setTimeout(() => setShowToast(''), 3000);
    } catch (error) {
      alert("Lỗi khi tạo PDF: " + error.message);
      console.error(error);
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2rem', position: 'relative' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.875rem', fontWeight: 700, margin: '0 0 0.25rem 0' }}>Reports & Exports</h2>
        <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
          Generate, download, and manage your CX data reports.
        </p>
      </header>

      <FilterBar 
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
        hideExportButton={true}
      />

      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        {/* CSV Export */}
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
            disabled={downloadingCsv || generatingPdf}
            style={{ 
              marginTop: 'auto', background: 'var(--accent-blue)', color: 'white', border: 'none', 
              padding: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600, 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              cursor: (downloadingCsv || generatingPdf) ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: (downloadingCsv || generatingPdf) ? 0.7 : 1
            }}
          >
            {downloadingCsv ? <Zap size={18} className="animate-pulse" /> : <Download size={18} />}
            {downloadingCsv ? 'Generating CSV...' : 'Download CSV'}
          </button>
        </div>

        {/* PDF Export */}
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
            disabled={downloadingCsv || generatingPdf}
            style={{ 
              marginTop: 'auto', background: 'var(--accent-purple)', color: 'white', border: 'none', 
              padding: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600, 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              cursor: (downloadingCsv || generatingPdf) ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: (downloadingCsv || generatingPdf) ? 0.7 : 1
            }}
          >
            {generatingPdf ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            {generatingPdf ? 'Rendering PDF...' : 'Generate Premium PDF'}
          </button>
        </div>
      </div>

      {/* Report History */}
      <div className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Report History</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {/* Filter Dropdown */}
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => setShowHistoryFilter(!showHistoryFilter)}
                style={{ 
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)',
                  padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Filter size={14} /> {historyFilter === 'All' ? 'All Types' : historyFilter}
                <ChevronDown size={12} />
              </button>
              {showHistoryFilter && (
                <div className="glass-panel animate-fade-in" style={{
                  position: 'absolute', top: '110%', right: 0, width: '140px',
                  padding: '0.4rem', zIndex: 20,
                  background: 'rgba(15, 23, 42, 0.95)',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}>
                  {['All', 'PDF', 'CSV'].map(opt => (
                    <div key={opt}
                      onClick={() => { setHistoryFilter(opt); setShowHistoryFilter(false); }}
                      style={{
                        padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)',
                        background: historyFilter === opt ? 'rgba(255,255,255,0.1)' : 'transparent',
                        cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
                      onMouseLeave={(e) => e.target.style.background = historyFilter === opt ? 'rgba(255,255,255,0.1)' : 'transparent'}
                    >
                      {opt === 'All' ? 'All Types' : opt}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Clear All button */}
            {reportHistory.length > 0 && (
              <button 
                onClick={clearAllHistory}
                style={{ 
                  background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--risk-critical)',
                  padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)'}
              >
                <Trash2 size={14} /> Xóa tất cả
              </button>
            )}
          </div>
        </div>
        
        {filteredHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <FileText size={40} style={{ marginBottom: '1rem', opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: '0.95rem' }}>
              {reportHistory.length === 0 ? 'Chưa có báo cáo nào. Hãy tải CSV hoặc PDF để bắt đầu!' : `Không có báo cáo loại "${historyFilter}".`}
            </p>
          </div>
        ) : (
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
              {filteredHistory.map(report => (
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
                    <button 
                      onClick={() => deleteFromHistory(report.id)}
                      title="Xóa khỏi lịch sử"
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem', transition: 'color 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = 'var(--risk-critical)'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showToast && (
        <div style={{
          position: 'fixed', bottom: '2rem', right: '2rem', background: 'var(--risk-low)', color: 'var(--bg-dark)',
          padding: '1rem 1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.75rem',
          fontWeight: 600, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: 9999, animation: 'slideIn 0.3s ease-out'
        }}>
          <CheckCircle size={20} />
          Exported {showToast} successfully!
        </div>
      )}

      {/* Hidden PDF Template Container (Rendered off-screen with high-res styling) */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div 
          ref={pdfTemplateRef} 
          style={{
            width: '1000px',
            minHeight: '1414px',
            padding: '60px',
            background: '#0f172a',
            color: '#f8fafc',
            fontFamily: 'Inter, sans-serif',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Main Content Wrapper */}
          <div style={{ flex: 1 }}>
            {/* Header */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f8fafc', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>CX ANALYTICS DASHBOARD</h1>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>Executive Summary Report</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#f8fafc', fontWeight: 600, margin: '0 0 4px 0' }}>Generated Date: {new Date().toLocaleDateString()}</p>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>Filter: {timeFilter === 'All' ? 'All Time' : timeFilter} | Source: {sourceFilter} | Product: {productFilter}</p>
            </div>
          </div>

          {/* AI Summary Section */}
          <div style={{ background: 'rgba(139, 92, 246, 0.1)', borderLeft: '4px solid #8b5cf6', padding: '20px', borderRadius: '0 8px 8px 0', marginBottom: '30px' }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#f8fafc', fontSize: '16px' }}>AI Insights & Recommendations</h3>
            <p style={{ margin: 0, color: '#cbd5e1', fontSize: '13px', lineHeight: 1.6 }}>
              Overall sentiment has been highly positive over the last 30 days. However, recent data indicates a slight uptick in complaints related to "Delivery Delays" in the Shopee channel. It is recommended to follow up with logistics partners to mitigate risk. Product Quality remains our strongest asset, consistently scoring above industry benchmarks.
            </p>
          </div>

          {/* Top Metrics Row */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
              <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Feedbacks</p>
              <h2 style={{ margin: 0, fontSize: '28px', color: '#f8fafc' }}>{pdfData?.stats?.totalComplaints || 0}</h2>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
              <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Complaint Rate</p>
              <h2 style={{ margin: 0, fontSize: '28px', color: '#ef4444' }}>{pdfData?.stats?.complaintRate || "0%"}</h2>
            </div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
              <p style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Avg Resolution</p>
              <h2 style={{ margin: 0, fontSize: '28px', color: '#10b981' }}>{pdfData?.stats?.avgResolutionTime || "0 hrs"}</h2>
            </div>
          </div>

          {/* Charts Row */}
          <div style={{ display: 'flex', gap: '20px' }}>
            {/* Trend Chart */}
            <div style={{ flex: 1.5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '30px', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#f8fafc' }}>Trend Analytics</h3>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 30px 0' }}>Timeline of Negative vs Positive feedback</p>
              <div style={{ height: '400px' }}>
                {pdfData?.trend && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pdfData.trend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorComplaintsPdf" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorSatisfactionPdf" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
                      <Area name="Complaints" type="monotone" dataKey="complaints" stackId="2" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorComplaintsPdf)" isAnimationActive={false} />
                      <Area name="Satisfaction" type="monotone" dataKey="satisfaction" stackId="1" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSatisfactionPdf)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Category Chart */}
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '30px', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '18px', color: '#f8fafc' }}>Issue Categories</h3>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: '0 0 30px 0' }}>Distribution by topic</p>
              <div style={{ height: '400px' }}>
                {pdfData?.categories && (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pdfData.categories}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {pdfData.categories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill || '#3b82f6'} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }}/>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
          </div> {/* End Main Content */}
          
          {/* Footer at the absolute bottom */}
          <div style={{ marginTop: '40px', paddingTop: '30px', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
            Generated by AISC2026 Enterprise Platform. Confidential and Proprietary.
          </div>
        </div>
      </div>

    </div>
  );
};

export default Reports;
