import React, { useState } from 'react';
import axios from 'axios';
import { Upload, Send, Copy, Check } from 'lucide-react';
import { Button, TextArea } from '../ui';
import { API_URL } from '../../config';
import { getWorkspace } from '../../lib/workspace';

/**
 * NHẬP BÌNH LUẬN TỪ NGUỒN KHÁC
 *   Dán: mỗi dòng một bình luận, có thể kèm tên "tên: nội dung"
 *   Tệp CSV: tác giả, nội dung, thời gian (Facebook, Shopee Live xuất sau phiên)
 *   Webhook: công cụ khác (tiện ích trình duyệt, phần mềm quản lý live) gửi
 *   POST kèm khóa nhập của phiên
 */

const parseLines = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
  const m = l.match(/^@?([\w.\-À-ỹ ]{1,40}):\s+(.+)$/u);
  return m ? { author: m[1].trim(), text: m[2] } : { text: l };
});

const ManualInput = ({ session, onDone }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const endpoint = `${API_URL.startsWith('http') ? API_URL : window.location.origin + API_URL}/live/sessions/${session.id}/comments`;

  const send = async (body) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await axios.post(`/live/sessions/${session.id}/comments`, { ...body, key: session.ingestKey });
      setResult({ ok: true, msg: `Đã nhận ${r.data.accepted} bình luận${r.data.duplicates ? `, bỏ ${r.data.duplicates} câu trùng` : ''}.` });
      setText('');
      onDone?.();
    } catch (e) {
      setResult({ ok: false, msg: e.response?.data?.error || 'Không gửi được bình luận. Kiểm tra mạng rồi gửi lại.' });
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const content = await f.text();
    e.target.value = '';
    await send({ csv: content });
  };

  const curl = `curl -X POST "${endpoint}" -H "Content-Type: application/json" -H "X-Workspace: ${getWorkspace()}" -H "X-Ingest-Key: ${session.ingestKey}" -d '{"comments":[{"author":"khach01","text":"giá bao nhiêu shop","id":"msg-1"}]}'`;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <TextArea
          label="Dán bình luận"
          hint='Mỗi dòng một bình luận. Có thể ghi kèm tên: "linh.nguyen: còn size M không"'
          rows={7}
          maxLength={200000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" icon={Send} loading={busy} disabled={!text.trim()} onClick={() => send({ comments: parseLines(text) })}>Gửi vào phiên</Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-ctrl border border-line bg-surface px-3 text-xs font-semibold text-ink-hi hover:bg-raised">
            <Upload size={14} aria-hidden="true" />
            Nhập tệp CSV
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={onFile} />
          </label>
        </div>
        <p className="mt-1.5 text-xs text-ink-lo">Tệp CSV gồm các cột: tác giả, nội dung, thời gian. Dòng tiêu đề có hay không đều được.</p>
        {result && <p role="status" className={`mt-2 text-sm ${result.ok ? 'text-ok' : 'text-crit'}`}>{result.msg}</p>}
      </section>

      <section className="border-t border-line-soft pt-5">
        <h3 className="text-sm font-semibold text-ink-hi">Gửi tự động qua webhook</h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-lo">Công cụ khác gửi bình luận vào phiên này bằng lệnh dưới đây. Giữ kín khóa nhập: ai có khóa đều gửi được bình luận vào phiên.</p>
        <pre className="mt-2 overflow-x-auto rounded-ctrl bg-raised p-3 font-code text-xs leading-relaxed whitespace-pre-wrap break-all text-ink-mid">{curl}</pre>
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          icon={copied ? Check : Copy}
          onClick={async () => { try { await navigator.clipboard.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* trình duyệt chặn */ } }}
        >
          {copied ? 'Đã chép' : 'Chép lệnh'}
        </Button>
      </section>
    </div>
  );
};

export default ManualInput;
