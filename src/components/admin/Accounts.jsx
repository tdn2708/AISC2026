import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Lock, Search, ShieldCheck, Users } from 'lucide-react';
import {
  Badge,
  Button,
  ChipGroup,
  EmptyState,
  GlassPanel,
  Pager,
  PanelHeader,
  Select,
  Skeleton,
  SkeletonBlock,
  TextField,
  Toast
} from '../ui';
import { PageEnter } from '../motion';
import { adminError, getUsers } from '../../lib/admin';
import { fmtDateTime, fmtInt } from '../../lib/format';
import AccountDrawer from './AccountDrawer';

/**
 * SỔ TÀI KHOẢN (/admin/users và /admin/users/:id, mục 5.6).
 * Vật chữ ký của bàn điều khiển: mỗi dòng là một tài khoản trong khối paper,
 * toàn bộ bộ lọc nằm trên URL (?q=&status=&sort=&page=), bấm mở ngăn kéo bên phải.
 */

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: 'lastLogin', label: 'Đăng nhập gần nhất' },
  { value: 'created', label: 'Mới tạo' },
  { value: 'email', label: 'Email' }
];

const EmptyCell = () => (
  <span className="text-ink-lo" aria-label="Không có">—</span>
);

const fmtLastLogin = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `Hôm nay ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return fmtDateTime(d);
};

const Accounts = () => {
  const { id: selectedId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const qParam = searchParams.get('q') || '';
  const status = searchParams.get('status') || 'all';
  const sort = searchParams.get('sort') || 'lastLogin';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const [searchInput, setSearchInput] = useState(qParam);
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [toast, setToast] = useState({ show: false, tone: 'ok', text: '' });

  const toastTimer = useRef(null);
  const rowRefs = useRef({});
  const lastSelectedRef = useRef(null);

  const notify = useCallback((tone, text) => {
    clearTimeout(toastTimer.current);
    setToast({ show: true, tone, text });
    toastTimer.current = setTimeout(() => {
      setToast((t) => ({ ...t, show: false }));
    }, 3600);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Đồng bộ ô tìm khi URL đổi (nút Back/Forward hoặc Xóa bộ lọc)
  useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  // Trễ 300ms sau phím cuối mới cập nhật ?q= trên URL
  useEffect(() => {
    if (searchInput === qParam) return undefined;
    const t = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      const trimmed = searchInput.trim();
      if (trimmed) next.set('q', trimmed);
      else next.delete('q');
      next.delete('page');
      setSearchParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, qParam, searchParams, setSearchParams]);

  const load = useCallback(async (silent = false) => {
    setState((s) => ({
      ...s,
      loading: !silent,
      error: silent ? s.error : ''
    }));
    try {
      const data = await getUsers({
        ...(qParam ? { q: qParam } : {}),
        ...(status !== 'all' ? { status } : {}),
        sort,
        page,
        limit: PAGE_SIZE
      });
      setState({ loading: false, error: '', data });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: adminError(err) }));
    }
  }, [qParam, status, sort, page]);

  useEffect(() => {
    load(false);
  }, [load]);

  // Trả tiêu điểm về đúng dòng vừa mở sau khi đóng ngăn kéo
  useEffect(() => {
    if (selectedId) {
      lastSelectedRef.current = selectedId;
      return;
    }
    const prevId = lastSelectedRef.current;
    if (prevId) {
      lastSelectedRef.current = null;
      requestAnimationFrame(() => {
        rowRefs.current[prevId]?.focus?.();
      });
    }
  }, [selectedId]);

  const updateParam = (key, value, defaultVal = '') => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === defaultVal) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  const openDrawer = (uid) => {
    navigate(`/admin/users/${encodeURIComponent(uid)}${location.search}`);
  };

  const closeDrawer = () => {
    navigate(`/admin/users${location.search}`, { replace: true });
  };

  const handleUserMutated = (ev) => {
    setState((prev) => {
      if (!prev.data) return prev;
      const prevItems = prev.data.items || [];
      const prevCounts = { ...(prev.data.counts || {}) };
      const oldUser = prevItems.find((u) => u.id === ev.id);

      if (ev.type === 'delete') {
        const nextItems = prevItems.filter((u) => u.id !== ev.id);
        if (oldUser) {
          if (typeof prevCounts.all === 'number') prevCounts.all = Math.max(0, prevCounts.all - 1);
          if (oldUser.status === 'locked' && typeof prevCounts.locked === 'number') prevCounts.locked = Math.max(0, prevCounts.locked - 1);
          else if (typeof prevCounts.active === 'number') prevCounts.active = Math.max(0, prevCounts.active - 1);
          if (oldUser.role === 'admin' && typeof prevCounts.admin === 'number') prevCounts.admin = Math.max(0, prevCounts.admin - 1);
        }
        return {
          ...prev,
          data: {
            ...prev.data,
            items: nextItems,
            counts: prevCounts,
            total: Math.max(0, (prev.data.total || 0) - 1)
          }
        };
      }
      if (ev.type === 'revoke_one') {
        const nextItems = prevItems.map((u) =>
          u.id === ev.id ? { ...u, sessions: Math.max(0, (u.sessions || 0) - 1) } : u
        );
        return { ...prev, data: { ...prev.data, items: nextItems } };
      }
      let nextUser = null;
      const nextItems = prevItems.map((u) => {
        if (u.id !== ev.id) return u;
        let updated = { ...u };
        if (ev.user) updated = { ...updated, ...ev.user };
        if (ev.patch) updated = { ...updated, ...ev.patch };
        if (typeof ev.revoked === 'number') {
          updated.sessions = Math.max(0, (updated.sessions || 0) - ev.revoked);
        }
        nextUser = updated;
        return updated;
      });
      if (oldUser && nextUser) {
        if (oldUser.role !== nextUser.role && typeof prevCounts.admin === 'number') {
          prevCounts.admin = Math.max(0, prevCounts.admin + (nextUser.role === 'admin' ? 1 : -1));
        }
        if (oldUser.status !== nextUser.status) {
          if (typeof prevCounts.locked === 'number') {
            prevCounts.locked = Math.max(0, prevCounts.locked + (nextUser.status === 'locked' ? 1 : -1));
          }
          if (typeof prevCounts.active === 'number') {
            prevCounts.active = Math.max(0, prevCounts.active + (nextUser.status === 'locked' ? -1 : 1));
          }
        }
      }
      return { ...prev, data: { ...prev.data, items: nextItems, counts: prevCounts } };
    });
    // Đồng bộ lại số đếm chip và thứ tự ngầm mà không nhấp nháy khung xương
    load(true);
  };

  const items = state.data?.items || [];
  const counts = state.data?.counts || {};
  const total = state.data?.total || 0;
  const pages = state.data?.pages || 1;
  const hasFilter = Boolean(qParam || status !== 'all');

  const statusChips = [
    { value: 'all', label: 'Tất cả', count: counts.all },
    { value: 'active', label: 'Đang dùng', count: counts.active },
    { value: 'locked', label: 'Đã khóa', count: counts.locked, tone: 'crit' },
    { value: 'admin', label: 'Quản trị', count: counts.admin }
  ];

  const onRowKeyDown = (e, uid) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDrawer(uid);
    }
  };

  return (
    <PageEnter className="flex flex-col gap-5">
      <GlassPanel tone="strong" className="p-5 sm:p-6">
        <PanelHeader
          icon={Users}
          title="Sổ tài khoản"
          subtitle="Chọn một dòng để xem phiên đang mở, khóa, đặt lại mật khẩu, đổi vai trò hoặc xóa."
        />

        {/* Thanh tìm kiếm, lọc trạng thái và sắp xếp */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="w-full sm:w-64">
              <TextField
                size="sm"
                icon={Search}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm theo email hoặc tên"
                aria-label="Tìm tài khoản theo email hoặc tên"
              />
            </div>

            <ChipGroup
              label="Lọc theo trạng thái tài khoản"
              options={statusChips}
              value={status}
              onChange={(val) => updateParam('status', val, 'all')}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-ink-mid">Sắp xếp:</span>
            <div className="w-48">
              <Select
                size="sm"
                aria-label="Sắp xếp danh sách tài khoản"
                options={SORT_OPTIONS}
                value={sort}
                onChange={(e) => updateParam('sort', e.target.value, 'lastLogin')}
              />
            </div>
          </div>
        </div>

        {/* Khối giấy chứa bảng (máy tính) và danh sách dòng kẻ (điện thoại) */}
        <div className="paper">
          {state.loading ? (
            <SkeletonBlock label="Đang tải danh sách tài khoản" className="flex flex-col divide-y divide-line-soft px-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex h-14 items-center justify-between gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="hidden h-5 w-20 sm:block" />
                  <Skeleton className="hidden h-5 w-20 sm:block" />
                  <Skeleton className="hidden h-4 w-28 md:block" />
                  <Skeleton className="h-4 w-10" />
                </div>
              ))}
            </SkeletonBlock>
          ) : state.error ? (
            <EmptyState
              variant="error"
              title="Không tải được sổ tài khoản"
              description={state.error}
              action={<Button variant="secondary" size="sm" onClick={() => load(false)}>Thử lại</Button>}
            />
          ) : items.length === 0 ? (
            <EmptyState
              variant="empty"
              title="Không có tài khoản nào khớp."
              description={hasFilter ? 'Thử đổi từ khóa hoặc bỏ bộ lọc để xem toàn bộ tài khoản.' : 'Chưa có tài khoản nào trong hệ thống.'}
              action={hasFilter ? <Button variant="secondary" size="sm" onClick={clearFilters}>Xóa bộ lọc</Button> : null}
            />
          ) : (
            <>
              {/* Máy tính và máy tính bảng (>= 640px): bảng thật */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line-soft text-xs font-medium text-ink-mid">
                      <th scope="col" className="py-2.5 pr-4 pl-3 font-medium">Tài khoản</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Vai trò</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Trạng thái</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Đăng nhập gần nhất</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">Phiên</th>
                      <th scope="col" className="py-2.5 pr-3 pl-3 font-medium">Zalo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((u) => {
                      const isSelected = selectedId === u.id;
                      const isLocked = u.status === 'locked';
                      const rowBg = isSelected
                        ? 'bg-accent-dim'
                        : isLocked
                          ? 'bg-crit/8 hover:bg-crit/12'
                          : 'hover:bg-raised';
                      const lastSeen = fmtLastLogin(u.lastLoginAt);
                      return (
                        <tr
                          key={u.id}
                          ref={(el) => { rowRefs.current[u.id] = el; }}
                          tabIndex={0}
                          role="button"
                          aria-label={`Xem chi tiết tài khoản ${u.name || u.email}`}
                          aria-pressed={isSelected}
                          onClick={() => openDrawer(u.id)}
                          onKeyDown={(e) => onRowKeyDown(e, u.id)}
                          className={`h-14 cursor-pointer border-b border-line-soft transition-[background-color] duration-micro ease-out last:border-b-0 ${rowBg}`}
                        >
                          <td className="py-2 pr-4 pl-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink-hi">{u.name || u.email}</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-xs text-ink-mid">{u.email}</span>
                                {u.isDemo && <Badge tone="neutral">Dùng chung</Badge>}
                                {u.mustChangePassword && <Badge tone="high">Chờ đổi mật khẩu</Badge>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {u.role === 'admin' ? (
                              <Badge tone="accent" icon={ShieldCheck}>Quản trị</Badge>
                            ) : (
                              <span className="text-sm text-ink-mid">Người dùng</span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {isLocked ? (
                              <Badge tone="crit" icon={Lock}>Đã khóa</Badge>
                            ) : (
                              <Badge tone="ok">Đang dùng</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm whitespace-nowrap text-ink-mid tabular-nums">
                            {lastSeen || <EmptyCell />}
                          </td>
                          <td className="px-3 py-2 text-right text-sm whitespace-nowrap text-ink-hi tabular-nums">
                            {fmtInt(u.sessions)}
                          </td>
                          <td className="py-2 pr-3 pl-3 text-sm whitespace-nowrap text-ink-mid">
                            {u.zaloLinked ? 'Đã nối' : <EmptyCell />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Điện thoại (< 640px): danh sách dòng kẻ, không thẻ lồng thẻ */}
              <div className="flex flex-col sm:hidden">
                {items.map((u) => {
                  const isSelected = selectedId === u.id;
                  const isLocked = u.status === 'locked';
                  const rowBg = isSelected ? 'bg-accent-dim' : isLocked ? 'bg-crit/8' : '';
                  const lastSeen = fmtLastLogin(u.lastLoginAt);
                  return (
                    <button
                      key={u.id}
                      ref={(el) => { if (!rowRefs.current[u.id]) rowRefs.current[u.id] = el; }}
                      type="button"
                      onClick={() => openDrawer(u.id)}
                      className={`flex w-full flex-col gap-1 border-b border-line-soft px-2 py-3 text-left transition-[background-color] duration-micro last:border-b-0 ${rowBg}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-ink-hi">
                          {u.name || u.email}
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {u.role === 'admin' && <Badge tone="accent" icon={ShieldCheck}>Quản trị</Badge>}
                          {isLocked ? (
                            <Badge tone="crit" icon={Lock}>Đã khóa</Badge>
                          ) : (
                            <Badge tone="ok">Đang dùng</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs text-ink-mid">{u.email}</span>
                        {u.isDemo && <Badge tone="neutral">Dùng chung</Badge>}
                        {u.mustChangePassword && <Badge tone="high">Chờ đổi mật khẩu</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-lo tabular-nums">
                        <span>Đăng nhập gần nhất {lastSeen || 'chưa có'}</span>
                        <span>{fmtInt(u.sessions)} phiên</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Pager
                page={page}
                pages={pages}
                total={total}
                pageSize={PAGE_SIZE}
                onChange={(p) => updateParam('page', p <= 1 ? '' : String(p))}
                unit="tài khoản"
                className="px-3"
              />
            </>
          )}
        </div>
      </GlassPanel>

      <AccountDrawer
        userId={selectedId}
        adminCount={counts.admin ?? 1}
        onClose={closeDrawer}
        onUserMutated={handleUserMutated}
        onNotify={notify}
      />

      <Toast show={toast.show} tone={toast.tone}>
        {toast.text}
      </Toast>
    </PageEnter>
  );
};

export default Accounts;
