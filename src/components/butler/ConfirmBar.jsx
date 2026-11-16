import React, { useState } from 'react';
import { Button } from '../ui';

/**
 * THANH XÁC NHẬN LỆNH GHI (ConfirmBar)
 * ==================================================================
 * Mọi lệnh ghi (chấp nhận kế hoạch, bỏ qua đề xuất, chạy thu thập) đều hỏi lại
 * trước khi thực hiện. Chỉ hiện ở tin nhắn cuối cùng khi đang chờ xác nhận.
 */
const ConfirmBar = ({ confirm, promptText, onCommand, busy = false }) => {
  const [sendingChoice, setSendingChoice] = useState(null);
  if (!confirm) return null;

  const handleChoice = async (choice, cmdText) => {
    setSendingChoice(choice);
    try {
      await onCommand?.(cmdText);
    } finally {
      setSendingChoice(null);
    }
  };

  return (
    <div className="paper mt-3 rounded-ctrl p-3">
      {(confirm.prompt || promptText) && (
        <p className="text-sm font-medium leading-relaxed text-ink-hi">
          {confirm.prompt || promptText}
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          loading={busy && sendingChoice === 'yes'}
          disabled={busy}
          onClick={() => handleChoice('yes', 'có')}
        >
          {confirm.yes || 'Xác nhận'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          loading={busy && sendingChoice === 'no'}
          disabled={busy}
          onClick={() => handleChoice('no', 'thôi')}
        >
          {confirm.no || 'Thôi'}
        </Button>
      </div>
    </div>
  );
};

export default ConfirmBar;
