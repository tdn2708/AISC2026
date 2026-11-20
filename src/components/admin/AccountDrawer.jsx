import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Lock, LockOpen, LogOut, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, Drawer, EmptyState, Skeleton, SkeletonBlock } from '../ui';
import { Pulse } from '../motion';
import { currentAccount } from '../../lib/auth';
import {
  adminError,
  getUser,
  guardAction,
  revokeSession,
  unlockUser
} from '../../lib/admin';
import { describeUa, fmtDate, fmtDateTime } from '../../lib/format';
import AccountActions from './AccountActions';
import { AuditRow } from './AuditLog';

/**
 * NGĂN KÉO CHI TIẾT TÀI KHOẢN (/admin/users/:id, mục 5.7).
 * Dùng Drawer có sẵn (width=560), chia 5 khối bằng kẻ ngang border-line-soft,
 * không thẻ lồng thẻ.
 */
const AccountDrawer = ({ userId, adminCount = 1, onClose, onUserMutated, onNotify }) => {
  const actor = currentAccount();
  const [state, setState] = useState({ loading: false, error: '', data: null });
  const [modal, setModal] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [revokingSid, setRevokingSid] = useState('');
  const [pulseKey, setPulseKey] = useState(0);

  const load = useCallback(async (id, silent = false) => {
    if (!id) return;
    setState((s) => ({
      ...s,
      loading: !silent,
      error: silent ? s.error : ''
    }));
    try {
      const data = await getUser(id);
      setState({ loading: false, error: '', data });
    } catch (err) {
      setState({ loading: false, error: adminError(err), data: null });
    }
  }, []);

  useEffect(() => {
    setModal(null);
    if (userId) load(userId, false);
    else setState({ loading: false, error: '', data: null });
  }, [userId, load]);

  const user = state.data?.user;
  const sessions = state.data?.sessions || [];
  const zalo = state.data?.zalo;
  const audit = state.data?.audit || [];

  const revocableSessions = sessions.filter((s) => !s.current);

  const guards = user
    ? {
        revoke_sessions: guardAction(actor, user, 'revoke_sessions', { adminCount }),
        reset_password: guardAction(actor, user, 'reset_password', { adminCount }),
        lock: guardAction(actor, user, 'lock', { adminCount }),
        set_role: guardAction(actor, user, 'set_role', { adminCount }),
        delete_user: guardAction(actor, user, 'delete_user', { adminCount })
      }
    : {};

  // Gom các câu giải thích chốt chặn duy nhất để hiện ngay dưới hàng nút bị khóa
  const guardNotes = Array.from(
    new Set(
      Object.values(guards).filter(Boolean)
    )
  );

  const handleActionDone = async (res) => {
    if (res.message) onNotify?.('ok', res.message);
    if (res.type === 'delete_user') {
      onUserMutated?.({ type: 'delete', id: res.deletedId });
      onClose?.();
      return;
    }
    if (res.user || res.userPatch) {
      setState((prev) => (prev.data ? {
        ...prev,
        data: {
          ...prev.data,
          user: { ...prev.data.user, ...(res.user || {}), ...(res.userPatch || {}) }
        }
      } : prev));
    }
    onUserMutated?.({
      type: 'update',
      id: user?.id,
      user: res.user,
      patch: res.userPatch,
      revoked: res.revoked
    });
    if (user?.id) {
      await load(user.id, true);
      setPulseKey((k) => k + 1);
    }
  };

  const handleUnlock = async () => {
    if (!user) return;
    setUnlocking(true);
    try {
      const res = await unlockUser(user.id);
      if (res.user) {
        setState((prev) => (prev.data ? {
          ...prev,
          data: { ...prev.data, user: { ...prev.data.user, ...res.user } }
        } : prev));
      }
      onNotify?.('ok', `Đã mở khóa ${user.email}`);
      onUserMutated?.({ type: 'update', id: user.id, user: res.user });
      await load(user.id, true);
      setPulseKey((k) => k + 1);
    } catch (err) {
      onNotify?.('crit', adminError(err));
    } finally {
      setUnlocking(false);
    }
  };

  const handleRevokeOne = async (sid) => {
    if (!user) return;
    setRevokingSid(sid);
    try {
      await revokeSession(sid);
      onNotify?.('ok', 'Đã đăng xuất phiên này');
      onUserMutated?.({ type: 'revoke_one', id: user.id });
      await load(user.id, true);
      setPulseKey((k) => k + 1);
    } catch (err) {
      onNotify?.('crit', adminError(err));
    } finally {
      setRevokingSid('');
    }
  };

  return (
    <>
      <Drawer
        open={Boolean(userId)}
        onClose={modal ? undefined : onClose}
        width={560}
        title="Chi tiết tài khoản"
      >
        {state.loading ? (
          <SkeletonBlock label="Đang tải chi tiết tài khoản" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
              <div className="mt-1 flex gap-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-line-soft pt-5">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-9 w-36" />
              <Skeleton className="h-9 w-32" />
            </div>
            <div className="flex flex-col gap-3 border-t border-line-soft pt-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </SkeletonBlock>
        ) : state.error ? (
          <EmptyState
            variant="error"
            title="Không mở được tài khoản"
            description={state.error}
            action={<Button variant="secondary" size="sm" onClick={() => load(userId, false)}>Thử lại</Button>}
          />
        ) : user ? (
          <div className="flex flex-col gap-5">
            {/* 1. Định danh, vai trò và trạng thái */}
            <section className="flex flex-col gap-2.5">
              <div>
                <h3 className="text-heading font-semibold text-ink-hi">{user.name || user.email}</h3>
                <p className="mt-0.5 text-sm text-ink-mid">{user.email}</p>
                {user.shop && <p className="mt-0.5 text-xs text-ink-lo">Cửa hàng: {user.shop}</p>}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {user.role === 'admin' ? (
                  <Badge tone="accent" icon={ShieldCheck}>Quản trị</Badge>
                ) : (
                  <Badge tone="neutral">Người dùng</Badge>
                )}
                {user.status === 'locked' ? (
                  <Badge tone="crit" icon={Lock}>Đã khóa</Badge>
                ) : (
                  <Badge tone="ok">Đang dùng</Badge>
                )}
                {user.mustChangePassword && <Badge tone="high">Chờ đổi mật khẩu</Badge>}
                {user.isDemo && <Badge tone="neutral">Dùng chung</Badge>}
              </div>

              {user.status === 'locked' && (
                <p className="rounded-ctrl bg-crit/10 px-3 py-2 text-xs leading-relaxed text-crit">
                  Khóa lúc {fmtDateTime(user.lockedAt)} bởi {user.lockedBy || 'quản trị viên'}: “{user.lockedReason || 'Không ghi lý do'}”
                </p>
              )}

              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-lo tabular-nums">
                <span>Tạo lúc {fmtDateTime(user.createdAt)}</span>
                <span>
                  Đăng nhập gần nhất: {user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : 'Chưa từng'}
                </span>
              </div>
            </section>

            {/* 2. Thao tác */}
            <section className="border-t border-line-soft pt-5">
              <h4 className="mb-3 text-sm font-semibold text-ink-hi">Thao tác</h4>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={LogOut}
                  disabled={Boolean(guards.revoke_sessions) || revocableSessions.length === 0}
                  onClick={() => setModal('revoke_sessions')}
                >
                  Đăng xuất khỏi mọi máy
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  icon={KeyRound}
                  disabled={Boolean(guards.reset_password)}
                  onClick={() => setModal('reset_password')}
                >
                  Đặt lại mật khẩu
                </Button>

                {user.status === 'locked' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={LockOpen}
                    loading={unlocking}
                    onClick={handleUnlock}
                  >
                    Mở khóa
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={Lock}
                    disabled={Boolean(guards.lock)}
                    onClick={() => setModal('lock')}
                  >
                    Khóa tài khoản
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  icon={ShieldCheck}
                  disabled={Boolean(guards.set_role)}
                  onClick={() => setModal('set_role')}
                >
                  {user.role === 'admin' ? 'Bỏ quyền quản trị' : 'Cấp quyền quản trị'}
                </Button>

                <Button
                  variant="link"
                  size="sm"
                  icon={Trash2}
                  disabled={Boolean(guards.delete_user)}
                  onClick={() => setModal('delete_user')}
                  className="ml-auto text-crit! hover:text-crit!"
                >
                  Xóa tài khoản
                </Button>
              </div>

              {guardNotes.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-1 text-xs text-ink-lo">
                  {guardNotes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              )}
            </section>

            {/* 3. Phiên đang mở */}
            <section className="border-t border-line-soft pt-5">
              <h4 className="mb-3 text-sm font-semibold text-ink-hi">
                Phiên đang mở ({sessions.length})
              </h4>
              {sessions.length === 0 ? (
                <p className="text-sm text-ink-lo">Không có phiên nào đang mở.</p>
              ) : (
                <div className="paper">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-2 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={s.kind === 'admin' ? 'accent' : 'neutral'}>
                            {s.kind === 'admin' ? 'Quản trị' : 'Ứng dụng'}
                          </Badge>
                          <span className="truncate text-sm font-medium text-ink-hi">
                            {describeUa(s.ua)}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-lo tabular-nums">
                          <span>Mở lúc {fmtDateTime(s.createdAt)}</span>
                          <span>Hết hạn {fmtDateTime(s.expiresAt)}</span>
                        </div>
                      </div>

                      {s.current ? (
                        <Badge tone="accent">Phiên này</Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={revokingSid === s.id}
                          onClick={() => handleRevokeOne(s.id)}
                        >
                          Đăng xuất phiên này
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 4. Zalo */}
            <section className="border-t border-line-soft pt-5">
              <h4 className="mb-1.5 text-sm font-semibold text-ink-hi">Zalo</h4>
              <p className="text-sm text-ink-mid">
                {zalo?.linked
                  ? `Đã nối với ${zalo.zaloName || 'tài khoản Zalo'} từ ${fmtDate(zalo.linkedAt)}`
                  : 'Chưa nối Zalo'}
              </p>
            </section>

            {/* 5. Nhật ký về tài khoản này */}
            <section className="border-t border-line-soft pt-5">
              <h4 className="mb-3 text-sm font-semibold text-ink-hi">Nhật ký về tài khoản này</h4>
              <div className="paper">
                {audit.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-ink-lo">Chưa có thao tác quản trị nào trên tài khoản này.</p>
                ) : (
                  audit.map((item, idx) =>
                    idx === 0 ? (
                      <Pulse key={item.id} trigger={pulseKey} className="rounded-ctrl">
                        <AuditRow item={item} compact showTarget={false} />
                      </Pulse>
                    ) : (
                      <AuditRow key={item.id} item={item} compact showTarget={false} />
                    )
                  )
                )}
              </div>
            </section>
          </div>
        ) : null}
      </Drawer>

      <AccountActions
        modal={modal}
        user={user}
        sessionCount={revocableSessions.length}
        onClose={() => setModal(null)}
        onDone={handleActionDone}
        onError={(msg) => onNotify?.('crit', msg)}
      />
    </>
  );
};

export default AccountDrawer;
