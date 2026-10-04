import React, { useState } from 'react';
import { UserRound, Palette, BellRing, Database, ShieldCheck, Save, Mail, Hash, Smartphone, KeyRound, Sun, Moon, Sparkles } from 'lucide-react';
import { useTheme, useGlass } from '../hooks/useTheme';
import { PageHeader, GlassPanel, PanelHeader, Button, TextField, Select, Switch, RadioCards, Toast } from './ui';
import { initials } from '../lib/format';

/**
 * CÀI ĐẶT
 * ------------------------------------------------------------------
 * Bỏ tab "AI Configuration" (chọn nhà cung cấp mô hình, cân bằng tải
 * ba API): đó là hạ tầng của nhóm phát triển, không phải lựa chọn của
 * người dùng doanh nghiệp. Mọi tuỳ chọn ở đây được lưu thật vào máy.
 */

const KEY = 'crSettings';
const DEFAULTS = {
  name: 'Admin User',
  email: 'admin@company.com',
  timezone: 'Asia/Ho_Chi_Minh',
  notifyEmail: true,
  notifySlack: false,
  notifySms: false,
  syncInterval: '1h',
  retention: '90'
};

const load = () => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
};

const TABS = [
  { id: 'general', label: 'Hồ sơ', icon: UserRound },
  { id: 'appearance', label: 'Giao diện', icon: Palette },
  { id: 'notifications', label: 'Thông báo', icon: BellRing },
  { id: 'data', label: 'Dữ liệu & quyền riêng tư', icon: Database },
  { id: 'security', label: 'Bảo mật', icon: ShieldCheck }
];

