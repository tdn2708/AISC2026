import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { PenLine, Copy, Check, RotateCcw } from 'lucide-react';
import { Button, Segmented } from '../ui';

/**
 * SOẠN NHÁP TRẢ LỜI KHÁCH
 * ------------------------------------------------------------------
 * Mô hình ngôn ngữ viết nháp theo đúng vấn đề khách nêu và hướng xử lý đã
 * được duyệt (nếu có); không được hứa hoàn tiền hay mã giảm giá khi chưa có
 * ai duyệt. Nhân viên sửa rồi tự gửi — hệ thống không gửi gì cho khách.
 */
const TONES = [
  { value: 'formal', label: 'Trang trọng' },
  { value: 'friendly', label: 'Thân thiện' }
];

const ReplyDraft = ({ feedbackId }) => {
  const [tone, setTone] = useState('formal');
  const [draft, setDraft] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Mở phản hồi khác thì bỏ bản nháp cũ
  useEffect(() => {
    setDraft(null);
    setText('');
    setError(null);
  }, [feedbackId]);

  const generate = async (t = tone) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post('/reply/draft', { feedbackId, tone: t });
      setDraft(data);
      setText(data.text);
    } catch {
      setError('Không soạn được nháp. Thử lại sau ít phút.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Trình duyệt không cho sao chép. Hãy chọn chữ và sao chép tay.');
    }
  };

  return (
    <div className="border-t border-line-soft pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink-hi">Trả lời khách</h3>
        <Segmented
          label="Giọng văn"
          options={TONES}
          value={tone}
          onChange={(v) => {
            setTone(v);
            if (draft) generate(v);
          }}
        />
      </div>

      {!draft ? (
        <div className="mt-3">
          <Button size="sm" icon={PenLine} loading={loading} onClick={() => generate()}>Soạn nháp</Button>
          <p className="mt-2 text-xs leading-relaxed text-ink-lo">
            Nháp bám đúng vấn đề khách nêu và chỉ nhắc tới hướng xử lý đã được duyệt. Bạn đọc, sửa rồi tự gửi trên sàn.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            aria-label="Nội dung trả lời"
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink-hi outline-none focus:border-accent focus:ring-4 focus:ring-accent-dim"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" icon={copied ? Check : Copy} onClick={copy}>{copied ? 'Đã sao chép' : 'Sao chép'}</Button>
            <Button size="sm" variant="ghost" icon={RotateCcw} loading={loading} onClick={() => generate()}>Soạn lại</Button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-lo">
            {draft.provider === 'template' ? 'Soạn theo mẫu có sẵn (mô hình ngôn ngữ đang không dùng được).' : 'Mô hình ngôn ngữ soạn nháp.'}{' '}
            {draft.grounding?.plan ? `Dựa trên hướng xử lý đã duyệt: ${draft.grounding.plan}` : 'Chưa có hướng xử lý được duyệt cho vấn đề này, nên nháp không hứa hẹn gì.'}
          </p>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-crit">{error}</p>}
    </div>
  );
};

export default ReplyDraft;
