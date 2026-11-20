import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, RotateCcw, ScrollText, Server, Users } from 'lucide-react';
import { Button, EmptyState, GlassPanel, PanelHeader, ProgressBar, Skeleton, SkeletonBlock } from '../ui';
import { PageEnter } from '../motion';
import { adminError, getOverview } from '../../lib/admin';
import { fmtInt, fmtUptime } from '../../lib/format';
import { AuditRow } from './AuditLog';

/**
 * TỔNG QUAN MÁY CHỦ (/admin, mục 5.5).
 * Không dùng bốn ô thẻ số có biểu tượng và mũi tên xu hướng: dải "Máy chủ"
 * trình bày như bảng thông số thật, kèm sổ tóm tắt tài khoản và 8 dòng nhật ký gần nhất.
 */

const REFRESH_MS = 30000;

const memoryStatus = (rssMb, limitMb) => {
  if (rssMb == null || !limitMb) return null;
  const ratio = rssMb / limitMb;
  if (ratio > 0.85) return { ratio, tone: 'crit', label: 'Sắp tràn', textCls: 'text-crit' };
  if (ratio >= 0.7) return { ratio, tone: 'high', label: 'Gần đầy', textCls: 'text-high' };
  return { ratio, tone: 'ok', label: 'Ổn', textCls: 'text-ok' };
};

const butlerSummary = (butler) => {
  if (!butler) return 'Chưa đo được';
  if (!butler.enabled) return 'tắt';
  const z = butler.zalo;
  if (!z?.configured) return 'bật, chưa nối Zalo';
  return `bật, Zalo ${z.mode || 'poll'}`;
};

const MetricCell = ({ label, value, sub, valueClass = 'text-ink-hi' }) => (
  <div className="min-w-0">
    <p className="text-xs font-medium text-ink-mid">{label}</p>
    <p className={`mt-1.5 text-heading font-semibold tabular-nums tracking-tight ${valueClass}`}>{value}</p>
    {sub && <div className="mt-2">{sub}</div>}
  </div>
);

