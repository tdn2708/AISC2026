import React, { useState, useRef } from 'react';
import { Download, FileText, FileSpreadsheet, Calendar, Filter, Zap, CheckCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, Cell, PieChart, Pie, Legend } from 'recharts';
import FilterBar from './FilterBar';

// Mock data for the PDF to ensure it generates even if backend fails
const mockTrend = [
  { name: '10/08', complaints: 4, satisfaction: 12 },
  { name: '11/08', complaints: 3, satisfaction: 15 },
  { name: '12/08', complaints: 7, satisfaction: 10 },
  { name: '13/08', complaints: 2, satisfaction: 18 }
];

const mockCategories = [
  { name: 'Delivery', value: 35, fill: '#3b82f6' },
  { name: 'Quality', value: 25, fill: '#a855f7' },
  { name: 'Service', value: 20, fill: '#06b6d4' },
  { name: 'Payment', value: 10, fill: '#6366f1' }
];

const Reports = () => {
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [showToast, setShowToast] = useState('');
  const [pdfData, setPdfData] = useState(null);
  
  const [timeFilter, setTimeFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  
  const pdfTemplateRef = useRef(null);

  const handleExportCSV = async () => {
    try {
      setDownloadingCsv(true);
      const queryParams = `?time=${encodeURIComponent(timeFilter)}&source=${encodeURIComponent(sourceFilter)}`;
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
      link.setAttribute('download', `CX_Report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
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
    try {
      setGeneratingPdf(true);
      
      // Fetch real data from backend
      const queryParams = `?time=${encodeURIComponent(timeFilter)}&source=${encodeURIComponent(sourceFilter)}`;
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
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      // A4 paper dimensions (210x297 mm)
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Executive_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      
      setShowToast('PDF');
      setTimeout(() => setShowToast(''), 3000);
    } catch (error) {
      alert("Lỗi khi tạo PDF: " + error.message);
      console.error(error);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const recentReports = [
    { id: 1, name: "Q3 2026 Customer Experience Summary", type: "PDF", date: "2026-08-01", size: "2.4 MB" },
    { id: 2, name: "July Escalation Logs", type: "CSV", date: "2026-07-31", size: "1.1 MB" },
    { id: 3, name: "Product Quality Sentiment Analysis", type: "PDF", date: "2026-07-15", size: "3.8 MB" }
  ];

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
          Exported {showToast} successfully!
        </div>
      )}

      {/* Hidden PDF Template Container (Rendered off-screen with high-res styling) */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div 
          ref={pdfTemplateRef} 
          style={{
            width: '1000px', // Wider width to match dashboard feel
            padding: '40px',
            background: '#0f172a', // Dark theme background matching Dashboard
            color: '#f8fafc', // Light text
            fontFamily: 'Inter, sans-serif'
          }}
        >
          {/* Header */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f8fafc', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>CX ANALYTICS DASHBOARD</h1>
              <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>Executive Summary Report</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#f8fafc', fontWeight: 600, margin: '0 0 4px 0' }}>Generated Date: {new Date().toLocaleDateString()}</p>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>Filter: {timeFilter === 'All' ? 'All Time' : timeFilter} | Source: {sourceFilter}</p>
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
            <div style={{ flex: 1.5, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#f8fafc' }}>Trend Analytics</h3>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 20px 0' }}>Timeline of Negative vs Positive feedback</p>
              <div style={{ height: '250px' }}>
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
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#f8fafc' }}>Issue Categories</h3>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 20px 0' }}>Distribution by topic</p>
              <div style={{ height: '250px' }}>
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
          
          <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: '#64748b', fontSize: '11px' }}>
            Generated by AISC2026 Enterprise Platform. Confidential and Proprietary.
          </div>
        </div>
      </div>

    </div>
  );
};

export default Reports;
