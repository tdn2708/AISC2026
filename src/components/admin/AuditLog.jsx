import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { Badge, Button, ChipGroup, EmptyState, GlassPanel, Pager, PanelHeader, Skeleton, SkeletonBlock } from '../ui';
import { PageEnter } from '../motion';
import { AUDIT_FILTER_OPTIONS, adminError, auditActionLabel, auditActionTone, getAudit } from '../../lib/admin';
import { fmtDateTime } from '../../lib/format';

/**
 * MỘT DÒNG NHẬT KÝ QUẢN TRỊ — dùng chung ở Tổng quan, Ngăn kéo chi tiết và màn Nhật ký.
 */
export const AuditRow = ({ item, onOpenUser, showActor = true, showTarget = true, compact = false }) => {
  const actor = item.adminEmail || item.actorEmail || '';
  const reason = item.detail?.reason || item.reason || '';
  const canOpenTarget = Boolean(
    showTarget &&
    onOpenUser &&
    item.targetId &&
    item.targetEmail &&
    item.action !== 'delete_user'
  );

  return (
    <div className={`border-b border-line-soft last:border-b-0 ${compact ? 'px-2 py-2.5' : 'px-3 py-3'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Badge tone={auditActionTone(item.action)}>{auditActionLabel(item)}</Badge>
          {showTarget && item.targetEmail && (
            canOpenTarget ? (
              <button
                type="button"
                onClick={() => onOpenUser(item.targetId)}
                className="truncate rounded-ctrl text-sm font-medium text-accent-hi underline-offset-2 hover:text-accent hover:underline"
              >
                {item.targetEmail}
              </button>
            ) : (
              <span className="truncate text-sm font-medium text-ink-hi">{item.targetEmail}</span>
            )
          )}
        </div>
        <span className="shrink-0 text-xs text-ink-lo tabular-nums">{fmtDateTime(item.at)}</span>
      </div>

      {((showActor && actor) || reason) && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs text-ink-mid">
          {showActor && actor && (
            <span>Người thực hiện: <span className="text-ink-hi">{actor}</span></span>
          )}
          {reason && (
            <span className="text-ink-mid">Lý do: “{reason}”</span>
          )}
        </div>
      )}
    </div>
  );
};

const PAGE_SIZE = 20;

const AuditLog = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const action = searchParams.get('action') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const [state, setState] = useState({ loading: true, error: '', data: null });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await getAudit({
        page,
        limit: PAGE_SIZE,
        ...(action ? { action } : {})
      });
      setState({ loading: false, error: '', data });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: adminError(err) }));
    }
  }, [action, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setFilter = (nextAction) => {
    const next = new URLSearchParams();
    if (nextAction) next.set('action', nextAction);
    setSearchParams(next);
  };

  const setPage = (nextPage) => {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete('page');
    else next.set('page', String(nextPage));
    setSearchParams(next);
  };

  const openUser = (uid) => navigate(`/admin/users/${encodeURIComponent(uid)}`);

  const items = state.data?.items || [];
  const total = state.data?.total || 0;
  const pages = state.data?.pages || 1;

  return (
    <PageEnter className="flex flex-col gap-5">
      <GlassPanel tone="strong" className="p-5 sm:p-6">
        <PanelHeader
          icon={ScrollText}
          title="Nhật ký quản trị"
          subtitle="Mọi thao tác quản trị được lưu 180 ngày, xếp mới nhất ở trên."
        />

        <div className="mb-4">
          <ChipGroup
            label="Lọc theo thao tác"
            options={AUDIT_FILTER_OPTIONS}
            value={action}
            onChange={setFilter}
          />
        </div>

        <div className="paper">
          {state.loading ? (
            <SkeletonBlock label="Đang tải nhật ký quản trị" className="flex flex-col divide-y divide-line-soft px-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-3.5 w-28" />
                </div>
              ))}
            </SkeletonBlock>
          ) : state.error ? (
            <EmptyState
              variant="error"
              title="Không tải được nhật ký"
              description={state.error}
              action={<Button variant="secondary" size="sm" onClick={load}>Thử lại</Button>}
            />
          ) : items.length === 0 ? (
            <EmptyState
              variant="empty"
              title={action ? 'Không có dòng nhật ký nào khớp' : 'Chưa có thao tác quản trị nào.'}
              description={action ? 'Thử bỏ lọc để xem toàn bộ lịch sử thao tác.' : 'Khi có thao tác đăng nhập quản trị, khóa, đặt lại mật khẩu hay xóa tài khoản, dòng ghi sẽ hiện tại đây.'}
              action={action ? <Button variant="secondary" size="sm" onClick={() => setFilter('')}>Xóa bộ lọc</Button> : null}
            />
          ) : (
            <>
              <div>
                {items.map((item) => (
                  <AuditRow key={item.id} item={item} onOpenUser={openUser} />
                ))}
              </div>
              <Pager
                page={page}
                pages={pages}
                total={total}
                pageSize={PAGE_SIZE}
                onChange={setPage}
                unit="dòng"
                className="px-3"
              />
            </>
          )}
        </div>
      </GlassPanel>
    </PageEnter>
  );
};

export default AuditLog;
