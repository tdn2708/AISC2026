import React from 'react';
import { Cpu, Download, TriangleAlert } from 'lucide-react';
import { useBrowserModelStatus } from '../../lib/analyze';

const mb = (b) => (b / 1e6).toFixed(0);

/**
 * Trạng thái mô hình chạy trên trình duyệt. Lần đầu tải ~98 MB nên phải cho
 * người xem thấy tiến độ — một nút bấm im lặng 10 giây trông như bị treo.
 */
const ModelStatus = ({ className = '' }) => {
  const s = useBrowserModelStatus();
  if (s.phase === 'idle') return null;

  if (s.phase === 'error') {
    return (
      <p className={`cx flex items-start gap-2 rounded-lg border border-high/30 bg-high/8 px-3.5 py-2.5 text-[0.8rem] text-ink-mid ${className}`}>
        <TriangleAlert size={15} className="mt-0.5 shrink-0 text-high" />
        Không tải được mô hình về trình duyệt ({s.error}). Hệ thống dùng lớp luật dự phòng.
      </p>
    );
  }

  if (s.phase === 'ready') {
    return (
      <p className={`cx flex items-start gap-2 rounded-lg border border-accent/30 bg-accent-dim px-3.5 py-2.5 text-[0.8rem] text-ink-mid ${className}`}>
        <Cpu size={15} className="mt-0.5 shrink-0 text-accent" />
        <span>
          <b className="font-semibold text-ink-hi">ViSoBERT đang chạy ngay trên trình duyệt của bạn.</b>{' '}
          Mô hình nằm trên máy này — câu phản hồi không gửi tới máy chủ mô hình nào.
        </span>
      </p>
    );
  }

  const pct = s.phase === 'model' && s.total ? Math.min(100, (s.loaded / s.total) * 100) : s.phase === 'init' ? 100 : 3;
  return (
    <div className={`cx rounded-lg border border-line bg-surface px-3.5 py-3 ${className}`} role="status" aria-live="polite">
      <p className="mb-2 flex items-center gap-2 text-[0.8rem] text-ink-mid">
        <Download size={15} className="shrink-0 text-accent" />
        {s.phase === 'init'
          ? 'Đang khởi động mô hình…'
          : s.phase === 'model' && s.total
            ? <>Đang tải mô hình ViSoBERT về máy bạn: <b className="data-num text-ink-hi">{mb(s.loaded)} / {mb(s.total)} MB</b> · chỉ lần đầu</>
            : 'Đang chuẩn bị mô hình ViSoBERT…'}
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default ModelStatus;
