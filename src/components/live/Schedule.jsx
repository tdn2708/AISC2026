import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarPlus, Radio, Pencil, CircleSlash, Trash2 } from 'lucide-react';
import {
  GlassPanel,
  PanelHeader,
  Button,
  Select,
  TextField,
  TextArea,
  Modal,
  Badge,
  EmptyState,
  Toast,
  Skeleton
} from '../ui';
import { getWorkspace } from '../../lib/workspace';
import {
  getSchedules,
  createSchedule,
  updateSchedule,
  cancelSchedule,
  deleteSchedule
} from '../../lib/liveSchedule';

const DURATION_OPTIONS = [
  { value: '30', label: '30 phút' },
  { value: '60', label: '1 giờ' },
  { value: '90', label: '1 giờ 30 phút' },
  { value: '120', label: '2 giờ' },
  { value: '180', label: '3 giờ' },
  { value: '240', label: '4 giờ' }
];

const REMIND_OPTIONS = [
  { value: '0', label: 'Không nhắc' },
  { value: '10', label: '10 phút' },
  { value: '15', label: '15 phút' },
  { value: '30', label: '30 phút' },
  { value: '60', label: '1 giờ' },
  { value: '120', label: '2 giờ' }
];

const WEEKDAYS_VI = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

function ymdKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayGroupLabel(date, now = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const todayKey = ymdKey(now);
  const tomorrow = new Date(now.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = ymdKey(tomorrow);
  const key = ymdKey(d);
  if (key === todayKey) return 'Hôm nay';
  if (key === tomorrowKey) return 'Ngày mai';
  const wd = WEEKDAYS_VI[d.getDay()] || '';
  const dm = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  return `${wd}, ${dm}`;
}

function formatHm(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function remindLabel(min) {
  const m = Number(min) || 0;
  if (m <= 0) return 'Không nhắc';
  if (m === 60) return 'Nhắc trước 1 giờ';
  if (m === 120) return 'Nhắc trước 2 giờ';
  return `Nhắc trước ${m} phút`;
}

function durationLabel(min) {
  const m = Number(min) || 120;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h} giờ ${r} phút`;
  if (h > 0) return `${h} giờ`;
  return `${m} phút`;
}

function toDatetimeLocalValue(ts) {
  const d = ts ? new Date(ts) : new Date(Date.now() + 60 * 60 * 1000);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

function statusBadgeOf(status) {
  if (status === 'done') return { label: 'Đã mở phiên', tone: 'ok' };
  if (status === 'cancelled') return { label: 'Đã hủy', tone: 'neutral' };
  return { label: 'Đã hẹn', tone: 'accent' };
}

/**
 * PHẦN LỊCH LIVESTREAM TRÊN TRANG /live (Schedule)
 * ==================================================================
 * Nhóm theo ngày, hỗ trợ thêm/sửa/hủy/xóa phiên hẹn và mở nhanh StartSession.
 */
const Schedule = ({ onStartFromSchedule, onOpenSession, refreshSignal = 0 }) => {
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [platforms, setPlatforms] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState(() => (getWorkspace() === 'demo' ? 'simulator' : 'tiktok'));
  const [target, setTarget] = useState('');
  const [startAtLocal, setStartAtLocal] = useState(() => toDatetimeLocalValue());
  const [durationMin, setDurationMin] = useState('120');
  const [remindBeforeMin, setRemindBeforeMin] = useState('30');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState({ show: false, tone: 'ok', text: '' });

  const showToast = useCallback((text, tone = 'ok') => {
    setToast({ show: true, tone, text });
  }, []);

  useEffect(() => {
    if (!toast.show) return undefined;
    const t = setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    try {
      const list = await getSchedules();
      setItems(list);
      setLoadError(null);
    } catch (e) {
      setLoadError(e.response?.data?.error || 'Không tải được lịch live.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  useEffect(() => {
    axios
      .get('/live/platforms')
      .then((r) => {
        const list = (r.data?.platforms || []).filter(
          (p) => !(p.key === 'simulator' && getWorkspace() !== 'demo')
        );
        setPlatforms(list);
      })
      .catch(() => {});
  }, []);

  const openAddModal = () => {
    const defaultStart = new Date(Date.now() + 60 * 60 * 1000);
    defaultStart.setSeconds(0, 0);
    setEditingItem(null);
    setTitle('');
    setPlatform(getWorkspace() === 'demo' ? 'tiktok' : 'tiktok');
    setTarget('');
    setStartAtLocal(toDatetimeLocalValue(defaultStart));
    setDurationMin('120');
    setRemindBeforeMin('30');
    setNote('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (it) => {
    setEditingItem(it);
    setTitle(it.title || '');
    setPlatform(it.platform || 'tiktok');
    setTarget(it.target || '');
    setStartAtLocal(toDatetimeLocalValue(it.startAt));
    setDurationMin(String(it.durationMin || 120));
    setRemindBeforeMin(String(it.remindBeforeMin ?? 30));
    setNote(it.note || '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setFormError(null);
    const parsedDate = new Date(startAtLocal);
    if (!startAtLocal || Number.isNaN(parsedDate.getTime())) {
      setFormError('Chọn ngày giờ bắt đầu hợp lệ.');
      return;
    }

    const payload = {
      title: title.trim(),
      platform,
      target: target.trim(),
      startAt: parsedDate.toISOString(),
      durationMin: Number(durationMin),
      remindBeforeMin: Number(remindBeforeMin),
      note: note.trim()
    };

    setSaving(true);
    try {
      if (editingItem) {
        await updateSchedule(editingItem.id, payload);
      } else {
        await createSchedule(payload);
      }
      setModalOpen(false);
      showToast('Đã lưu lịch');
      await load();
    } catch (e) {
      setFormError(e.response?.data?.error || 'Không lưu được lịch live.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelSchedule(cancelTarget.id);
      setCancelTarget(null);
      showToast('Đã hủy phiên hẹn');
      await load();
    } catch (e) {
      showToast(e.response?.data?.error || 'Không hủy được lịch', 'crit');
    } finally {
      setCancelling(false);
    }
  };

  const handleDelete = async (it) => {
    try {
      await deleteSchedule(it.id);
      showToast('Đã xóa lịch');
      await load();
    } catch (e) {
      showToast(e.response?.data?.error || 'Không xóa được lịch', 'crit');
    }
  };

  const platformOptions =
    platforms.length > 0
      ? platforms.map((p) => ({ value: p.key, label: p.label }))
      : [
          { value: 'tiktok', label: 'TikTok Live' },
          { value: 'youtube', label: 'YouTube Live' },
          { value: 'manual', label: 'Nhập tay hoặc webhook' },
          ...(getWorkspace() === 'demo' ? [{ value: 'simulator', label: 'Mô phỏng megalive' }] : [])
        ];

  const needsTarget = platform === 'tiktok' || platform === 'youtube';

  // Nhóm các lịch theo ngày
  const groups = [];
  if (Array.isArray(items) && items.length > 0) {
    const now = new Date();
    const byKey = new Map();
    for (const it of items) {
      const k = ymdKey(it.startAt);
      let g = byKey.get(k);
      if (!g) {
        g = { key: k, label: dayGroupLabel(it.startAt, now), items: [] };
        byKey.set(k, g);
        groups.push(g);
      }
      g.items.push(it);
    }
  }

  return (
    <GlassPanel tone="strong" className="mt-4 p-4 sm:p-5">
      <PanelHeader
        title="Lịch live"
        right={
          <Button
            variant="secondary"
            size="sm"
            icon={CalendarPlus}
            className="pointer-coarse:min-h-11"
            onClick={openAddModal}
          >
            Thêm lịch
          </Button>
        }
      />

      {loadError ? (
        <EmptyState variant="error" compact title={loadError} />
      ) : items === null ? (
        <Skeleton as="div" className="h-24 rounded-ctrl bg-raised" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có phiên nào được hẹn"
          description="Thêm lịch để quản gia nhắc qua Zalo trước giờ live."
          action={
            <Button icon={CalendarPlus} className="pointer-coarse:min-h-11" onClick={openAddModal}>
              Thêm lịch
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.key}>
              <h3 className="mb-2 text-xs font-semibold text-ink-mid">{g.label}</h3>
              <ul className="flex list-none flex-col divide-y divide-line-soft">
                {g.items.map((it) => {
                  const badge = statusBadgeOf(it.status);
                  const showTarget =
                    it.target && it.platform !== 'simulator' && it.platform !== 'manual';
                  return (
                    <li
                      key={it.id}
                      className="flex flex-col gap-3 py-3.5 first:pt-1 last:pb-1 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold tabular-nums text-ink-hi">
                            {formatHm(it.startAt)}
                          </span>
                          <span className="text-sm font-semibold text-ink-hi">{it.title}</span>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-ink-mid">
                          {it.platformLabel}
                          {showTarget ? ` (${it.target})` : ''}, dự kiến {durationLabel(it.durationMin)},{' '}
                          {remindLabel(it.remindBeforeMin).toLowerCase()}.
                        </p>
                        {it.note && (
                          <p className="mt-0.5 text-xs text-ink-lo">{it.note}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {it.status === 'scheduled' && (
                          <>
                            <Button
                              variant="primary"
                              size="sm"
                              icon={Radio}
                              className="pointer-coarse:min-h-11"
                              onClick={() =>
                                onStartFromSchedule?.({
                                  platform: it.platform,
                                  target: it.target || '',
                                  title: it.title || ''
                                })
                              }
                            >
                              Bắt đầu phiên
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={Pencil}
                              className="pointer-coarse:min-h-11"
                              onClick={() => openEditModal(it)}
                            >
                              Sửa
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={CircleSlash}
                              className="pointer-coarse:min-h-11"
                              onClick={() => setCancelTarget(it)}
                            >
                              Hủy
                            </Button>
                          </>
                        )}

                        {it.status === 'done' && it.sessionId && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="pointer-coarse:min-h-11"
                            onClick={() => onOpenSession?.(it.sessionId)}
                          >
                            Xem phiên
                          </Button>
                        )}

                        {it.status === 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            className="pointer-coarse:min-h-11"
                            onClick={() => handleDelete(it)}
                          >
                            Xóa
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Hộp thoại Thêm / Sửa lịch */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingItem ? 'Sửa lịch live' : 'Thêm lịch live'}
        description="Quản gia sẽ nhắn nhắc qua Zalo trước giờ bắt đầu và báo nếu quá giờ 10 phút chưa mở phiên."
        footer={
          <>
            <Button
              variant="ghost"
              className="pointer-coarse:min-h-11"
              onClick={() => setModalOpen(false)}
            >
              Đóng
            </Button>
            <Button
              variant="primary"
              className="pointer-coarse:min-h-11"
              loading={saving}
              onClick={handleSave}
            >
              Lưu lịch
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <TextField
            label="Tên phiên hẹn"
            placeholder="Ví dụ: Sale cuối tháng"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <Select
            label="Nền tảng"
            options={platformOptions}
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          />

          {needsTarget && (
            <TextField
              label={
                platform === 'tiktok'
                  ? 'Tài khoản TikTok sẽ live'
                  : 'Liên kết video YouTube sẽ live'
              }
              placeholder={
                platform === 'tiktok'
                  ? '@tenshop hoặc tiktok.com/@tenshop/live'
                  : 'https://www.youtube.com/watch?v=…'
              }
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          )}

          <TextField
            type="datetime-local"
            label="Ngày giờ bắt đầu"
            value={startAtLocal}
            onChange={(e) => setStartAtLocal(e.target.value)}
          />

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Select
              label="Thời lượng dự kiến"
              options={DURATION_OPTIONS}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
            />
            <Select
              label="Nhắc trước"
              options={REMIND_OPTIONS}
              value={remindBeforeMin}
              onChange={(e) => setRemindBeforeMin(e.target.value)}
            />
          </div>

          <TextArea
            label="Ghi chú"
            rows={2}
            maxLength={500}
            placeholder="Chuẩn bị mã giảm giá, người trực bình luận..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {formError && (
            <p role="alert" className="rounded-ctrl bg-crit/12 px-3 py-2 text-xs text-crit">
              {formError}
            </p>
          )}
        </div>
      </Modal>

      {/* Hộp thoại xác nhận Hủy lịch */}
      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        tone="crit"
        size="sm"
        title="Hủy phiên hẹn này?"
        description={cancelTarget?.title || ''}
        footer={
          <>
            <Button
              variant="secondary"
              className="pointer-coarse:min-h-11"
              onClick={() => setCancelTarget(null)}
            >
              Giữ lại
            </Button>
            <Button
              variant="danger"
              className="pointer-coarse:min-h-11"
              loading={cancelling}
              onClick={handleConfirmCancel}
            >
              Hủy lịch
            </Button>
          </>
        }
      />

      <Toast show={toast.show} tone={toast.tone}>
        {toast.text}
      </Toast>
    </GlassPanel>
  );
};

export default Schedule;
