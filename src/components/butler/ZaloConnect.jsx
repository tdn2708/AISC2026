import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { Modal, Button } from '../ui';
import { createLinkCode, getStatus } from '../../lib/butler';

function formatCountdown(expiresAt, nowMs) {
  if (!expiresAt) return '';
  const diffSec = Math.floor((new Date(expiresAt).getTime() - nowMs) / 1000);
  if (diffSec <= 0) return 'Mã đã hết hạn';
  if (diffSec >= 60) {
    return `Mã còn ${Math.ceil(diffSec / 60)} phút`;
  }
  return `Mã còn ${diffSec} giây`;
}

/**
 * HỘP THOẠI NỐI TÀI KHOẢN VỚI ZALO (ZaloConnect)
 * ==================================================================
 * Sinh mã 6 chữ số có hạn 10 phút, hiển thị 3 bước trình tự thật và tự kiểm
 * trạng thái kết nối mỗi 4 giây để đóng hộp thoại ngay khi chủ shop nhắn mã.
 */
const ZaloConnect = ({ open, onClose, defaultBotName, onLinked }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [codeData, setCodeData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const fetchCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const data = await createLinkCode();
      setCodeData(data);
      setNowMs(Date.now());
    } catch (e) {
      setError(e.response?.data?.error || 'Không lấy được mã nối Zalo. Thử lại sau ít phút.');
      setCodeData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setCodeData(null);
      setError(null);
      return;
    }
    fetchCode();
  }, [open, fetchCode]);

  const rawCode = String(codeData?.code || '');
  const groupedCode = rawCode.length === 6 ? `${rawCode.slice(0, 3)} ${rawCode.slice(3)}` : rawCode;
  const expired = Boolean(
    codeData?.expiresAt && new Date(codeData.expiresAt).getTime() <= nowMs
  );
  const botName = codeData?.botName || defaultBotName || 'bot của shop';

  useEffect(() => {
    if (!open || !codeData?.expiresAt || expired) return undefined;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [open, codeData?.expiresAt, expired]);

  useEffect(() => {
    if (!open || !codeData?.code || expired) return undefined;
    const poll = setInterval(async () => {
      try {
        const st = await getStatus();
        if (st?.link?.linked) {
          onLinked?.(st);
        }
      } catch {
        // bỏ qua lỗi mạng tạm thời trong lúc chờ
      }
    }, 4000);
    return () => clearInterval(poll);
  }, [open, codeData?.code, expired, onLinked]);

  const copyCode = async () => {
    if (!rawCode) return;
    try {
      await navigator.clipboard?.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // trình duyệt chặn clipboard thì người dùng nhìn số gõ tay
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nối Zalo của bạn"
      description="Nhận báo sự cố 24/7 và ra lệnh cho quản gia ngay từ ứng dụng Zalo."
      footer={
        <Button variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      {error ? (
        <div className="rounded-ctrl bg-crit/12 px-3.5 py-3 text-sm leading-relaxed text-crit">
          <p>{error}</p>
        </div>
      ) : (
        <ol className="flex list-none flex-col gap-4 text-sm leading-relaxed text-ink-hi">
          <li className="flex gap-3">
            <span className="font-semibold tabular-nums text-ink-hi">1.</span>
            <span>
              Mở Zalo, tìm <strong className="font-semibold">{botName}</strong> (hoặc quét mã QR bot trong Zalo Bot Manager).
            </span>
          </li>

          <li className="flex flex-col gap-2">
            <div className="flex gap-3">
              <span className="font-semibold tabular-nums text-ink-hi">2.</span>
              <span>Gửi mã này cho bot:</span>
            </div>

            <div className="paper ml-6 flex flex-wrap items-center justify-between gap-3 rounded-ctrl px-4 py-3">
              <div>
                <p className="text-metric font-semibold tracking-wider tabular-nums text-ink-hi">
                  {loading ? '— —' : groupedCode || '—'}
                </p>
                {codeData?.expiresAt && (
                  <p className={`mt-1 text-xs tabular-nums ${expired ? 'text-crit' : 'text-ink-lo'}`}>
                    {formatCountdown(codeData.expiresAt, nowMs)}
                  </p>
                )}
              </div>

              {expired ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={RefreshCw}
                  loading={loading}
                  onClick={fetchCode}
                >
                  Lấy mã mới
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={copied ? Check : Copy}
                  disabled={loading || !rawCode}
                  onClick={copyCode}
                >
                  {copied ? 'Đã chép' : 'Chép mã'}
                </Button>
              )}
            </div>
          </li>

          <li className="flex gap-3">
            <span className="font-semibold tabular-nums text-ink-hi">3.</span>
            <span>Bot nhắn lại “Đã nối” là xong.</span>
          </li>
        </ol>
      )}
    </Modal>
  );
};

export default ZaloConnect;