const Overview = () => {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, refreshing: false, error: '', data: null });

  const load = useCallback(async (silent = false) => {
    setState((s) => ({
      ...s,
      loading: !silent && !s.data,
      refreshing: silent || Boolean(s.data),
      error: silent ? s.error : ''
    }));
    try {
      const data = await getOverview();
      setState({ loading: false, refreshing: false, error: '', data });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        refreshing: false,
        error: adminError(err)
      }));
    }
  }, []);

  useEffect(() => {
    load(false);
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (document.querySelector('[role="dialog"]')) return;
      load(true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const server = state.data?.server;
  const accounts = state.data?.accounts;
  const recent = state.data?.recent || [];
  const mem = server ? memoryStatus(server.rssMb, server.rssLimitMb) : null;

  return (
    <PageEnter className="flex flex-col gap-6">
      {/* Khối 1: Máy chủ */}
      <GlassPanel tone="strong" className="p-5 sm:p-6">
        <PanelHeader
          icon={Server}
          title="Máy chủ"
          subtitle="Thông số vận hành hiện tại của tiến trình backend."
          right={
            <Button
              variant="secondary"
              size="sm"
              icon={RotateCcw}
              loading={state.refreshing}
              onClick={() => load(false)}
            >
              Làm mới
            </Button>
          }
        />

        {state.loading ? (
          <SkeletonBlock label="Đang tải thông số máy chủ" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </SkeletonBlock>
        ) : state.error && !server ? (
          <EmptyState
            variant="error"
            compact
            title="Không tải được thông số máy chủ"
            description={state.error}
            action={<Button variant="secondary" size="sm" onClick={() => load(false)}>Thử lại</Button>}
          />
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCell
                label="Chạy liên tục"
                value={fmtUptime(server?.uptimeSec)}
              />
              <MetricCell
                label="Bộ nhớ"
                value={
                  server?.rssMb != null && server?.rssLimitMb
                    ? `${fmtInt(server.rssMb)} / ${fmtInt(server.rssLimitMb)} MB`
                    : 'Chưa đo được'
                }
                sub={
                  mem && (
                    <div className="flex flex-col gap-1">
                      <ProgressBar value={mem.ratio} tone={mem.tone} />
                      <span className={`text-xs font-medium ${mem.textCls}`}>{mem.label}</span>
                    </div>
                  )
                }
              />
              <MetricCell
                label="Độ trễ xử lý"
                value={server?.loopDelayMs != null ? `${fmtInt(Math.round(server.loopDelayMs))} ms` : 'Chưa đo được'}
              />
              <MetricCell
                label="Lỗi 5 phút"
                value={server?.errors5m != null ? fmtInt(server.errors5m) : 'Chưa đo được'}
                valueClass={server?.errors5m > 0 ? 'text-crit' : 'text-ink-hi'}
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-t border-line-soft pt-3 text-xs text-ink-mid">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
                <span>Node {server?.node || 'Chưa đo được'}</span>
                {server?.commit && <span>Bản {server.commit}</span>}
              </div>
              <span>Quản gia: {butlerSummary(server?.butler)}</span>
            </div>
          </>
        )}
      </GlassPanel>

      {/* Khối 2 & 3: Tài khoản và Việc quản trị gần đây */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassPanel tone="strong" className="flex flex-col justify-between p-5 sm:p-6">
          <div>
            <PanelHeader icon={Users} title="Tài khoản" />
            {state.loading ? (
              <SkeletonBlock label="Đang tải tóm tắt tài khoản" className="flex flex-col gap-3">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-52" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-36" />
              </SkeletonBlock>
            ) : state.error && !accounts ? (
              <EmptyState
                variant="error"
                compact
                title="Không tải được số liệu tài khoản"
                description={state.error}
                action={<Button variant="secondary" size="sm" onClick={() => load(false)}>Thử lại</Button>}
              />
            ) : (
              <div className="flex flex-col gap-2.5 text-sm text-ink-mid">
                <p className="text-display font-semibold tabular-nums text-ink-hi">
                  {accounts?.total != null ? `${fmtInt(accounts.total)} tài khoản` : 'Chưa đo được'}
                </p>
                <p className="tabular-nums">
                  {accounts?.active7d != null ? `${fmtInt(accounts.active7d)} đăng nhập trong 7 ngày` : 'Chưa đo được'}
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 tabular-nums">
                  <span className={accounts?.locked > 0 ? 'font-medium text-crit' : ''}>
                    {accounts?.locked != null ? `${fmtInt(accounts.locked)} đang khóa` : 'Chưa đo được'}
                  </span>
                  <span>
                    {accounts?.admins != null ? `${fmtInt(accounts.admins)} quản trị viên` : 'Chưa đo được'}
                  </span>
                </div>
                <p className="tabular-nums">
                  {accounts?.openSessions != null ? `${fmtInt(accounts.openSessions)} phiên đang mở` : 'Chưa đo được'}
                </p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin/users')}>
              Xem sổ tài khoản
            </Button>
          </div>
        </GlassPanel>

        <GlassPanel tone="strong" className="flex flex-col justify-between p-5 sm:p-6">
          <div>
            <PanelHeader icon={ScrollText} title="Việc quản trị gần đây" />
            <div className="paper">
              {state.loading ? (
                <SkeletonBlock label="Đang tải việc quản trị gần đây" className="flex flex-col divide-y divide-line-soft px-2">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 py-2.5">
                      <Skeleton className="h-4 w-44" />
                      <Skeleton className="h-3.5 w-24" />
                    </div>
                  ))}
                </SkeletonBlock>
              ) : state.error && !state.data ? (
                <EmptyState
                  variant="error"
                  compact
                  title="Không tải được nhật ký gần đây"
                  description={state.error}
                  action={<Button variant="secondary" size="sm" onClick={() => load(false)}>Thử lại</Button>}
                />
              ) : recent.length === 0 ? (
                <EmptyState
                  variant="empty"
                  compact
                  title="Chưa có thao tác quản trị nào."
                />
              ) : (
                <div>
                  {recent.map((item) => (
                    <AuditRow
                      key={item.id}
                      item={item}
                      compact
                      showActor={false}
                      onOpenUser={(uid) => navigate(`/admin/users/${encodeURIComponent(uid)}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin/audit')}>
              Xem toàn bộ nhật ký
            </Button>
          </div>
        </GlassPanel>
      </div>

      {/* Khối 4: Kho dữ liệu */}
      <GlassPanel tone="strong" className="p-5 sm:p-6">
        <PanelHeader icon={Database} title="Kho dữ liệu" />
        {state.loading ? (
          <SkeletonBlock label="Đang tải số liệu kho dữ liệu" className="grid gap-6 sm:grid-cols-2">
            <Skeleton className="h-7 w-44" />
            <Skeleton className="h-7 w-44" />
          </SkeletonBlock>
        ) : state.error && !server ? (
          <EmptyState
            variant="error"
            compact
            title="Không tải được thông tin kho dữ liệu"
            description={state.error}
            action={<Button variant="secondary" size="sm" onClick={() => load(false)}>Thử lại</Button>}
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <MetricCell
              label="Mô phỏng"
              value={server?.workspaces?.demo != null ? `${fmtInt(server.workspaces.demo)} phản hồi` : 'Chưa đo được'}
            />
            <MetricCell
              label="Thật"
              value={server?.workspaces?.real != null ? `${fmtInt(server.workspaces.real)} phản hồi` : 'Chưa đo được'}
            />
          </div>
        )}
      </GlassPanel>
    </PageEnter>
  );
};

export default Overview;
