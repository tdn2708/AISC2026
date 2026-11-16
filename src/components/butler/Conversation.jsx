import React, { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, SkeletonBlock, SkeletonLines } from '../ui';
import { Answer } from '../shell/ChatAnswer';
import TaskTickets from './TaskTickets';
import ConfirmBar from './ConfirmBar';

function formatHm(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * DANH SÁCH TIN NHẮN TRONG CUỘC TRÒ CHUYỆN QUẢN GIA (Conversation)
 * ==================================================================
 * Hiển thị lịch sử dùng chung giữa web và Zalo. Tin từ Zalo có ghi chú giờ;
 * phiếu việc đánh số hiện trực tiếp kèm nút thao tác.
 */
const Conversation = ({
  messages = [],
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onCommand,
  busy = false,
  workspaceEmpty = false
}) => {
  const navigate = useNavigate();
  const endRef = useRef(null);
  const prevLenRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevLenRef.current || busy) {
      endRef.current?.scrollIntoView({ block: 'end' });
    }
    prevLenRef.current = messages.length;
  }, [messages.length, busy]);

  const openFeedback = (text) => {
    navigate(`/feedbacks?q=${encodeURIComponent(String(text || '').slice(0, 40))}`);
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto py-4 pr-1">
      {workspaceEmpty && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-ctrl bg-accent-dim px-3.5 py-2.5 text-sm text-ink-hi"
        >
          <span>Kho này chưa có phản hồi nào nên chưa có gì để canh.</span>
          <Button as={Link} to="/dashboard" variant="link" size="sm">
            Xem cách có dữ liệu
          </Button>
        </div>
      )}

      {hasMore && (
        <div className="mb-4 flex justify-center">
          <Button
            variant="link"
            size="sm"
            loading={loadingMore}
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            Xem tin cũ hơn
          </Button>
        </div>
      )}

      {messages.length === 0 && !busy ? (
        <div className="my-auto py-8">
          <p className="max-w-[54ch] text-base leading-relaxed text-ink-mid">
            Chọn một lệnh bên dưới hoặc gõ câu hỏi.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {messages.map((m, idx) => {
            const isLast = idx === messages.length - 1;
            const reply = m.reply || {};
            const kind = reply.kind || m.kind;
            const taskCard = Array.isArray(reply.cards)
              ? reply.cards.find((c) => c.type === 'tasks')
              : null;
            const hm = formatHm(m.at);

            if (m.role === 'user') {
              return (
                <div key={m._id || idx} className="ml-10 flex flex-col items-end self-end">
                  <p className="rounded-ctrl bg-raised px-3.5 py-2 text-sm leading-relaxed text-ink-hi">
                    {m.text}
                  </p>
                  {m.channel === 'zalo' && hm && (
                    <span className="mt-1 text-xs tabular-nums text-ink-lo">
                      qua Zalo, {hm}
                    </span>
                  )}
                </div>
              );
            }

            return (
              <div key={m._id || idx} className="min-w-0">
                {kind === 'answer' ? (
                  <Answer msg={m} index={idx} onOpenFeedback={openFeedback} />
                ) : taskCard && Array.isArray(taskCard.items) && taskCard.items.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-ink-hi">
                      {String(m.text || '').split('\n')[0]}
                    </p>
                    <TaskTickets
                      items={taskCard.items}
                      onCommand={onCommand}
                      disabled={busy}
                    />
                  </div>
                ) : reply.confirm && isLast ? (
                  <ConfirmBar
                    confirm={reply.confirm}
                    promptText={m.text}
                    onCommand={onCommand}
                    busy={busy}
                  />
                ) : (
                  <p
                    className={`whitespace-pre-line text-sm leading-relaxed ${
                      kind === 'error' ? 'rounded-ctrl bg-crit/12 px-3 py-2 text-crit' : 'text-ink-hi'
                    }`}
                  >
                    {m.text}
                  </p>
                )}

                {m.channel === 'zalo' && hm && (
                  <p className="mt-1.5 text-xs tabular-nums text-ink-lo">
                    qua Zalo, {hm}
                  </p>
                )}
              </div>
            );
          })}

          {busy && (
            <SkeletonBlock label="Quản gia đang tính" className="flex max-w-[80%] flex-col gap-3">
              <SkeletonLines lines={2} />
            </SkeletonBlock>
          )}
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
};

export default Conversation;
