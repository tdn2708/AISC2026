import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { Radio, Trash2, ChevronRight } from 'lucide-react';
import { PageHeader, GlassPanel, PanelHeader, Button, IconButton, Badge, EmptyState, Modal } from './ui';
import { fmtInt, fmtDateTime, fmtPct } from '../lib/format';
import StartSession from './live/StartSession';
import LiveConsole from './live/LiveConsole';
import { StatusPill, PLATFORM_LABEL, duration } from './live/shared';

/**
 * LIVESTREAM — trang theo dõi phiên live bán hàng
 * ------------------------------------------------------------------
 * Không có ?session: danh sách phiên đã và đang chạy, nút mở phiên mới.
 * Có ?session=<id>: bảng điều khiển của phiên đó. Link chia sẻ được, mở lại
 * sau khi tải lại trang vẫn đúng phiên.
 */

const SessionList = ({ sessions, onOpen, onDeleted, empty }) => {
  const [confirm, setConfirm] = useState(null);
  if (!sessions.length) {
    return empty || <EmptyState title="Chưa có phiên live nào" description="Mở phiên đầu tiên để bắt đầu thu bình luận." />;
  }
  return (
    <ul className="flex list-none flex-col">
      {sessions.map((s) => {
        const sm = s.summary;
        return (
          <li key={s.id} className="flex items-center gap-3 border-b border-line-soft py-3 last:border-0">
            <button type="button" onClick={() => onOpen(s.id)} className="flex min-w-0 flex-1 items-center gap-4 rounded-ctrl text-left hover:bg-raised/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink-hi">{s.title}</span>
                  <StatusPill status={s.status} />
                  {s.simulated && <Badge tone="sky">Mô phỏng</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-ink-lo">
                  {PLATFORM_LABEL[s.platform]}, {fmtDateTime(s.startedAt || s.createdAt)}
                  {s.startedAt && s.endedAt ? `, ${duration(s.startedAt, s.endedAt)}` : ''}
                </p>
              </div>
              {sm && (
                <dl className="hidden shrink-0 grid-cols-4 gap-5 text-right sm:grid">
                  <div><dt className="text-xs text-ink-lo">Bình luận</dt><dd className="tabular-nums text-sm text-ink-hi">{fmtInt(sm.comments)}</dd></div>
                  <div><dt className="text-xs text-ink-lo">Chốt đơn</dt><dd className="tabular-nums text-sm text-ink-hi">{fmtInt(sm.byIntent?.order)}</dd></div>
                  <div><dt className="text-xs text-ink-lo">Khiếu nại</dt><dd className={`tabular-nums text-sm ${sm.byIntent?.complaint ? 'text-crit' : 'text-ink-hi'}`}>{fmtInt(sm.byIntent?.complaint)}</dd></div>
                  <div><dt className="text-xs text-ink-lo">Đã trả lời</dt><dd className="tabular-nums text-sm text-ink-hi">{sm.answeredShare != null ? fmtPct(sm.answeredShare, 0) : '—'}</dd></div>
                </dl>
              )}
              <ChevronRight size={16} className="shrink-0 text-ink-lo" aria-hidden="true" />
            </button>
            {s.simulated && (
              <IconButton icon={Trash2} variant="danger" size="sm" label={`Xóa phiên ${s.title}`} onClick={() => setConfirm(s)} />
            )}
          </li>
        );
      })}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        icon={Trash2}
        tone="crit"
        size="sm"
        title="Xóa phiên mô phỏng này cùng toàn bộ bình luận của nó?"
        description={confirm?.title}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Hủy</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={async () => {
                const s = confirm;
                setConfirm(null);
                await axios.delete(`/live/sessions/${s.id}`);
                onDeleted();
              }}
            >
              Xóa phiên
            </Button>
          </>
        }
      />
    </ul>
  );
};

const Live = () => {
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('session');
  const [sessions, setSessions] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    axios.get('/live/sessions').then((r) => {
      setSessions(r.data.sessions);
      setError(null);
    }).catch((e) => setError(e.response?.data?.error || 'Không tải được danh sách phiên. Tải lại trang, hoặc kiểm tra mạng.'));
  }, []);

  useEffect(() => {
    if (!sessionId) load();
  }, [sessionId, load]);

  const open = (id) => setParams({ session: id });

  if (sessionId) {
    return <div className="cx"><LiveConsole key={sessionId} sessionId={sessionId} onBack={() => setParams({})} /></div>;
  }

  const running = (sessions || []).filter((s) => ['live', 'connecting', 'reconnecting'].includes(s.status));

  return (
    <div className="cx">
      <PageHeader
        title="Livestream"
        subtitle="Thu bình luận trực tiếp từ phiên live bán hàng. Câu hỏi được gom kèm gợi ý trả lời, khách chốt đơn được ghi lại, khiếu nại được đẩy lên đầu."
        actions={!starting && <Button icon={Radio} onClick={() => setStarting(true)}>Mở phiên live</Button>}
      />

      {starting && (
        <div className="mb-6">
          <StartSession onStarted={(s) => open(s.id)} onCancel={() => setStarting(false)} />
        </div>
      )}

      {running.length > 0 && !starting && (
        <GlassPanel tone="strong" glow="crit" className="mb-4 p-4 sm:p-5">
          <PanelHeader title="Đang live" />
          <SessionList sessions={running} onOpen={open} onDeleted={load} />
        </GlassPanel>
      )}

      <GlassPanel tone="strong" className="p-4 sm:p-5">
        <PanelHeader title={running.length ? "Các phiên đã kết thúc" : "Các phiên live"} subtitle="Bình luận đã chuẩn hóa của mọi phiên được lưu lại, mở lại và xuất được bất cứ lúc nào." />
        {error ? (
          <EmptyState variant="error" compact title={error} />
        ) : sessions === null ? (
          <div className="h-24 animate-pulse rounded-ctrl bg-raised" />
        ) : (
          <SessionList
            sessions={sessions.filter((s) => !running.includes(s))}
            onOpen={open}
            onDeleted={load}
            // Đang có phiên chạy ở trên thì ô này không được nói "chưa có phiên nào"
            empty={running.length ? <p className="py-4 text-sm text-ink-mid">Chưa có phiên nào kết thúc. Khi phiên đang live kết thúc, báo cáo sau phiên sẽ nằm ở đây.</p> : null}
          />
        )}
      </GlassPanel>
    </div>
  );
};

export default Live;
