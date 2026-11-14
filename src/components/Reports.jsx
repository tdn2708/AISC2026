import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Download, FileText, FileSpreadsheet, Calendar, Trash2, Eye, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import { REPORT } from './report_kit';
import ReportDocument from './report/ReportDocument';
import { buildReportModel } from '../lib/reportModel';
import { WORKSPACES, getWorkspace } from '../lib/workspace';
import FilterBar from './FilterBar';
import { PageHeader, GlassPanel, Button, IconButton, Segmented, Badge, EmptyState, Modal, TextField, Toast, ProgressBar } from './ui';
import { PageEnter } from './motion';

const Reports = () => {
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  // Tiến độ thật theo số tờ A4 đã chụp: { done, total }; total = 0 khi còn dựng bản in
  const [pdfProgress, setPdfProgress] = useState({ done: 0, total: 0 });
  const [showToast, setShowToast] = useState('');
  // Lỗi xuất tệp hiện bằng Toast đỏ (không dùng window.alert), tự ẩn sau 6 giây
  const [errorToast, setErrorToast] = useState('');
  const showError = (msg) => { setErrorToast(msg); setTimeout(() => setErrorToast(''), 6000); };
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

  const [confirmClear, setConfirmClear] = useState(false);
  const [exportDialog, setExportDialog] = useState(null); // { type: 'CSV' | 'PDF', name }

  const openExport = (type) =>
    setExportDialog({ type, name: `${type === 'CSV' ? 'CX_Data' : 'Executive_Report'}_${new Date().toISOString().split('T')[0]}` });

  const runExport = () => {
    const { type, name } = exportDialog;
    setExportDialog(null);
    if (type === 'CSV') handleExportCSV(name);
    else handleExportPDF(name);
  };

  const filteredHistory = historyFilter === 'All' 
    ? reportHistory 
    : reportHistory.filter(r => r.type === historyFilter);

  const handleExportCSV = async (name) => {
    const filename = (name?.trim() || 'CX_Report') + '.csv';

    try {
      setDownloadingCsv(true);
      const params = new URLSearchParams();
      if (timeFilter !== 'All') params.append('time', timeFilter);
      if (sourceFilter !== 'All') params.append('source', sourceFilter);
      if (productFilter !== 'All') params.append('product', productFilter);
      const queryParams = params.toString() ? `?${params.toString()}` : '';

      const res = await axios.get(`/feedbacks${queryParams}`);
      const data = res.data;
      
      const headers = ['Ngay', 'Nguon', 'Tac gia', 'Danh muc', 'Cam xuc', 'Hang tin cay', 'Trong so', 'Noi dung goc', 'Tom tat'];
      const csvRows = [headers.join(',')];
      
      data.forEach(row => {
        const values = [
          new Date(row.timestamp).toLocaleDateString(),
          row.source,
          row.author || 'Anonymous',
          row.category,
          row.sentiment,
          row.trust ? row.trust.tier : '',
          row.trust ? row.trust.weight : '',
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
      showError('Không tải được CSV (' + error.message + '). Bấm tải lại, hoặc đổi bộ lọc rồi thử.');
    } finally {
      setDownloadingCsv(false);
    }
  };

  /**
   * Nạp toàn bộ dữ liệu cho bản báo cáo.
   * Xem trước và xuất PDF dùng CHUNG một nguồn, nên thứ người dùng xem
   * trước đúng là thứ được in ra. Sổ đối chiếu (/trust/health) tính trên
   * toàn kho, giống trang Tổng quan, nên không gửi kèm bộ lọc.
   */
  const loadReportData = async () => {
    const params = new URLSearchParams();
    if (timeFilter !== 'All') params.append('time', timeFilter);
    if (sourceFilter !== 'All') params.append('source', sourceFilter);
    if (productFilter !== 'All') params.append('product', productFilter);
    const q = params.toString() ? `?${params.toString()}` : '';

    const [statsRes, trendRes, catRes, recRes, rootRes, healthRes] = await Promise.all([
      axios.get(`/stats${q}`),
      axios.get(`/trend${q}`),
      axios.get(`/categories${q}`),
      axios.get(`/recommendations${q}`),
      axios.get(`/root-causes${q}`),
      axios.get('/trust/health').catch(() => ({ data: null }))
    ]);

    const data = {
      stats: statsRes.data,
      trend: trendRes.data,
      categories: catRes.data,
      recommendations: recRes.data?.recommendations ?? [],
      rootCauses: rootRes.data?.causes ?? [],
      rootTotal: rootRes.data?.total ?? 0,
      health: healthRes.data,
      loadedAt: new Date().toISOString()
    };
    setPdfData(data);
    return data;
  };

  const model = useMemo(() => (pdfData ? buildReportModel({
    data: pdfData,
    filters: { time: timeFilter, source: sourceFilter, product: productFilter },
    workspaceLabel: WORKSPACES[getWorkspace()]?.label,
    generatedAt: new Date(pdfData.loadedAt)
  }) : null), [pdfData, timeFilter, sourceFilter, productFilter]);

  /**
   * Chế độ xem trước: /reports?preview=1 hiện đúng bốn tờ A4 sẽ được in,
   * không phải tải tệp về mới biết bản in trông thế nào.
   */
  const previewMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === '1';

  useEffect(() => {
    if (previewMode) loadReportData().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, timeFilter, sourceFilter, productFilter]);

  /**
   * XUẤT PDF THEO TỜ
   * --------------------------------------------------------------
   * Bản trước chụp cả mẫu báo cáo thành MỘT ảnh dài rồi cắt khúc theo
   * chiều cao trang, nên trang dài ngắn khác nhau và số trang in đè lên
   * ảnh. Giờ mẫu báo cáo được dựng sẵn thành từng tờ A4 đúng kích thước
   * (ReportDocument), mỗi tờ chụp riêng và chiếm trọn một trang PDF.
   */
  const handleExportPDF = async (name) => {
    const filename = (name?.trim() || 'Bao_cao_phan_hoi') + '.pdf';

    try {
      setGeneratingPdf(true);
      setPdfProgress({ done: 0, total: 0 });
      await loadReportData();

      // Chờ React dựng xong bốn tờ và font Be Vietnam Pro tải xong, nếu
      // không ảnh chụp sẽ ra font dự phòng
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (document.fonts?.ready) await document.fonts.ready;

      // Chờ bản in tự dàn trang xong (đo chiều cao từng khối rồi xếp vào tờ)
      for (let i = 0; i < 60 && pdfTemplateRef.current?.dataset.ready !== '1'; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const root = pdfTemplateRef.current;
      const pages = root ? Array.from(root.querySelectorAll('[data-page]')) : [];
      if (!pages.length) throw new Error('Chưa dựng được bản báo cáo');

      setPdfProgress({ done: 0, total: pages.length });
      // Hai thư viện in (~600 kB) chỉ tải khi bấm xuất: import tĩnh thì mọi trang đều phải tải
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      pdf.setProperties({
        title: 'Báo cáo phản hồi khách hàng',
        subject: 'Phân tích phản hồi khách hàng đa kênh',
        author: 'Customer Radar',
        creator: 'Customer Radar'
      });
      const W = pdf.internal.pageSize.getWidth();
      const H = pdf.internal.pageSize.getHeight();

      for (let i = 0; i < pages.length; i += 1) {
        const canvas = await html2canvas(pages[i], {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: REPORT.paper
        });
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, H, undefined, 'FAST');
        setPdfProgress({ done: i + 1, total: pages.length });
      }

      const bytes = pdf.output('blob').size;
      pdf.save(filename);

      const kb = Math.round(bytes / 1024);
      addToHistory(filename.replace('.pdf', ''), 'PDF', kb >= 1024 ? `${(kb / 1024).toFixed(1).replace('.', ',')} MB` : `${kb} KB`);

      setShowToast('PDF');
      setTimeout(() => setShowToast(''), 3000);
    } catch (error) {
      showError('Không tạo được PDF (' + error.message + '). Bấm tạo lại, hoặc thu hẹp khoảng thời gian rồi thử.');
      console.error(error);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const busy = downloadingCsv || generatingPdf;
  const typeLabel = { All: 'Tất cả', PDF: 'PDF', CSV: 'CSV' };

  return (
    <PageEnter className="cx relative">
      {previewMode ? (
        <PageHeader
          title="Bản in báo cáo"
          subtitle="Các tờ A4 đúng như tệp PDF sẽ tải về, tự dàn trang theo dữ liệu. Đổi bộ lọc bên dưới thì bản in dựng lại theo."
          actions={
            <>
              <Button variant="ghost" icon={ArrowLeft} onClick={() => window.location.assign('/reports')}>Quay lại</Button>
              <Button icon={Download} loading={generatingPdf} disabled={busy} onClick={() => openExport('PDF')}>Tải PDF</Button>
            </>
          }
        />
      ) : (
        <PageHeader
          title="Báo cáo"
          subtitle="Tệp xuất ra theo đúng bộ lọc bên dưới và chỉ gồm phản hồi được tính vào chỉ số."
          actions={<Button variant="secondary" icon={Eye} onClick={() => window.location.assign('/reports?preview=1')}>Xem trước bản in</Button>}
        />
      )}

      {generatingPdf && (
        <GlassPanel tone="strong" className="mb-5 p-4" role="status">
          <ProgressBar
            value={pdfProgress.total ? pdfProgress.done / pdfProgress.total : 0}
            label={pdfProgress.total ? `Đang chụp tờ ${Math.min(pdfProgress.done + 1, pdfProgress.total)} trên ${pdfProgress.total}` : 'Đang dựng và dàn trang bản in'}
            showValue={pdfProgress.total > 0}
          />
        </GlassPanel>
      )}

      <FilterBar
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
        hideExportButton
      />

      {!previewMode && (
      <>
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {[
          {
            type: 'PDF',
            icon: FileText,
            title: 'Báo cáo điều hành',
            ext: 'PDF, khổ A4',
            text: 'Khổ A4, tự dàn trang theo dữ liệu: tóm tắt điều hành và chỉ số chính, diễn biến khiếu nại, nhóm vấn đề, nguyên nhân, kế hoạch hành động, phụ lục về độ tin cậy dữ liệu. Hành động lấy từ thư viện hành động đã chuẩn hoá, không có đoạn nào do AI viết tự do.',
            loading: generatingPdf,
            cta: generatingPdf ? 'Đang dựng PDF…' : 'Tạo báo cáo PDF'
          },
          {
            type: 'CSV',
            icon: FileSpreadsheet,
            secondary: true,
            title: 'Dữ liệu thô',
            ext: 'CSV, mở được bằng Excel',
            text: 'Toàn bộ phản hồi trong phạm vi lọc: thời điểm, nguồn, nội dung gốc, cảm xúc, nhóm vấn đề và mức tin cậy.',
            loading: downloadingCsv,
            cta: downloadingCsv ? 'Đang xuất CSV…' : 'Tải tệp CSV'
          }
        ].map((c) => (
          <GlassPanel key={c.type} tone="strong" className="flex flex-col p-6">
            <h2 className="flex items-center gap-2 text-heading font-semibold text-ink-hi">
              <c.icon size={18} className="shrink-0 text-ink-lo" aria-hidden="true" />
              {c.title}
            </h2>
            <p className="mt-0.5 text-sm text-ink-lo">{c.ext}</p>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-ink-mid">{c.text}</p>
            <Button className="mt-5 self-start" variant={c.secondary ? 'secondary' : 'primary'} icon={Download} loading={c.loading} disabled={busy} onClick={() => openExport(c.type)}>
              {c.cta}
            </Button>
          </GlassPanel>
        ))}
      </div>

      <GlassPanel tone="strong" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-hi">Lịch sử báo cáo</h2>
            <p className="text-xs text-ink-lo">Lưu trên máy này</p>
          </div>
          <div className="flex items-center gap-2">
            <Segmented
              label="Lọc loại tệp"
              value={historyFilter}
              onChange={setHistoryFilter}
              options={['All', 'PDF', 'CSV'].map((v) => ({ value: v, label: typeLabel[v] }))}
            />
            {reportHistory.length > 0 && <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirmClear(true)}>Xoá tất cả</Button>}
          </div>
        </div>
        {filteredHistory.length === 0 ? (
          <EmptyState
            compact
            title={reportHistory.length === 0 ? 'Chưa có báo cáo nào' : `Không có tệp ${historyFilter}`}
            description={reportHistory.length === 0 ? 'Tạo một báo cáo PDF hoặc tải CSV để bắt đầu.' : 'Đổi bộ lọc loại tệp để xem các báo cáo khác.'}
          />
        ) : (
          <div className="paper"><div className="scroll-hint-x overflow-x-auto">
            <table className="data-table min-w-[620px]">
              <thead><tr><th className="pl-5">Tên báo cáo</th><th>Loại</th><th>Ngày tạo</th><th>Dung lượng</th><th className="pr-5" /></tr></thead>
              <tbody>
                {filteredHistory.map((r) => (
                  <tr key={r.id}>
                    <td className="pl-5">
                      <span className="inline-flex items-center gap-2.5 font-medium">
                        {r.type === 'PDF' ? <FileText size={16} className="text-accent" /> : <FileSpreadsheet size={16} className="text-pos" />}
                        {r.name}
                      </span>
                    </td>
                    <td><Badge tone={r.type === 'PDF' ? 'accent' : 'sky'} mono>{r.type}</Badge></td>
                    <td className="tabular-nums text-xs text-ink-mid"><span className="inline-flex items-center gap-1.5"><Calendar size={13} />{r.date}</span></td>
                    <td className="tabular-nums text-xs text-ink-mid">{r.size}</td>
                    <td className="pr-5 text-right">
                      <IconButton icon={Trash2} variant="danger" size="sm" label="Xoá khỏi lịch sử" onClick={() => deleteFromHistory(r.id)} className="ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )}
      </GlassPanel>
      </>
      )}

      <Modal
        open={Boolean(exportDialog)}
        onClose={() => setExportDialog(null)}
        icon={exportDialog?.type === 'CSV' ? FileSpreadsheet : FileText}
        title={exportDialog?.type === 'CSV' ? 'Xuất dữ liệu thô' : 'Tạo báo cáo điều hành'}
        description="Đặt tên tệp, phần mở rộng được thêm tự động."
        footer={
          <>
            <Button variant="ghost" onClick={() => setExportDialog(null)}>Huỷ</Button>
            <Button icon={Download} onClick={runExport} disabled={!exportDialog?.name?.trim()}>Xuất {exportDialog?.type}</Button>
          </>
        }
      >
        <TextField
          label="Tên tệp"
          value={exportDialog?.name || ''}
          onChange={(e) => setExportDialog((d) => ({ ...d, name: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && exportDialog?.name?.trim() && runExport()}
          trailing={<span className="pr-2 tabular-nums text-xs text-ink-lo">.{exportDialog?.type?.toLowerCase()}</span>}
        />
      </Modal>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        icon={Trash2}
        tone="crit"
        size="sm"
        title="Xoá toàn bộ lịch sử báo cáo?"
        description="Chỉ xoá danh sách trên máy này, các tệp đã tải về không bị ảnh hưởng."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>Huỷ</Button>
            <Button variant="danger" onClick={() => { setReportHistory([]); setConfirmClear(false); }}>Xoá lịch sử</Button>
          </>
        }
      />

      <Toast show={Boolean(showToast)}>Đã xuất tệp {showToast} thành công</Toast>
      <Toast show={Boolean(errorToast)} tone="crit">{errorToast}</Toast>

      {/* Bản in: xem trước thì trải bốn tờ trên mặt bàn, còn lại dựng ngoài màn hình để chụp */}
      {previewMode ? (
        <div className="-mx-4 mt-6 sm:mx-0">
          {model ? <ReportDocument ref={pdfTemplateRef} model={model} mode="preview" /> : (
            <p className="py-16 text-center text-sm text-ink-lo">Đang dựng bản in…</p>
          )}
        </div>
      ) : (
        <ReportDocument ref={pdfTemplateRef} model={model} mode="offscreen" />
      )}

    </PageEnter>
  );
};

export default Reports;
