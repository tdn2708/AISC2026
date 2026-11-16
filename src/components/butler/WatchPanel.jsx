import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert } from 'lucide-react';
import { GlassPanel, Button, Select, Switch, Modal, SELECTED } from '../ui';
import { fmtRelative } from '../../lib/format';

const OptionBar = ({ label, options, value, onChange }) => (
  <div
    role="group"
    aria-label={label}
    className={`grid gap-1 rounded-ctrl border border-line bg-surface p-0.5 ${options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
  >
    {options.map((o) => {
      const active = o.value === value;
      return (
        <button
          key={o.value}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(o.value)}
          disabled={o.disabled}
          className={`inline-flex h-8 pointer-coarse:h-10 min-w-0 items-center justify-center rounded-[calc(var(--r-ctrl)-2px)] border px-2 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-micro ease-out disabled:cursor-not-allowed disabled:opacity-55 ${
            active
              ? SELECTED
              : 'border-transparent text-ink-mid hover:bg-raised hover:text-ink-hi'
          }`}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${h} giờ`
}));

const NOTIFY_OPTIONS = [
  { value: 'critical', label: 'Nghiêm trọng' },
  { value: 'high', label: 'Từ mức cao' },
  { value: 'all', label: 'Mọi việc' }
];

const WORKSPACE_OPTIONS = [
  { value: 'real', label: 'Dữ liệu thật' },
  { value: 'demo', label: 'Mô phỏng' }
];

function formatShortDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function formatHmDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const hm = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const dm = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  return `${hm} ${dm}`;
}

