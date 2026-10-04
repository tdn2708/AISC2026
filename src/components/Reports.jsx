import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, Calendar, Trash2, Eye } from 'lucide-react';
import axios from 'axios';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  AreaChart, Area, Legend, ComposedChart, Line, ReferenceDot, ReferenceLine
} from 'recharts';
import { REPORT, fmtInt, DeltaPill, SeverityDot, buildTakeaways, buildPareto, findPeak } from './report_kit';
import FilterBar from './FilterBar';
import { PageHeader, GlassPanel, Button, Segmented, Badge, EmptyState, Modal, TextField, Toast } from './ui';

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
      alert("Lỗi khi tải CSV: " + error.message);
    } finally {
      setDownloadingCsv(false);
    }
  };

  /**
   * Nạp toàn bộ dữ liệu cho mẫu báo cáo.
   * Tách riêng khỏi hàm xuất PDF để chế độ xem trước và chế độ xuất dùng
   * CHUNG một nguồn — nếu hai đường đi lấy dữ liệu khác nhau thì thứ
   * người dùng xem trước sẽ không phải thứ được in ra.
   */
  const loadReportData = async () => {
    const params = new URLSearchParams();
    if (timeFilter !== 'All') params.append('time', timeFilter);
    if (sourceFilter !== 'All') params.append('source', sourceFilter);
    if (productFilter !== 'All') params.append('product', productFilter);
    const q = params.toString() ? `?${params.toString()}` : '';

    const [statsRes, trendRes, catRes, recRes, rootRes] = await Promise.all([
      axios.get(`/stats${q}`),
      axios.get(`/trend${q}`),
      axios.get(`/categories${q}`),
      axios.get(`/recommendations${q}`),
      axios.get(`/root-causes${q}`)
    ]);

    setPdfData({
      stats: statsRes.data,
      trend: trendRes.data,
      categories: catRes.data,
      recommendations: recRes.data?.recommendations ?? [],
      rootCauses: rootRes.data?.causes ?? [],
      rootTotal: rootRes.data?.total ?? 0
    });
  };

  /**
   * Chế độ xem trước: mở /reports?preview=1 để xem đúng trang sẽ được in
   * mà không phải tải tệp về. Trước đây muốn kiểm tra một thay đổi nhỏ
   * trên mẫu báo cáo thì phải xuất một tệp PDF thật rồi mở ra xem.
   */
  const previewMode =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === '1';

  useEffect(() => {
    if (previewMode) loadReportData().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, timeFilter, sourceFilter, productFilter]);

  const handleExportPDF = async (name) => {
    if (!pdfTemplateRef.current) return;
    const filename = (name?.trim() || 'Executive_Report') + '.pdf';

    try {
      setGeneratingPdf(true);
      
      // Fetch real data from backend
      const params = new URLSearchParams();
      if (timeFilter !== 'All') params.append('time', timeFilter);
      if (sourceFilter !== 'All') params.append('source', sourceFilter);
      if (productFilter !== 'All') params.append('product', productFilter);
      const queryParams = params.toString() ? `?${params.toString()}` : '';

      // Báo cáo KHÔNG tự viết lại phần khuyến nghị. Động cơ
      // recommender ở backend đã sinh sẵn đúng cấu trúc mà cấp quản lý
      // cần — vấn đề, mức ảnh hưởng bằng số khách và bằng tiền, rồi
      // hành động đã xếp theo giá trị kỳ vọng. Trước đây trang này gọi
      // /risks (cảnh báo thô kèm z và p) rồi tự diễn đạt lại, nên phần
      // hành động bị mất hoàn toàn.
      const [statsRes, trendRes, catRes, recRes, rootRes] = await Promise.all([
        axios.get(`/stats${queryParams}`),
        axios.get(`/trend${queryParams}`),
        axios.get(`/categories${queryParams}`),
        axios.get(`/recommendations${queryParams}`),
        axios.get(`/root-causes${queryParams}`)
      ]);

      setPdfData({
        stats: statsRes.data,
        trend: trendRes.data,
        categories: catRes.data,
        recommendations: recRes.data?.recommendations ?? [],
        rootCauses: rootRes.data?.causes ?? [],
        rootTotal: rootRes.data?.total ?? 0
      });

      // Give React time to render the new data in the hidden component
      await new Promise(r => setTimeout(r, 500));

      const node = pdfTemplateRef.current;
      const scale = 2;

      const canvas = await html2canvas(node, {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor: REPORT.canvas
      });

      /**
       * PHÂN TRANG
       * --------------------------------------------------------------
       * Bản cũ gọi addImage đúng MỘT LẦN lên một trang A4. Ảnh chụp mẫu
       * báo cáo cao 2.208px, quy về bề ngang A4 là 463,7mm, trong khi
       * một trang chỉ cao 297mm — nên 36% nội dung phía dưới bị cắt mất
       * mà không có một cảnh báo nào. Biểu đồ và bảng nguyên nhân gốc rễ
       * không bao giờ tới được tệp PDF.
       *
       * Cách sửa không chỉ là thêm trang. Cắt mù theo mỗi 297mm sẽ xẻ
       * đôi một thẻ chỉ số hoặc một biểu đồ, và một bản báo cáo mang đi
       * họp mà nửa cái biểu đồ nằm sang trang sau thì vẫn là hỏng.
       *
       * Nên điểm cắt được chọn theo RANH GIỚI KHỐI: mỗi khối nội dung tự
       * khai báo bằng data-block, và đường cắt luôn lùi lên đầu khối gần
       * nhất. Chỉ khối nào cao hơn một trang mới buộc phải cắt giữa.
       */
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeightMm = pdf.internal.pageSize.getHeight();

      // Số pixel ảnh tương ứng với một trang giấy
      const pxPerMm = canvas.width / pdfWidth;
      const pageHeightPx = pageHeightMm * pxPerMm;

      // Ranh giới các khối, quy về hệ toạ độ của ảnh đã chụp
      const nodeTop = node.getBoundingClientRect().top;
      const blocks = Array.from(node.querySelectorAll('[data-block]'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { top: (r.top - nodeTop) * scale, bottom: (r.bottom - nodeTop) * scale };
        })
        .sort((a, b) => a.top - b.top);

      /** Điểm cắt an toàn gần nhất tính từ `from` xuống dưới */
      const nextCut = (from) => {
        const ideal = from + pageHeightPx;
        if (ideal >= canvas.height) return canvas.height;
        const hit = blocks.find((b) => b.top < ideal && b.bottom > ideal);
        if (!hit) return ideal;
        // Lùi lên đầu khối bị cắt, trừ khi chính khối đó cao hơn một trang
        if (hit.top > from && hit.bottom - hit.top <= pageHeightPx) return hit.top;
        return ideal;
      };

      const page = document.createElement('canvas');
      const ctx = page.getContext('2d');
      page.width = canvas.width;

      const cuts = [];
      let y = 0;
      while (y < canvas.height - 1 && cuts.length < 20) {
        const to = nextCut(y);
        if (to <= y) break;
        cuts.push([y, to]);
        y = to;
      }

      let pageNo = 0;
      for (const [top, bottom] of cuts) {
        const sliceH = Math.round(bottom - top);
        page.height = sliceH;
        ctx.fillStyle = REPORT.canvas;
        ctx.fillRect(0, 0, page.width, sliceH);
        ctx.drawImage(canvas, 0, top, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

        if (pageNo > 0) pdf.addPage();

        // Tô nền TOÀN TRANG trước khi dán ảnh. Vì điểm cắt lùi lên ranh
        // giới khối nên lát ảnh thường ngắn hơn một trang giấy, và phần
        // dư phía dưới sẽ lấy nền mặc định của PDF là màu trắng — một
        // mảng trắng giữa bản báo cáo nền tối trông như lỗi in.
        pdf.setFillColor(246, 248, 247);
        pdf.rect(0, 0, pdfWidth, pageHeightMm, 'F');

        pdf.addImage(page.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pdfWidth, sliceH / pxPerMm);
        pageNo += 1;
      }

      // Đánh số trang: báo cáo nhiều trang mà không đánh số thì người đọc
      // không biết mình đang thiếu trang nào.
      for (let i = 1; i <= pageNo; i += 1) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(132, 150, 160);
        pdf.text(`Trang ${i} / ${pageNo}`, pdfWidth - 14, pageHeightMm - 7, { align: 'right' });
      }

      pdf.save(filename);

      addToHistory(filename.replace('.pdf', ''), 'PDF', `${(pageNo * 0.5).toFixed(1)} MB`);
      
      setShowToast('PDF');
      setTimeout(() => setShowToast(''), 3000);
    } catch (error) {
      alert("Lỗi khi tạo PDF: " + error.message);
      console.error(error);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const busy = downloadingCsv || generatingPdf;
  const typeLabel = { All: 'Tất cả', PDF: 'PDF', CSV: 'CSV' };

  return (
    <div className="cx relative">
      <PageHeader
        section="Hệ thống"
        title="Báo cáo"
        accent="& xuất dữ liệu"
        subtitle="Mọi tệp xuất ra được tính trên đúng phạm vi bộ lọc bên dưới, và chỉ gồm phản hồi đã qua tầng kiểm soát tin cậy."
        actions={<Button variant="secondary" icon={Eye} onClick={() => window.location.assign('/reports?preview=1')}>Xem trước bản in</Button>}
      />

      <FilterBar
        timeFilter={timeFilter} setTimeFilter={setTimeFilter}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        productFilter={productFilter} setProductFilter={setProductFilter}
        hideExportButton
      />

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {[
          {
            type: 'PDF',
            icon: FileText,
            tile: 'bg-accent-dim text-accent',
            title: 'Báo cáo điều hành',
            ext: 'PDF · A4 · nhiều trang',
            text: 'Điểm nhấn cần quyết, chỉ số so với kỳ trước, diễn biến theo thời gian, Pareto nhóm vấn đề và nguyên nhân gốc rễ. Kế hoạch hành động lấy từ bộ đề xuất theo playbook — không có đoạn văn nào được viết tự do.',
            loading: generatingPdf,
            cta: generatingPdf ? 'Đang dựng PDF…' : 'Tạo báo cáo PDF'
          },
          {
            type: 'CSV',
            icon: FileSpreadsheet,
            tile: 'bg-sky/50 text-[#2F5E92]',
            title: 'Dữ liệu thô',
            ext: 'CSV · UTF-8',
            text: 'Toàn bộ phản hồi trong phạm vi lọc: thời điểm, nguồn, nội dung gốc, cảm xúc, nhóm vấn đề, hạng và trọng số tin cậy. Mở được bằng Excel hoặc công cụ BI.',
            loading: downloadingCsv,
            cta: downloadingCsv ? 'Đang xuất CSV…' : 'Tải tệp CSV'
          }
        ].map((c) => (
          <GlassPanel key={c.type} tone="strong" className="flex flex-col p-6">
            <div className="flex items-start gap-4">
              <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${c.tile}`}>
                <c.icon size={22} aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-[1.05rem] font-semibold text-ink-hi">{c.title}</h3>
                <p className="font-mono text-xs text-ink-lo">{c.ext}</p>
              </div>
            </div>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-ink-mid">{c.text}</p>
            <Button className="mt-5 self-start" icon={Download} loading={c.loading} disabled={busy} onClick={() => openExport(c.type)}>
              {c.cta}
            </Button>
          </GlassPanel>
        ))}
      </div>

      <GlassPanel tone="strong" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div>
            <h3 className="text-[0.98rem] font-semibold text-ink-hi">Lịch sử báo cáo</h3>
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
          <div className="overflow-x-auto">
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
                    <td className="font-mono text-xs text-ink-mid"><span className="inline-flex items-center gap-1.5"><Calendar size={13} />{r.date}</span></td>
                    <td className="font-mono text-xs text-ink-mid">{r.size}</td>
                    <td className="pr-5 text-right">
                      <button type="button" onClick={() => deleteFromHistory(r.id)} aria-label="Xoá khỏi lịch sử" className="grid size-8 place-items-center rounded-full text-ink-lo hover:bg-crit/10 hover:text-crit">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>

      <Modal
        open={Boolean(exportDialog)}
        onClose={() => setExportDialog(null)}
        icon={exportDialog?.type === 'CSV' ? FileSpreadsheet : FileText}
        title={exportDialog?.type === 'CSV' ? 'Xuất dữ liệu thô' : 'Tạo báo cáo điều hành'}
        description="Đặt tên tệp — phần mở rộng được thêm tự động."
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
          onKeyDown={(e) => e.key === 'Enter' && exportDialog?.name?.trim() && runExport()}
          trailing={<span className="pr-2 font-mono text-xs text-ink-lo">.{exportDialog?.type?.toLowerCase()}</span>}
        />
      </Modal>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        icon={Trash2}
        tone="crit"
        size="sm"
        title="Xoá toàn bộ lịch sử báo cáo?"
        description="Chỉ xoá danh sách trên máy này — các tệp đã tải về không bị ảnh hưởng."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>Huỷ</Button>
            <Button variant="danger" onClick={() => { setReportHistory([]); setConfirmClear(false); }}>Xoá lịch sử</Button>
          </>
        }
      />

      <Toast show={Boolean(showToast)}>Đã xuất tệp {showToast} thành công</Toast>

      {/* Hidden PDF Template Container (Rendered off-screen with high-res styling) */}
      <div style={previewMode
        ? { marginTop: '24px', display: 'flex', justifyContent: 'center' }
        : { position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div 
          ref={pdfTemplateRef} 
          style={{
            width: '1000px',
            minHeight: '1414px',
            padding: '60px',
            /* Mau viet thang bang hex chu khong dung bien CSS: tep PDF
               phai in ra giong het nhau bat ke nguoi dung dang o che do
               sang hay toi. */
            background: REPORT.canvas,
            color: REPORT.hi,
            fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Main Content Wrapper */}
          <div style={{ flex: 1 }}>
            {/* Header */}
          <div data-block="header" style={{ borderBottom: `1px solid ${REPORT.border}`, paddingBottom: '18px', marginBottom: '26px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px' }}>
            <div>
              <h1 style={{ fontSize: '26px', fontWeight: 700, color: REPORT.hi, margin: '0 0 6px 0', letterSpacing: '-0.4px', lineHeight: 1.25 }}>Báo cáo phân tích phản hồi khách hàng</h1>
              <p style={{ color: REPORT.lo, fontSize: '12px', margin: 0, textTransform: 'uppercase', letterSpacing: '1.4px', fontWeight: 600 }}>Bản tóm tắt dành cho cấp quản lý</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: REPORT.hi, fontWeight: 600, margin: '0 0 4px 0', fontSize: '13px' }}>
                Lập ngày {new Date().toLocaleDateString('vi-VN')}
              </p>
              <p style={{ color: REPORT.lo, fontSize: '11px', margin: 0, lineHeight: 1.6 }}>
                Kỳ: {timeFilter === 'All' ? 'Toàn thời gian' : timeFilter}<br />
                Nguồn: {sourceFilter === 'All' ? 'Tất cả' : sourceFilter} · Sản phẩm: {productFilter === 'All' ? 'Tất cả' : productFilter}
              </p>
            </div>
          </div>

          {/* Khối nhận định */}
          {/*
            KHỐI NHẬN ĐỊNH.

            Bản trước đặt ở đây một đoạn văn VIẾT CỨNG trong mã nguồn, nội dung
            hoàn toàn bịa: "cảm xúc rất tích cực trong 30 ngày qua", "Chất lượng
            sản phẩm luôn vượt chuẩn ngành". Đoạn đó được xuất ra tệp PDF và
            doanh nghiệp mang đi báo cáo như thể là kết quả phân tích.

            Đây đúng là kiểu sai mà cả hệ thống này sinh ra để ngăn: số liệu bịa
            trình bày như số đo thật. Thay bằng nhận định sinh từ dữ liệu thật;
            không có dữ liệu thì nói rõ là không có.
          */}
          {(() => {
            const takeaways = buildTakeaways(pdfData?.recommendations || []);
            const crit = takeaways.filter((t) => t.severity === 'Critical' || t.severity === 'High').length;

            return (
              <div data-block="takeaways" style={{ marginBottom: '30px' }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  gap: '16px', marginBottom: '14px'
                }}>
                  <h3 style={{ margin: 0, color: REPORT.hi, fontSize: '17px', fontWeight: 700 }}>
                    Điểm nhấn cần quyết
                  </h3>
                  {takeaways.length > 0 && (
                    <span style={{ fontSize: '11px', color: REPORT.lo, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {takeaways.length} việc · {crit} ở mức ưu tiên cao
                    </span>
                  )}
                </div>

                {takeaways.length === 0 ? (
                  <div style={{
                    background: REPORT.okDim, border: `1px solid ${REPORT.ok}`,
                    borderRadius: '8px', padding: '18px 20px',
                    color: REPORT.mid, fontSize: '13px', lineHeight: 1.7
                  }}>
                    <strong style={{ color: REPORT.ok }}>Không có vấn đề nào vượt ngưỡng trong kỳ này.</strong>{' '}
                    Không biến động nào đạt đồng thời ý nghĩa thống kê và ý nghĩa nghiệp vụ.
                    Đây là kết quả bình thường, không phải lỗi thu thập dữ liệu.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {takeaways.map((t, i) => (
                      <div
                        key={t.id || i}
                        style={{
                          background: REPORT.surface,
                          border: `1px solid ${REPORT.border}`,
                          borderLeft: `3px solid ${
                            t.severity === 'Critical' ? REPORT.crit
                              : t.severity === 'High' ? REPORT.high : REPORT.accent
                          }`,
                          borderRadius: '0 8px 8px 0',
                          padding: '14px 18px'
                        }}
                      >
                        {/* Dong 1 — VAN DE */}
                        <div style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: '14px', marginBottom: '7px'
                        }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: REPORT.hi, lineHeight: 1.4 }}>
                            {t.problem}
                            {t.scope && (
                              <span style={{ fontWeight: 400, color: REPORT.mid }}> · {t.scope}</span>
                            )}
                          </span>
                          <SeverityDot level={t.severity} />
                        </div>

                        {/* Dong 2 — MUC DO ANH HUONG THUC TE */}
                        {t.impact.length > 0 && (
                          <div style={{ fontSize: '12.5px', color: REPORT.mid, lineHeight: 1.65, marginBottom: '7px' }}>
                            {t.impact.join(' · ')}
                          </div>
                        )}

                        {/* Dong 3 — HANH DONG DE XUAT */}
                        {t.action && (
                          <div style={{
                            display: 'flex', gap: '8px', alignItems: 'flex-start',
                            fontSize: '12.5px', color: REPORT.hi, lineHeight: 1.6,
                            background: REPORT.accentDim, borderRadius: '6px', padding: '8px 11px'
                          }}>
                            <span style={{ color: REPORT.accentHi, flexShrink: 0, fontWeight: 700 }}>→</span>
                            <span>
                              {t.action}
                              {t.approval && (
                                <span style={{ color: REPORT.high }}> Cần phê duyệt của {t.approval}.</span>
                              )}
                              {t.owner && (
                                <span style={{ color: REPORT.lo }}> Bộ phận xử lý: {t.owner}{t.sla ? ` · SLA ${t.sla}` : ''}.</span>
                              )}
                            </span>
                          </div>
                        )}

                        {/* Dong 4 — BANG CHUNG, chu nho, cho ai can doi chat */}
                        <div style={{
                          marginTop: '8px', fontSize: '10.5px', color: REPORT.lo,
                          fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1.6
                        }}>
                          Bằng chứng: {t.evidence}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Top Metrics Row */}
          {pdfData?.stats?.comparison?.label && (
            <p style={{
              margin: '0 0 10px 0', fontSize: '11px', color: REPORT.lo,
              fontFamily: "'IBM Plex Mono', monospace"
            }}>
              So sánh: {pdfData.stats.comparison.label}
            </p>
          )}
          <div data-block="kpi" style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
            <div style={{ flex: 1, background: REPORT.surface, border: `1px solid ${REPORT.border}`, padding: '18px 20px', borderRadius: '10px' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: REPORT.lo, textTransform: 'uppercase', letterSpacing: '0.9px', fontWeight: 600 }}>Phản hồi hợp lệ</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '30px', fontWeight: 600, color: REPORT.hi, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>
                  {fmtInt(pdfData?.stats?.totalFeedbacks?.valid)}
                </h2>
                <DeltaPill delta={pdfData?.stats?.comparison?.deltas?.valid} />
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: REPORT.lo, lineHeight: 1.5 }}>
                trên {fmtInt(pdfData?.stats?.totalFeedbacks?.value)} phản hồi thô thu thập được
              </p>
            </div>
            <div style={{ flex: 1, background: REPORT.surface, border: `1px solid ${REPORT.border}`, padding: '18px 20px', borderRadius: '10px' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: REPORT.lo, textTransform: 'uppercase', letterSpacing: '0.9px', fontWeight: 600 }}>Tỉ lệ khiếu nại có trọng số</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '30px', fontWeight: 600, color: REPORT.hi, fontFamily: "'IBM Plex Mono', monospace", lineHeight: 1 }}>
                  {pdfData?.stats?.weightedComplaintRate?.available
                    ? pdfData.stats.weightedComplaintRate.display
                    : 'Không khả dụng'}
                </h2>
                <DeltaPill delta={pdfData?.stats?.comparison?.deltas?.wcr} />
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: REPORT.lo, lineHeight: 1.5 }}>
                {pdfData?.stats?.weightedComplaintRate?.available
                  ? `mẫu số ${fmtInt(pdfData.stats.weightedComplaintRate.denominator)} giao dịch đối soát được`
                  : 'chưa kết nối dữ liệu giao dịch nên không tồn tại mẫu số'}
              </p>
            </div>
            {/*
              Cột thứ ba trước đây là "Avg Resolution", đọc từ
              stats.avgResolutionTime — một trường KHÔNG CÒN TỒN TẠI trong API,
              nên PDF luôn in ra "0 hrs" như thể đã đo được thời gian xử lý.
              Hệ thống không hề đo chỉ số đó. Thay bằng Sức khỏe Dữ liệu, thứ
              thực sự tính được.
            */}
            <div style={{ flex: 1, background: REPORT.surface, border: `1px solid ${REPORT.border}`, padding: '18px 20px', borderRadius: '10px' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: REPORT.lo, textTransform: 'uppercase', letterSpacing: '0.9px', fontWeight: 600 }}>Sức khỏe dữ liệu</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{
                  margin: 0, fontSize: '30px', fontWeight: 600, lineHeight: 1,
                  fontFamily: "'IBM Plex Mono', monospace",
                  color: (pdfData?.stats?.dataHealthScore ?? 0) >= 75 ? REPORT.ok
                    : (pdfData?.stats?.dataHealthScore ?? 0) >= 50 ? REPORT.high : REPORT.crit
                }}>
                  {pdfData?.stats?.dataHealthScore ?? '—'}<span style={{ fontSize: '15px', color: REPORT.lo }}>/100</span>
                </h2>
                {/* Chi so nay tinh tren TOAN BO kho du lieu chu khong theo cua
                    so thoi gian, nen khong ton tai ky truoc de so. Noi ro thay
                    vi bia ra mot mui ten. */}
                <span style={{ fontSize: '10px', color: REPORT.lo, fontFamily: "'IBM Plex Mono', monospace" }}>
                  tính trên toàn kho
                </span>
              </div>
              <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: REPORT.lo, lineHeight: 1.5 }}>
                đã loại {fmtInt(pdfData?.stats?.totalFeedbacks?.excluded)} phản hồi không đạt ngưỡng tin cậy
              </p>
            </div>
          </div>

          {/* Charts Row */}
          {(() => {
            const peak = findPeak(pdfData?.trend);
            const pareto = buildPareto(pdfData?.categories || []);
            const topCause = (pdfData?.recommendations || [])[0];
            // Nhan phai NGAN. Ten san pham da nam o phan Diem nhan phia
            // tren, nhac lai o day chi lam nhan tran ra khoi khung bieu do.
            const peakLabel =
              topCause?.alert?.causeLabel || topCause?.alert?.categoryLabel || 'Đỉnh khiếu nại';

            const panel = {
              background: REPORT.surface,
              border: `1px solid ${REPORT.border}`,
              padding: '22px 24px',
              borderRadius: '10px'
            };
            const h3 = { margin: '0 0 3px 0', fontSize: '15px', fontWeight: 700, color: REPORT.hi };
            const sub = { color: REPORT.lo, fontSize: '11.5px', margin: '0 0 18px 0', lineHeight: 1.5 };
            const tick = { fill: REPORT.lo, fontSize: 10 };

            return (
              <>
                <div data-block="charts" style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                  {/* ---------- DIEN BIEN THEO THOI GIAN ---------- */}
                  <div style={{ ...panel, flex: 1.45 }}>
                    <h3 style={h3}>Diễn biến theo thời gian</h3>
                    <p style={sub}>
                      Phản hồi tiêu cực so với phản hồi tích cực
                      {peak ? ' · điểm neo đánh dấu ngày có đỉnh khiếu nại' : ''}
                    </p>
                    <div style={{ height: '330px' }}>
                      {pdfData?.trend && (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={pdfData.trend} margin={{ top: 34, right: 14, left: -14, bottom: 0 }}>
                            <defs>
                              <linearGradient id="cPdf" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={REPORT.crit} stopOpacity={0.22} />
                                <stop offset="100%" stopColor={REPORT.crit} stopOpacity={0} />
                              </linearGradient>
                              <linearGradient id="sPdf" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={REPORT.accent} stopOpacity={0.18} />
                                <stop offset="100%" stopColor={REPORT.accent} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="2 4" stroke={REPORT.raised} vertical={false} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={tick} dy={6} />
                            <YAxis axisLine={false} tickLine={false} tick={tick} width={40} />
                            <Tooltip
                              contentStyle={{ backgroundColor: REPORT.raised, border: `1px solid ${REPORT.border}`, borderRadius: '6px', fontSize: '12px' }}
                              itemStyle={{ color: REPORT.hi }}
                            />
                            {/* Chu giai xuong duoi: nhan chu thich dinh nam o
                                le tren, hai thu de nhau neu cung o do. */}
                            <Legend verticalAlign="bottom" height={24} wrapperStyle={{ fontSize: '11px', color: REPORT.mid }} />
                            <Area name="Khiếu nại" type="monotone" dataKey="complaints" stroke={REPORT.crit} strokeWidth={2} fillOpacity={1} fill="url(#cPdf)" isAnimationActive={false} />
                            <Area name="Hài lòng" type="monotone" dataKey="satisfaction" stroke={REPORT.accent} strokeWidth={2} fillOpacity={1} fill="url(#sPdf)" isAnimationActive={false} />

                            {/* CHU THICH NEO TRUC TIEP TREN DINH.
                                Mot cai dinh khong duoc giai thich thi nguoi doc
                                phai tu doan, va thuong doan sai. Nhan lay tu
                                canh bao xep hang cao nhat cua chinh ky nay. */}
                            {peak && (
                              <ReferenceDot
                                x={peak.name}
                                y={peak.value}
                                r={4}
                                fill={REPORT.crit}
                                stroke={REPORT.canvas}
                                strokeWidth={2}
                                isFront
                                label={{
                                  value: `${peak.name} · ${peakLabel}`,
                                  position: 'top',
                                  fill: REPORT.crit,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  offset: 12
                                }}
                              />
                            )}
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* ---------- PARETO ---------- */}
                  <div style={{ ...panel, flex: 1 }}>
                    <h3 style={h3}>Ưu tiên theo nhóm vấn đề</h3>
                    <p style={sub}>
                      {pareto.data.length > 0
                        ? `Xử lý ${pareto.vitalFew} nhóm đầu là giải quyết khoảng 80% khối lượng khiếu nại đã phân loại`
                        : 'Chưa có dữ liệu phân nhóm'}
                    </p>
                    {/* Kích thước nhóm chưa phân loại là một phát hiện riêng:
                        nó đo xem taxonomy đang bỏ sót bao nhiêu. Không đưa vào
                        bảng xếp hạng, nhưng cũng không giấu đi. */}
                    {pareto.unclassified && pareto.unclassified.share >= 10 && (
                      <p style={{
                        margin: '-12px 0 16px 0', fontSize: '11px', lineHeight: 1.55,
                        color: REPORT.high
                      }}>
                        Lưu ý: {fmtInt(pareto.unclassified.value)} phản hồi
                        ({String(pareto.unclassified.share).replace('.', ',')}%) chưa được phân loại vào
                        nhóm nào nên không nằm trong bảng xếp hạng này. Mở rộng từ khoá taxonomy
                        sẽ làm rõ thêm phần này.
                      </p>
                    )}
                    <div style={{ height: '330px' }}>
                      {pareto.data.length > 0 && (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={pareto.data} margin={{ top: 10, right: 8, left: 2, bottom: 34 }}>
                            <CartesianGrid strokeDasharray="2 4" stroke={REPORT.raised} vertical={false} />
                            <XAxis
                              dataKey="short" axisLine={false} tickLine={false}
                              tick={{ ...tick, fontSize: 9 }} interval={0} angle={-32} textAnchor="end" height={46}
                            />
                            {/* width=42 lam cat mat chu so hang nghin, hien ra
                                thanh '00'. Con so bi cat con te hon khong co. */}
                            <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={tick} width={54} />
                            <YAxis
                              yAxisId="right" orientation="right" domain={[0, 100]}
                              axisLine={false} tickLine={false} tick={tick} width={40}
                              tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip
                              contentStyle={{ backgroundColor: REPORT.raised, border: `1px solid ${REPORT.border}`, borderRadius: '6px', fontSize: '12px' }}
                              itemStyle={{ color: REPORT.hi }}
                              formatter={(v, n) => (n === 'Luỹ kế' ? [`${v}%`, n] : [fmtInt(v), n])}
                            />
                            {/* Moc 80%: ranh gioi uu tien. Nhom nam ben trai cho
                                duong luy ke cat moc nay la nhom dang don nguon luc. */}
                            <ReferenceLine
                              yAxisId="right" y={80} stroke={REPORT.high} strokeDasharray="4 4"
                              label={{ value: '80%', position: 'right', fill: REPORT.high, fontSize: 10 }}
                            />
                            <Bar yAxisId="left" name="Số phản hồi" dataKey="value" fill={REPORT.accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                            <Line
                              yAxisId="right" name="Luỹ kế" type="monotone" dataKey="cumulative"
                              stroke={REPORT.high} strokeWidth={2}
                              dot={{ r: 2.5, fill: REPORT.high, strokeWidth: 0 }} isAnimationActive={false}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>

                {/* ---------- NGUYEN NHAN GOC RE ---------- */}
                {/* Bieu do phan nhom dung o muc DANH MUC. Cap quan ly con phai
                    biet ben trong moi danh muc thi nguyen nhan nao dang gay ra
                    phan lon khieu nai, vi hai nguyen nhan trong cung mot danh
                    muc co the thuoc hai bo phan khac nhau. */}
                {pdfData?.rootCauses?.length > 0 && (
                  <div data-block="rootcause" style={{ ...panel }}>
                    <h3 style={h3}>Nguyên nhân gốc rễ</h3>
                    <p style={sub}>
                      Bóc tách từ nội dung {fmtInt(pdfData.rootTotal)} phản hồi hợp lệ, xếp theo số lượng
                    </p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          {['Nguyên nhân', 'Danh mục', 'Số phản hồi', 'Tỉ trọng'].map((h, k) => (
                            <th key={h} style={{
                              textAlign: k >= 2 ? 'right' : 'left',
                              padding: '0 10px 8px 0',
                              fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em',
                              textTransform: 'uppercase', color: REPORT.lo,
                              borderBottom: `1px solid ${REPORT.border}`
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pdfData.rootCauses.slice(0, 8).map((c, k) => (
                          <tr key={k}>
                            <td style={{ padding: '9px 10px 9px 0', color: REPORT.hi, fontWeight: 600, borderBottom: `1px solid ${REPORT.raised}` }}>
                              {c.causeLabel || c.cause}
                            </td>
                            <td style={{ padding: '9px 10px 9px 0', color: REPORT.mid, borderBottom: `1px solid ${REPORT.raised}` }}>
                              {c.categoryLabel}
                            </td>
                            <td style={{ padding: '9px 10px 9px 0', textAlign: 'right', color: REPORT.hi, fontFamily: "'IBM Plex Mono', monospace", borderBottom: `1px solid ${REPORT.raised}` }}>
                              {fmtInt(c.count)}
                            </td>
                            <td style={{ padding: '9px 0', textAlign: 'right', borderBottom: `1px solid ${REPORT.raised}` }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', justifyContent: 'flex-end' }}>
                                <span style={{ width: 46, height: 5, background: REPORT.raised, borderRadius: 3, overflow: 'hidden', display: 'inline-block' }}>
                                  <span style={{ display: 'block', height: '100%', width: `${Math.min(c.share, 100)}%`, background: REPORT.accent }} />
                                </span>
                                <span style={{ color: REPORT.mid, fontFamily: "'IBM Plex Mono', monospace", minWidth: 38, display: 'inline-block' }}>
                                  {String(c.share).replace('.', ',')}%
                                </span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}
          </div> {/* End Main Content */}
          
          {/* Footer at the absolute bottom */}
          <div style={{ marginTop: '36px', paddingTop: '22px', borderTop: `1px solid ${REPORT.border}`, textAlign: 'center', color: REPORT.lo, fontSize: '10.5px', lineHeight: 1.7 }}>
            Lập tự động bởi nền tảng CustomerRadar · Mọi chỉ số được tính trên phản hồi đã qua tầng kiểm soát tin cậy dữ liệu · Tài liệu nội bộ
          </div>
        </div>
      </div>

    </div>
  );
};

export default Reports;
