import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Activity, CircleSlash } from 'lucide-react';
import { Modal, Button, TextArea, Chip } from '../ui';
import { MOTION, EASE, useReducedMotion } from '../motion';
import { fmtInt, fmtPct, fmtGrowth, growthOf, alertTitle } from '../../lib/format';

/** Số kiểu Việt trong chuỗi z, p, n: dấu thập phân là dấu phẩy */
const vi = (v) => String(v).replace('.', ',');

/** Dải bằng chứng thống kê: chữ nhãn ở chữ chính, chỉ con số và chuỗi z, p, n dùng font đơn cách (font-code) */
export const Evidence = ({ alert, className = '' }) => {
  const st = alert.statistics || {};
  if (alert.type === 'SUSTAINED_DRIFT') {
    return (
      <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-lo ${className}`}>
        <span className="inline-flex items-center gap-1 text-ink-mid">
          <Activity size={14} aria-hidden="true" /> EWMA <span className="font-code">{vi(st.ewmaCurrent)}{st.unit || ''}</span>
        </span>
        <span>giới hạn <span className="font-code">{vi(st.controlLimit)}{st.unit || ''}</span></span>
        {st.consecutiveBreaches != null && <span><span className="tabular-nums">{st.consecutiveBreaches}</span> chu kỳ liên tiếp</span>}
      </p>
    );
  }
  const g = growthOf(alert);
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-lo ${className}`}>
      <span className="font-semibold text-ink-hi">{g == null ? alert.typeVi : Number.isFinite(g) ? fmtGrowth(g) : 'mới'}</span>
      <span className="tabular-nums">từ {fmtPct(st.baselineRate)} sang {fmtPct(st.currentRate)}</span>
      {st.z != null && <span className="font-code">z={vi(st.z)}</span>}
      {st.pValueDisplay && <span className="font-code">{vi(st.pValueDisplay.replace(/\s/g, ''))}</span>}
      {st.sampleCurrent != null && <span className="font-code">n={fmtInt(st.sampleCurrent)}</span>}
    </p>
  );
};

/** Đồng hồ độ tin cậy của khuyến nghị */
export const ConfidenceMeter = ({ value, className = '' }) => {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  return (
    <div className={`flex items-center gap-2 text-xs text-ink-lo ${className}`}>
      <span className="shrink-0">Độ tin cậy</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 shrink-0 text-right tabular-nums text-ink-mid">{pct}%</span>
    </div>
  );
};

const REASONS = [
  'Đã xử lý qua kênh khác',
  'Chưa đủ nguồn lực lúc này',
  'Không đồng ý với chẩn đoán',
  'Biến động mang tính mùa vụ'
];

/**
 * Hộp thoại bỏ qua khuyến nghị. Máy chủ BẮT BUỘC có lý do — lý do bỏ qua
 * chính là dữ liệu để cải thiện thư viện playbook — nên nút xác nhận chỉ
 * sáng khi đã có lý do.
 */
export const DismissModal = ({ alert, open, onClose, onConfirm }) => {
  const [preset, setPreset] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const reason = [preset, note.trim()].filter(Boolean).join('. ');

  const close = () => {
    setPreset(null);
    setNote('');
    onClose();
  };

  const submit = async () => {
    setSaving(true);
    const ok = await onConfirm(reason);
    setSaving(false);
    if (ok) close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      icon={CircleSlash}
      tone="crit"
      title="Bỏ qua khuyến nghị này?"
      description={alert ? `${alertTitle(alert)}. Bạn cần nêu lý do để hệ thống học và điều chỉnh các đề xuất sau.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Huỷ</Button>
          <Button variant="danger" onClick={submit} disabled={!reason} loading={saving}>Xác nhận bỏ qua</Button>
        </>
      }
    >
      <p className="eyebrow mb-2">Lý do thường gặp</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <Chip key={r} active={preset === r} onClick={() => setPreset(preset === r ? null : r)}>{r}</Chip>
        ))}
      </div>
      <TextArea
        label="Ghi chú thêm"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={240}
        placeholder="Ví dụ: đã đổi đơn vị vận chuyển từ tuần trước…"
      />
    </Modal>
  );
};

/**
 * Mở và gập một khối bằng clip-path + opacity (không đổi height).
 * Lần gắn đầu hiện luôn, không chạy chuyển động: chỉ thao tác của người dùng
 * (đổi `open`) mới có. Gập xong thì gỡ khối khỏi trang để vùng bên dưới dồn lên.
 */
export const Fold = ({ open, children, className = '' }) => {
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const first = useRef(true);
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const el = ref.current;
    if (reduced || !el || typeof el.animate !== 'function') {
      if (!open) setMounted(false);
      return undefined;
    }
    const hidden = { opacity: 0, clipPath: 'inset(0 0 100% 0)' };
    const shown = { opacity: 1, clipPath: 'inset(0 0 0% 0)' };
    const a = el.animate(open ? [hidden, shown] : [shown, hidden], {
      duration: open ? MOTION.medium : MOTION.short,
      easing: open ? EASE.out : EASE.in
    });
    if (!open) a.onfinish = () => setMounted(false);
    return () => a.cancel();
  }, [open, mounted, reduced]);

  if (!mounted) return null;
  return <div ref={ref} className={className}>{children}</div>;
};