function formatHm(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function statusTextOf(item) {
  if (item.status === 'sent') return { label: 'Đã gửi', error: false };
  if (item.status === 'queued' || item.status === 'sending') return { label: 'Đang chờ gửi', error: false };
  if (item.status === 'failed') return { label: 'Không gửi được', error: true };
  if (item.lastError && item.lastError.includes('cấu hình')) {
    return { label: 'Chỉ lưu, chưa cấu hình bot', error: false };
  }
  return { label: 'Chỉ lưu, chưa nối Zalo', error: false };
}

/**
 * CỘT TRẠNG THÁI VÀ CÀI ĐẶT CANH GÁC (WatchPanel)
 * ==================================================================
 * Đặt ở cột phải trên máy tính và bên trong Drawer trên điện thoại.
 * Mọi thay đổi lưu ngay lên máy chủ và phản hồi qua Toast.
 */
const WatchPanel = ({
  status,
  outboxItems = [],
  onOpenConnect,
  onSaveSettings,
  onSendTest,
  onUnlink,
  inDrawer = false
}) => {
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [testing, setTesting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const zaloCfg = status?.zalo || {};
  const link = status?.link || {};
  const settings = status?.settings || {
    workspace: 'real',
    notifyLevel: 'high',
    quietFrom: 22,
    quietTo: 7,
    digest: true,
    digestHour: 8,
    muteUntil: null
  };
  const watcher = status?.watcher || {};

  const isMuted = Boolean(
    settings.muteUntil && new Date(settings.muteUntil).getTime() > Date.now()
  );

  const handleTest = async () => {
    setTesting(true);
    try {
      await onSendTest?.();
    } finally {
      setTesting(false);
    }
  };

  const handleConfirmUnlink = async () => {
    setUnlinking(true);
    try {
      await onUnlink?.();
      setConfirmUnlink(false);
    } finally {
      setUnlinking(false);
    }
  };

  const content = (
    <div className="flex flex-col divide-y divide-line-soft text-sm">
      {/* 1. Kết nối Zalo */}
      <section className="pb-4">
        <h3 className="text-xs font-medium text-ink-mid">Zalo</h3>
        {!zaloCfg.configured ? (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-mid">
            Máy chủ chưa có bot Zalo. Người quản trị đặt ZALO_BOT_TOKEN rồi khởi động lại.
          </p>
        ) : !link.linked ? (
          <div className="mt-2">
            <p className="mb-2.5 text-xs leading-relaxed text-ink-lo">
              Nối Zalo để quản gia tự nhắn khi có cảnh báo mới hoặc phiên live có việc gấp.
            </p>
            <Button variant="primary" size="sm" onClick={onOpenConnect}>
              Nối Zalo
            </Button>
          </div>
        ) : (
          <div className="mt-1.5">
            <p className="text-sm font-medium text-ink-hi">
              Đã nối với {link.zaloName || 'Zalo'} từ {formatShortDate(link.linkedAt)}.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                loading={testing}
                onClick={handleTest}
              >
                Gửi tin thử
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmUnlink(true)}
              >
                Ngắt
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* 2. Mức độ báo ngay */}
      <section className="py-4">
        <p className="mb-2 text-xs font-medium text-ink-mid">Báo ngay khi</p>
        <OptionBar
          label="Báo ngay khi"
          options={NOTIFY_OPTIONS}
          value={settings.notifyLevel || 'high'}
          onChange={(notifyLevel) => onSaveSettings?.({ notifyLevel })}
        />
      </section>

      {/* 3. Kho quản gia canh */}
      <section className="py-4">
        <p className="mb-2 text-xs font-medium text-ink-mid">Kho quản gia canh</p>
        <OptionBar
          label="Kho quản gia canh"
          options={WORKSPACE_OPTIONS}
          value={settings.workspace || 'real'}
          onChange={(workspace) => onSaveSettings?.({ workspace })}
        />
        <p className="mt-1.5 text-xs leading-relaxed text-ink-lo">
          Áp dụng cho tin Zalo. Trên web, quản gia trả lời theo kho đang mở.
        </p>
      </section>

      {/* 4. Giờ yên lặng */}
      <section className="py-4">
        <p className="mb-2 text-xs font-medium text-ink-mid">Giờ yên lặng</p>
        <div className="grid grid-cols-2 gap-2.5">
          <Select
            size="sm"
            label="Từ"
            options={HOUR_OPTIONS}
            value={String(settings.quietFrom ?? 22)}
            onChange={(e) => onSaveSettings?.({ quietFrom: Number(e.target.value) })}
          />
          <Select
            size="sm"
            label="Đến"
            options={HOUR_OPTIONS}
            value={String(settings.quietTo ?? 7)}
            onChange={(e) => onSaveSettings?.({ quietTo: Number(e.target.value) })}
          />
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-lo">
          Trong giờ này chỉ báo việc nghiêm trọng.
        </p>
      </section>

      {/* 5. Bản tin sáng */}
      <section className="py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-ink-mid">Bản tin sáng</span>
          <Switch
            size="sm"
            label="Bật bản tin sáng"
            checked={settings.digest !== false}
            onChange={(digest) => onSaveSettings?.({ digest })}
          />
        </div>
        {settings.digest !== false && (
          <div className="mt-2.5">
            <Select
              size="sm"
              label="Giờ gửi bản tin"
              options={HOUR_OPTIONS}
              value={String(settings.digestHour ?? 8)}
              onChange={(e) => onSaveSettings?.({ digestHour: Number(e.target.value) })}
            />
          </div>
        )}
      </section>

      {/* 5b. Báo về livestream */}
      <section className="py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-ink-mid">Báo về livestream</span>
          <Switch
            size="sm"
            label="Báo về livestream"
            checked={settings.live !== false}
            onChange={(live) => onSaveSettings?.({ live })}
          />
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-lo">
          Báo khi phiên bắt đầu, việc gấp trong phiên, báo cáo cuối phiên và nhắc lịch.
        </p>
        {status?.nextLive && (
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="text-ink-hi">
              Phiên hẹn tới: <strong className="font-semibold">{status.nextLive.title}</strong>,{' '}
              <span className="tabular-nums">{formatHm(status.nextLive.startAt)}</span>
            </span>
            <Link
              to="/live"
              className="inline-flex min-h-8 pointer-coarse:min-h-10 items-center font-medium text-accent-hi hover:underline"
            >
              Xem lịch
            </Link>
          </div>
        )}
      </section>

      {/* 6. Tạm im */}
      <section className="py-4">
        <p className="mb-2 text-xs font-medium text-ink-mid">Tạm im</p>
        {isMuted ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm tabular-nums text-ink-hi">
              Đang im đến {formatHmDate(settings.muteUntil)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onSaveSettings?.({ muteUntil: null })}
            >
              Bật báo lại
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onSaveSettings?.({
                muteUntil: new Date(Date.now() + 2 * 3600 * 1000).toISOString()
              })
            }
          >
            Tạm im 2 giờ
          </Button>
        )}
      </section>

      {/* 7. Đã báo gần đây */}
      <section className="py-4">
        <h3 className="mb-2 text-xs font-medium text-ink-mid">Đã báo gần đây</h3>
        {outboxItems.length === 0 ? (
          <p className="text-xs text-ink-lo">Chưa có tin báo nào được tạo.</p>
        ) : (
          <div className="paper rounded-ctrl p-2.5">
            <ul className="list-none divide-y divide-line-soft">
              {outboxItems.slice(0, 10).map((it) => {
                const st = statusTextOf(it);
                const firstLine = String(it.text || '').split('\n')[0] || '—';
                return (
                  <li key={it._id} className="py-2 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="tabular-nums text-ink-lo">
                        {formatHm(it.sentAt || it.createdAt)}
                      </span>
                      <span className={st.error ? 'font-medium text-crit' : 'text-ink-mid'}>
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-hi">{firstLine}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* 8. Trạng thái nhịp canh */}
      <section className="pt-4">
        <p className="text-xs leading-relaxed text-ink-lo">
          Quản gia kiểm mỗi {watcher.everyMinutes || 5} phút. Lần gần nhất:{' '}
          {watcher.lastRunAt ? fmtRelative(watcher.lastRunAt) : 'chưa chạy'}.
        </p>
        {watcher.lastError && (
          <p className="mt-1 text-xs text-crit">
            Lần kiểm gần nhất bị lỗi, đang thử lại.
          </p>
        )}
      </section>

      <Modal
        open={confirmUnlink}
        onClose={() => setConfirmUnlink(false)}
        tone="crit"
        icon={CircleAlert}
        title="Ngắt kết nối Zalo?"
        description="Quản gia sẽ ngừng gửi cảnh báo và bản tin sáng về Zalo này cho tới khi bạn nối lại."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmUnlink(false)}>
              Giữ kết nối
            </Button>
            <Button variant="danger" loading={unlinking} onClick={handleConfirmUnlink}>
              Ngắt kết nối
            </Button>
          </>
        }
      />
    </div>
  );

  if (inDrawer) return content;

  return (
    <GlassPanel as="aside" tone="strong" aria-label="Đang canh" className="p-5">
      <h2 className="mb-3 text-heading font-semibold tracking-tight text-ink-hi">
        Đang canh
      </h2>
      {content}
    </GlassPanel>
  );
};

export default WatchPanel;