const Row = ({ icon: Icon, title, description, children }) => (
  <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface/60 p-4">
    <div className="flex min-w-0 items-center gap-3.5">
      {Icon && (
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-dim text-accent">
          <Icon size={18} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-hi">{title}</p>
        {description && <p className="mt-0.5 text-xs text-ink-lo">{description}</p>}
      </div>
    </div>
    {children}
  </div>
);

const Swatches = ({ colors }) => (
  <span className="mt-3 flex gap-1.5">
    {colors.map((c) => <span key={c} className="size-6 rounded-full border border-white/60 shadow-sm" style={{ background: c }} />)}
  </span>
);

const Settings = () => {
  const { theme, setTheme } = useTheme();
  const { glass, setGlass } = useGlass();
  const [tab, setTab] = useState('general');
  const [form, setForm] = useState(load);
  const [saved, setSaved] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(form));
    // Thanh bên đọc tên/email từ đây — báo cho nó cập nhật ngay
    window.dispatchEvent(new Event('cr-settings'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="cx">
      <PageHeader
        section="Hệ thống"
        title="Cài"
        accent="đặt"
        subtitle="Tuỳ chỉnh hồ sơ, giao diện và cách hệ thống liên lạc với bạn."
        actions={<Button icon={Save} onClick={save}>Lưu thay đổi</Button>}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <GlassPanel className="p-2 lg:sticky lg:top-20">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Mục cài đặt">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id || undefined}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  tab === t.id ? 'bg-surface font-semibold text-ink-hi shadow-[0_1px_3px_rgb(31_45_53/0.1)]' : 'text-ink-mid hover:bg-raised hover:text-ink-hi'
                }`}
              >
                <t.icon size={17} className={tab === t.id ? 'text-accent' : 'text-ink-lo'} aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </nav>
        </GlassPanel>

        <GlassPanel tone="strong" className="p-6 animate-fade-up" key={tab}>
          {tab === 'general' && (
            <>
              <PanelHeader title="Hồ sơ" subtitle="Thông tin hiển thị trong báo cáo và nhật ký quyết định" />
              <div className="mb-6 flex items-center gap-4">
                <span className="grid size-16 place-items-center rounded-full bg-linear-to-br from-blush to-sky text-xl font-semibold text-ink-hi">{initials(form.name)}</span>
                <div>
                  <p className="font-semibold text-ink-hi">{form.name}</p>
                  <p className="text-sm text-ink-lo">Quản lý trải nghiệm khách hàng</p>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="Họ và tên" value={form.name} onChange={set('name')} />
                <TextField label="Email" type="email" icon={Mail} value={form.email} onChange={set('email')} />
                <TextField label="Vai trò" value="Quản lý trải nghiệm khách hàng" disabled hint="Do quản trị viên tổ chức cấp" />
                <Select
                  label="Múi giờ"
                  value={form.timezone}
                  onChange={set('timezone')}
                  options={[{ value: 'Asia/Ho_Chi_Minh', label: '(GMT+07:00) Giờ Đông Dương' }, { value: 'UTC', label: 'UTC / GMT' }]}
                />
              </div>
            </>
          )}

          {tab === 'appearance' && (
            <>
              <PanelHeader title="Giao diện" subtitle="Áp dụng ngay, lưu riêng trên máy này" />
              <RadioCards
                name="Chủ đề"
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'light', label: 'Mist — sáng', description: 'Kính sáng trên nền phong cảnh phủ sương', preview: <Swatches colors={['#F1F5F4', '#5E8B7E', '#A7C7E7', '#E8AEB7', '#2F3E46']} /> },
                  { value: 'dark', label: 'Dusk — tối', description: 'Dịu mắt khi làm việc buổi tối', preview: <Swatches colors={['#121B20', '#84B9A9', '#7AAAE0', '#E8899B', '#E6EEED']} /> }
                ]}
              />
              <div className="mt-4 flex flex-col gap-3">
                <Row icon={Sparkles} title="Hiệu ứng kính mờ" description="Tắt nếu máy chậm khi cuộn — mọi bề mặt chuyển về nền đặc">
                  <Switch checked={glass} onChange={setGlass} label="Hiệu ứng kính mờ" />
                </Row>
                <Row icon={theme === 'dark' ? Moon : Sun} title="Phím tắt đổi chủ đề" description="Mở bảng lệnh bằng Ctrl + K rồi gõ “giao diện”">
                  <kbd className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-xs text-ink-mid">Ctrl K</kbd>
                </Row>
              </div>
            </>
          )}

          {tab === 'notifications' && (
            <>
              <PanelHeader title="Kênh thông báo" subtitle="Cảnh báo mức Nghiêm trọng luôn được gửi qua mọi kênh đang bật" />
              <div className="flex flex-col gap-3">
                <Row icon={Mail} title="Email" description="Bản tóm tắt điều hành hằng ngày lúc 8:00">
                  <Switch checked={form.notifyEmail} onChange={set('notifyEmail')} label="Thông báo qua email" />
                </Row>
                <Row icon={Hash} title="Slack" description="Gửi cảnh báo mức Cao trở lên tới #cx-urgent">
                  <Switch checked={form.notifySlack} onChange={set('notifySlack')} label="Thông báo qua Slack" />
                </Row>
                <Row icon={Smartphone} title="SMS / đẩy" description="Chỉ dành cho khủng hoảng truyền thông nghiêm trọng">
                  <Switch checked={form.notifySms} onChange={set('notifySms')} label="Thông báo qua SMS" />
                </Row>
              </div>
            </>
          )}

          {tab === 'data' && (
            <>
              <PanelHeader title="Dữ liệu & quyền riêng tư" subtitle="Customer Radar là Bên Xử lý dữ liệu theo Nghị định 13/2023/NĐ-CP — thông tin cá nhân được che ngay ở bước tiền xử lý" />
              <div className="grid gap-4 md:grid-cols-2">
                <Select
                  label="Chu kỳ tự đồng bộ"
                  value={form.syncInterval}
                  onChange={set('syncInterval')}
                  options={[{ value: '5m', label: 'Mỗi 5 phút' }, { value: '1h', label: 'Mỗi giờ' }, { value: 'nightly', label: 'Hằng đêm' }, { value: 'manual', label: 'Chỉ khi bấm đồng bộ' }]}
                />
                <Select
                  label="Thời gian lưu trữ"
                  value={form.retention}
                  onChange={set('retention')}
                  options={[{ value: '30', label: '30 ngày' }, { value: '90', label: '90 ngày' }, { value: '365', label: '1 năm' }]}
                  hint="Hết hạn thì phản hồi được ẩn danh hoá, chỉ số tổng hợp được giữ lại"
                />
              </div>
            </>
          )}

          {tab === 'security' && (
            <>
              <PanelHeader title="Bảo mật" subtitle="Bảo vệ tài khoản quản trị" />
              {/* Bản này dùng tài khoản dùng thử cố định, chưa có máy chủ xác thực.
                  Nút không làm gì mà vẫn bấm được thì còn tệ hơn không có nút. */}
              <p className="mb-4 rounded-xl bg-accent-dim px-4 py-3 text-sm text-accent-hi">
                Tài khoản dùng thử do quản trị viên quản lý — đổi mật khẩu và xác thực hai lớp sẽ mở khi kết nối máy chủ xác thực.
              </p>
              <form className="grid gap-4 md:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
                <input type="text" name="username" autoComplete="username" value={form.email} readOnly hidden />
                <TextField label="Mật khẩu hiện tại" type="password" icon={KeyRound} placeholder="••••••••" autoComplete="current-password" disabled />
                <TextField label="Mật khẩu mới" type="password" icon={KeyRound} placeholder="Tối thiểu 10 ký tự" autoComplete="new-password" disabled />
                <Button type="submit" variant="outline" disabled className="justify-self-start">Đổi mật khẩu</Button>
              </form>
              <div className="mt-6">
                <Row icon={ShieldCheck} title="Xác thực hai lớp" description="Yêu cầu mã từ ứng dụng xác thực mỗi lần đăng nhập">
                  <Button size="sm" variant="soft" disabled>Bật 2FA</Button>
                </Row>
              </div>
            </>
          )}
        </GlassPanel>
      </div>

      <Toast show={saved}>Đã lưu cài đặt</Toast>
    </div>
  );
};

export default Settings;
