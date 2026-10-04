import React, { useState } from 'react';
import { Activity, CircleSlash } from 'lucide-react';
import { Modal, Button, TextArea, Chip } from '../ui';
import { fmtInt, fmtPct, fmtSignedPct, growthOf, alertTitle } from '../../lib/format';

/** Dải bằng chứng thống kê — chữ đơn cách, đọc như một dòng log đo lường */
export const Evidence = ({ alert, className = '' }) => {
  const st = alert.statistics || {};
  if (alert.type === 'SUSTAINED_DRIFT') {
    return (
      <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.7rem] text-ink-lo ${className}`}>
        <span className="inline-flex items-center gap-1 text-ink-mid">
          <Activity size={11} aria-hidden="true" /> EWMA {st.ewmaCurrent}
        </span>
        <span>giới hạn {st.controlLimit}</span>
        {st.consecutiveBreaches != null && <span>{st.consecutiveBreaches} chu kỳ liên tiếp</span>}
      </p>
    );
  }
  const g = growthOf(alert);
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.7rem] text-ink-lo ${className}`}>
      <span className="font-semibold text-ink-hi">{g == null ? alert.typeVi : Number.isFinite(g) ? fmtSignedPct(g) : 'mới'}</span>
      <span>{fmtPct(st.baselineRate)} → {fmtPct(st.currentRate)}</span>
      {st.z != null && <span>z={st.z}</span>}
      {st.pValueDisplay && <span>{st.pValueDisplay.replace(/\s/g, '')}</span>}
      {st.sampleCurrent != null && <span>n={fmtInt(st.sampleCurrent)}</span>}
    </p>
  );
};

/** Đồng hồ độ tin cậy của khuyến nghị */
export const ConfidenceMeter = ({ value, className = '' }) => {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  return (
    <div className={`flex items-center gap-2 text-[0.7rem] text-ink-lo ${className}`}>
      <span className="shrink-0">Độ tin cậy</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-ink-mid">{pct}%</span>
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

  const reason = [preset, note.trim()].filter(Boolean).join(' — ');

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
      description={alert ? `${alertTitle(alert)} — cần nêu lý do để hệ thống học và điều chỉnh các đề xuất sau.` : undefined}
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
