import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Trash2 } from 'lucide-react';
import { GlassPanel, PanelHeader, Button, IconButton, TextField } from '../ui';
import { fmtDateTime } from '../../lib/format';
import { getWorkspace } from '../../lib/workspace';

/**
 * THEO DÕI KÊNH (backend/services/live/follow.js). Lưu kênh TikTok của shop; máy chủ hỏi
 * định kỳ kênh có đang live không và tự mở phiên đọc bình luận, nên không lỡ phiên nào.
 * Danh mục hàng lấy theo phiên gần nhất của cùng kênh. Chỉ có ở kho Dữ liệu thật.
 */
const stateOf = (f) => {
  if (f.backoffUntil && new Date(f.backoffUntil) > new Date()) return `TikTok tạm chặn, hỏi lại sau ${fmtDateTime(f.backoffUntil)}`;
  if (f.lastStartedAt) return `Tự mở phiên gần nhất lúc ${fmtDateTime(f.lastStartedAt)}`;
  if (f.lastCheckAt) return `Kiểm lúc ${fmtDateTime(f.lastCheckAt)}: ${f.lastLive ? 'đang live' : 'chưa live'}`;
  return 'Chưa kiểm lần nào';
};

const Follows = () => {
  const [list, setList] = useState(null);
  const [every, setEvery] = useState(10);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/live/follows');
      setList(data.follows || []);
      if (data.everyMin) setEvery(data.everyMin);
    } catch {
      setList([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (getWorkspace() !== 'real') return null;

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await axios.post('/live/follows', { target });
      setTarget('');
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || 'Chưa lưu được kênh. Thử lại sau ít phút.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id) => {
    await axios.delete(`/live/follows/${id}`).catch(() => {});
    load();
  };

  return (
    <GlassPanel tone="strong" className="mt-4 p-4 sm:p-5">
      <PanelHeader title="Theo dõi kênh" subtitle={`Kênh lên live là tự mở phiên đọc bình luận. Kiểm mỗi ${every} phút.`} />
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <TextField label="Tài khoản TikTok" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="@tenshop" error={error || undefined} />
        </div>
        <Button type="submit" variant="secondary" loading={busy} disabled={!target.trim()}>Theo dõi</Button>
      </form>
      {list && list.length > 0 && (
        <ul className="mt-4 flex flex-col">
          {list.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-4 border-b border-line-soft py-3 last:border-b-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-hi">@{f.target}</p>
                <p className="text-xs text-ink-mid">{stateOf(f)}{f.products ? `, danh mục ${f.products} sản phẩm` : ''}</p>
              </div>
              <IconButton icon={Trash2} variant="ghost" size="sm" label={`Bỏ theo dõi @${f.target}`} onClick={() => remove(f.id)} />
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  );
};

export default Follows;
