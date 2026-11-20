import React, { useEffect, useState } from 'react';
import { Check, CircleAlert, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import { Button, IconButton, Modal, TextField } from '../ui';
import { PASSWORD_RULES, authError, changePassword, currentAccount } from '../../lib/auth';
import { bumpDataVersion } from '../../lib/dataVersion';

/**
 * BIỂU MẪU ĐỔI MẬT KHẨU — dùng ở cả hộp bắt buộc (ForcePasswordChange)
 * và mục "Đổi mật khẩu" trong trang Cài đặt.
 */
export const PasswordChangeForm = ({ forced = false, onSuccess }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErr, setFieldErr] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!current) fe.current = forced ? 'Nhập mật khẩu tạm quản trị viên đã cấp.' : 'Nhập mật khẩu hiện tại.';
    const failedRule = PASSWORD_RULES.find((r) => !r.test(next));
    if (!next) fe.next = 'Nhập mật khẩu mới.';
    else if (failedRule) fe.next = `Mật khẩu mới cần: ${failedRule.label.toLowerCase()}.`;
    else if (next === current) fe.next = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
    if (!confirm) fe.confirm = 'Nhập lại mật khẩu mới.';
    else if (confirm !== next) fe.confirm = 'Hai lần nhập mật khẩu mới chưa khớp.';

    setFieldErr(fe);
    setError('');
    if (Object.keys(fe).length) return;

    setLoading(true);
    try {
      await changePassword({ current, next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setFieldErr({});
      setError('');
      setLoading(false);
      onSuccess?.();
    } catch (err) {
      const { message, fields } = authError(err);
      setFieldErr(fields || {});
      setError(message);
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <TextField
        label={forced ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'}
        type={showCurrent ? 'text' : 'password'}
        icon={Lock}
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
        error={fieldErr.current}
        required
        data-autofocus={forced ? '' : undefined}
        trailing={
          <IconButton
            icon={showCurrent ? EyeOff : Eye}
            variant="ghost"
            size="sm"
            label={showCurrent ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            pressed={showCurrent}
            onClick={() => setShowCurrent((v) => !v)}
          />
        }
      />

      <TextField
        label="Mật khẩu mới"
        type={showNext ? 'text' : 'password'}
        icon={KeyRound}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
        error={fieldErr.next}
        required
        trailing={
          <IconButton
            icon={showNext ? EyeOff : Eye}
            variant="ghost"
            size="sm"
            label={showNext ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'}
            pressed={showNext}
            onClick={() => setShowNext((v) => !v)}
          />
        }
      />

      <ul className="flex list-none flex-wrap gap-x-4 gap-y-1 text-xs">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(next);
          return (
            <li key={r.id} className={`flex items-center gap-1.5 ${ok ? 'text-ok' : 'text-ink-lo'}`}>
              <Check size={13} aria-hidden="true" className={ok ? 'opacity-100' : 'opacity-40'} />
              {r.label}
            </li>
          );
        })}
      </ul>

      <TextField
        label="Nhập lại mật khẩu mới"
        type={showConfirm ? 'text' : 'password'}
        icon={KeyRound}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        error={fieldErr.confirm}
        required
        trailing={
          <IconButton
            icon={showConfirm ? EyeOff : Eye}
            variant="ghost"
            size="sm"
            label={showConfirm ? 'Ẩn mật khẩu nhập lại' : 'Hiện mật khẩu nhập lại'}
            pressed={showConfirm}
            onClick={() => setShowConfirm((v) => !v)}
          />
        }
      />

      {error && (
        <p role="alert" className="flex items-start gap-1.5 rounded-ctrl bg-crit/12 px-3 py-2.5 text-sm text-crit">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}

      <div className={forced ? 'mt-1' : 'mt-1 flex justify-start'}>
        <Button type="submit" block={forced} loading={loading}>
          Đổi mật khẩu
        </Button>
      </div>
    </form>
  );
};

/**
 * HỘP BẮT BUỘC ĐỔI MẬT KHẨU (mục 4 điểm 4).
 * Hiện trên mọi trang (MainLayout và AdminLayout) khi mustChangePassword = true.
 * Không có nút đóng và Esc không đóng được cho tới khi đổi xong.
 */
const ForcePasswordChange = () => {
  const [mustChange, setMustChange] = useState(() => Boolean(currentAccount()?.mustChangePassword));

  useEffect(() => {
    const sync = () => setMustChange(Boolean(currentAccount()?.mustChangePassword));
    window.addEventListener('cr-auth', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('cr-auth', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!mustChange) return null;

  return (
    <Modal
      open
      dismissible={false}
      tone="accent"
      icon={KeyRound}
      title="Đặt mật khẩu mới"
      description="Quản trị viên đã đặt lại mật khẩu của bạn. Đặt mật khẩu mới để tiếp tục sử dụng."
    >
      {/* Trong lúc chờ đổi, máy chủ chặn API dữ liệu (403); đổi xong thì các trang tải lại */}
      <PasswordChangeForm forced onSuccess={bumpDataVersion} />
    </Modal>
  );
};

export default ForcePasswordChange;
