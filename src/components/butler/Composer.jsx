import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Chip, IconButton, fieldClass } from '../ui';

const QUICK_COMMANDS = [
  { label: 'Việc hôm nay', cmd: 'việc' },
  { label: 'Tình hình', cmd: 'tình hình' },
  { label: 'Livestream', cmd: 'live' },
  { label: 'Tạm im 2 giờ', cmd: 'im 2 giờ' },
  { label: 'Lệnh', cmd: 'giúp' }
];

/**
 * THANH NHẬP LỆNH VÀ HÀNG LỆNH NHANH (Composer)
 * ==================================================================
 * Dính đáy cột trò chuyện, ô nhập cỡ chữ 16px (text-base) để trình duyệt di động
 * không tự phóng to khi chạm.
 */
const Composer = ({ onSend, busy = false }) => {
  const [input, setInput] = useState('');
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 639px)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = (e) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const submit = () => {
    const t = String(input || '').trim();
    if (!t || busy) return;
    setInput('');
    onSend?.(t);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      submit();
    }
  };

  const lineCount = Math.min(4, Math.max(1, input.split('\n').length));

  return (
    <div className="border-t border-line-soft pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        role="group"
        aria-label="Lệnh nhanh"
        className="scroll-hint-x mb-2.5 flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]"
      >
        {QUICK_COMMANDS.map((q) => (
          <Chip
            key={q.cmd}
            disabled={busy}
            onClick={() => onSend?.(q.cmd)}
          >
            {q.label}
          </Chip>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={lineCount}
          placeholder={narrow ? 'Hỏi hoặc ra lệnh' : 'Hỏi hoặc ra lệnh, ví dụ: việc hôm nay'}
          aria-label="Nhập lệnh hoặc câu hỏi cho quản gia"
          className={`${fieldClass({ multiline: true })} min-h-11 flex-1 resize-none px-3 py-2 text-base leading-normal`}
        />
        <IconButton
          icon={ArrowUp}
          variant="primary"
          size={44}
          label="Gửi"
          disabled={busy || !input.trim()}
          onClick={submit}
        />
      </div>
    </div>
  );
};

export default Composer;
