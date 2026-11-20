import React, { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Lock, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { Button, Modal, TextArea, TextField } from '../ui';
import {
  adminError,
  deleteUser,
  lockUser,
  resetPassword,
  revokeAllSessions,
  setRole
} from '../../lib/admin';
import { fmtInt } from '../../lib/format';

/**
 * CÁC HỘP THOẠI THAO TÁC TÀI KHOẢN (mục 5.7).
 * Mọi hộp thoại dùng Modal có sẵn; mật khẩu tạm bị xóa khỏi state ngay khi đóng.
 */
const AccountActions = ({ modal, user, sessionCount = 0, onClose, onDone, onError }) => {
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [copied, setCopied] = useState(false);

  // Mỗi lần đổi hộp thoại hoặc đóng: đặt lại state và xóa ngay mật khẩu tạm
  useEffect(() => {
    setReason('');
    setReasonErr('');
    setConfirmEmail('');
    setBusy(false);
    setTempPassword('');
    setCopied(false);
  }, [modal, user?.id]);

  const closeClean = () => {
    setTempPassword('');
    setCopied(false);
    setReason('');
    setReasonErr('');
    setConfirmEmail('');
    onClose?.();
  };

  if (!modal || !user) return null;

  // 1. Khóa tài khoản
  if (modal === 'lock') {
    const submitLock = async () => {
      const trimmed = reason.trim();
      if (trimmed.length < 3) {
        setReasonErr('Nhập lý do khóa ít nhất 3 ký tự.');
        return;
      }
      setReasonErr('');
      setBusy(true);
      try {
        const res = await lockUser(user.id, trimmed);
        onDone?.({ type: 'lock', user: res.user, message: `Đã khóa ${user.email}` });
        closeClean();
      } catch (err) {
        setBusy(false);
        onError?.(adminError(err));
      }
    };

    return (
      <Modal
        open
        onClose={busy ? undefined : closeClean}
        tone="crit"
        icon={Lock}
        title={`Khóa tài khoản ${user.email}?`}
        description="Người này bị đăng xuất khỏi mọi máy và không đăng nhập lại được tới khi mở khóa."
        footer={
          <>
            <Button variant="secondary" onClick={closeClean} disabled={busy}>Hủy</Button>
            <Button variant="danger" onClick={submitLock} loading={busy}>Khóa tài khoản</Button>
          </>
        }
      >
        <TextArea
          label="Lý do"
          placeholder="Ví dụ: spam đăng ký hoặc tài khoản nghi bị lộ mật khẩu"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (reasonErr) setReasonErr('');
          }}
          maxLength={200}
          rows={3}
          error={reasonErr || undefined}
          required
          data-autofocus
        />
      </Modal>
    );
  }

  // 2. Đăng xuất khỏi mọi máy
  if (modal === 'revoke_sessions') {
    const submitRevoke = async () => {
      setBusy(true);
      try {
        const res = await revokeAllSessions(user.id);
        const n = res.revoked ?? 0;
        onDone?.({
          type: 'revoke_sessions',
          revoked: n,
          message: n > 0 ? `Đã đăng xuất ${fmtInt(n)} phiên` : 'Không còn phiên nào khác đang mở'
        });
        closeClean();
      } catch (err) {
        setBusy(false);
        onError?.(adminError(err));
      }
    };

    return (
      <Modal
        open
        onClose={busy ? undefined : closeClean}
        tone="accent"
        icon={LogOut}
        title={`Đăng xuất ${user.email} khỏi ${fmtInt(sessionCount)} phiên?`}
        description="Mọi phiên mở ở các thiết bị khác sẽ bị hủy ngay và người dùng cần đăng nhập lại."
        footer={
          <>
            <Button variant="secondary" onClick={closeClean} disabled={busy}>Hủy</Button>
            <Button onClick={submitRevoke} loading={busy}>Đăng xuất</Button>
          </>
        }
      />
    );
  }

  // 3. Đặt lại mật khẩu (2 bước)
  if (modal === 'reset_password') {
    const submitReset = async () => {
      setBusy(true);
      try {
        const res = await resetPassword(user.id);
        setTempPassword(res.tempPassword || '');
        setBusy(false);
        onDone?.({
          type: 'reset_password',
          userPatch: { mustChangePassword: true, sessions: 0 },
          message: `Đã đặt lại mật khẩu cho ${user.email}`
        });
      } catch (err) {
        setBusy(false);
        onError?.(adminError(err));
      }
    };

    const copyPw = async () => {
      if (!tempPassword) return;
      try {
        await navigator.clipboard.writeText(tempPassword);
        setCopied(true);
      } catch {
        onError?.('Trình duyệt không cho phép sao chép tự động. Hãy chọn và chép thủ công.');
      }
    };

    if (tempPassword) {
      return (
        <Modal
          open
          onClose={closeClean}
          tone="accent"
          icon={KeyRound}
          title="Mật khẩu tạm đã được tạo"
          description="Mật khẩu này chỉ hiện một lần. Gửi riêng cho người dùng."
          footer={
            <>
              <Button variant="secondary" icon={copied ? Check : Copy} onClick={copyPw}>
                {copied ? 'Đã chép' : 'Chép mật khẩu'}
              </Button>
              <Button onClick={closeClean}>Xong</Button>
            </>
          }
        >
          <div className="rounded-ctrl border border-line bg-raised px-4 py-4 text-center">
            <p className="text-metric font-semibold tracking-tight text-ink-hi tabular-nums select-all">
              {tempPassword}
            </p>
          </div>
        </Modal>
      );
    }

    return (
      <Modal
        open
        onClose={busy ? undefined : closeClean}
        tone="crit"
        icon={KeyRound}
        title={`Đặt lại mật khẩu cho ${user.email}?`}
        description="Mật khẩu cũ ngừng dùng được ngay. Người này phải đổi mật khẩu ở lần đăng nhập tới."
        footer={
          <>
            <Button variant="secondary" onClick={closeClean} disabled={busy}>Hủy</Button>
            <Button variant="danger" onClick={submitReset} loading={busy}>Đặt lại mật khẩu</Button>
          </>
        }
      />
    );
  }

  // 4. Đổi vai trò
  if (modal === 'set_role') {
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    const promoting = nextRole === 'admin';

    const submitRole = async () => {
      setBusy(true);
      try {
        const res = await setRole(user.id, nextRole);
        onDone?.({
          type: 'set_role',
          user: res.user,
          message: promoting
            ? `Đã cấp quyền quản trị cho ${user.email}`
            : `Đã bỏ quyền quản trị của ${user.email}`
        });
        closeClean();
      } catch (err) {
        setBusy(false);
        onError?.(adminError(err));
      }
    };

    return (
      <Modal
        open
        onClose={busy ? undefined : closeClean}
        tone="accent"
        icon={ShieldCheck}
        title={promoting ? `Cấp quyền quản trị cho ${user.email}?` : `Bỏ quyền quản trị của ${user.email}?`}
        description={
          promoting
            ? 'Người này sẽ truy cập được bàn điều khiển máy chủ, xem danh sách tài khoản, khóa, đặt lại mật khẩu, xóa tài khoản và xem toàn bộ nhật ký.'
            : 'Người này không còn vào được bàn điều khiển máy chủ và chỉ dùng ứng dụng với quyền người dùng thường.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeClean} disabled={busy}>Hủy</Button>
            <Button onClick={submitRole} loading={busy}>
              {promoting ? 'Cấp quyền' : 'Bỏ quyền'}
            </Button>
          </>
        }
      />
    );
  }

  // 5. Xóa tài khoản
  if (modal === 'delete_user') {
    const matched = confirmEmail.trim().toLowerCase() === String(user.email || '').toLowerCase();

    const submitDelete = async () => {
      if (!matched) return;
      setBusy(true);
      try {
        await deleteUser(user.id, confirmEmail.trim());
        onDone?.({
          type: 'delete_user',
          deletedId: user.id,
          message: `Đã xóa tài khoản ${user.email}`
        });
        closeClean();
      } catch (err) {
        setBusy(false);
        onError?.(adminError(err));
      }
    };

    return (
      <Modal
        open
        onClose={busy ? undefined : closeClean}
        tone="crit"
        icon={Trash2}
        title={`Xóa tài khoản ${user.email}?`}
        description="Thao tác này không thể hoàn tác."
        footer={
          <>
            <Button variant="secondary" onClick={closeClean} disabled={busy}>Hủy</Button>
            <Button variant="danger" onClick={submitDelete} loading={busy} disabled={!matched}>
              Xóa vĩnh viễn
            </Button>
          </>
        }
      >
        <div className="mb-4 flex flex-col gap-2 text-sm leading-relaxed text-ink-mid">
          <p>
            <span className="font-semibold text-ink-hi">Sẽ xóa:</span> tài khoản, toàn bộ phiên đăng nhập, liên kết Zalo và lịch sử tin nhắn quản gia của người này.
          </p>
          <p>
            <span className="font-semibold text-ink-hi">Không xóa:</span> dữ liệu phản hồi, cảnh báo, hồ sơ xử lý và báo cáo của cửa hàng.
          </p>
        </div>
        <TextField
          label="Nhập email để xác nhận"
          placeholder={user.email}
          value={confirmEmail}
          onChange={(e) => setConfirmEmail(e.target.value)}
          autoComplete="off"
          data-autofocus
        />
      </Modal>
    );
  }

  return null;
};

export default AccountActions;
