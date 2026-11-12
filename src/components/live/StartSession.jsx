import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Radio } from 'lucide-react';
import { GlassPanel, PanelHeader, RadioCards, TextField, Button, Segmented } from '../ui';
import CatalogEditor, { toRow, fromRow } from './CatalogEditor';
import { getWorkspace } from '../../lib/workspace';

/**
 * MỞ PHIÊN LIVE
 * TikTok: nhập tên tài khoản đang live (của shop mình hay của đối thủ, bình
 * luận công khai). YouTube: liên kết video đang live. Nhập tay: phiên không
 * nối nền tảng nào, bình luận đến từ ô dán, tệp CSV xuất sau live (Facebook,
 * Shopee Live) hoặc webhook. Mô phỏng: chỉ có ở kho demo.
 */

const PLATFORM_DESC = {
  tiktok: 'Nối vào phiên đang live bằng tên tài khoản, đọc bình luận công khai',
  youtube: 'Đọc trò chuyện trực tiếp qua YouTube Data API',
  manual: 'Dán bình luận, nhập tệp CSV sau live, hoặc gửi qua webhook',
  simulator: 'Phát lại nhịp một phiên megalive 11.11 để trình diễn'
};

const StartSession = ({ onStarted, onCancel }) => {
  const [meta, setMeta] = useState(null);
  const [platform, setPlatform] = useState(getWorkspace() === 'demo' ? 'simulator' : 'tiktok');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [catalogMode, setCatalogMode] = useState('sample');
  const [rows, setRows] = useState([]);
  const [policy, setPolicy] = useState({});
  const [speed, setSpeed] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get('/live/platforms').then((r) => {
      setMeta(r.data);
      setRows(r.data.sample.products.map(toRow));
      setPolicy(r.data.sample.policy);
    }).catch(() => setError('Không tải được cấu hình livestream. Tải lại trang, hoặc kiểm tra mạng.'));
  }, []);

  const options = (meta?.platforms || []).map((p) => ({
    value: p.key,
    label: p.label,
    description: p.ready ? PLATFORM_DESC[p.key] : p.note
  }));
  const ready = meta?.platforms.find((p) => p.key === platform)?.ready;
  const needsTarget = platform === 'tiktok' || platform === 'youtube';

  const pickCatalog = (mode) => {
    setCatalogMode(mode);
    if (mode === 'sample' && meta) {
      setRows(meta.sample.products.map(toRow));
      setPolicy(meta.sample.policy);
    }
    if (mode === 'empty') {
      setRows([]);
      setPolicy({});
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        platform,
        target: target.trim(),
        title: title.trim() || undefined,
        speed: Number(speed)
      };
      if (platform !== 'simulator') {
        body.products = rows.filter((r) => r.name?.trim()).map(fromRow);
        body.policy = policy;
      }
      const r = await axios.post('/live/sessions', body);
      onStarted(r.data.session);
    } catch (e) {
      setError(e.response?.data?.error || 'Không mở được phiên live');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassPanel tone="strong" className="p-5 sm:p-6">
      <PanelHeader title="Mở phiên live mới" subtitle="Bình luận được phân loại ngay khi đến: câu hỏi, chốt đơn, khiếu nại. Câu hỏi giống nhau được gom lại kèm gợi ý trả lời." />

      <RadioCards name="Nền tảng" value={platform} onChange={setPlatform} options={options} />

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {needsTarget && (
          <TextField
            label={platform === 'tiktok' ? 'Tài khoản TikTok đang live' : 'Liên kết video YouTube đang live'}
            placeholder={platform === 'tiktok' ? '@tenshop hoặc tiktok.com/@tenshop/live' : 'https://www.youtube.com/watch?v=…'}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        )}
        {platform !== 'simulator' && (
          <TextField label="Tên phiên" placeholder="Live tối thứ sáu" value={title} onChange={(e) => setTitle(e.target.value)} />
        )}
        {platform === 'simulator' && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-mid">Tốc độ phát lại</span>
            <Segmented
              label="Tốc độ"
              value={speed}
              onChange={setSpeed}
              options={[{ value: '0.5', label: 'Chậm' }, { value: '1', label: 'Thật' }, { value: '2', label: 'Nhanh gấp 2' }]}
            />
            <p className="text-xs text-ink-lo">Dùng danh mục mẫu 5 sản phẩm thời trang. Dữ liệu được gắn nhãn mô phỏng và chỉ nằm trong kho demo.</p>
          </div>
        )}
      </div>

      {platform !== 'simulator' && (
        <div className="mt-6 border-t border-line-soft pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink-hi">Danh mục và chính sách</p>
              <p className="text-xs text-ink-lo">Gợi ý trả lời chỉ dùng thông tin khai báo ở đây. Sửa được cả khi đang live.</p>
            </div>
            <Segmented
              label="Danh mục"
              value={catalogMode}
              onChange={pickCatalog}
              options={[{ value: 'sample', label: 'Bắt đầu từ mẫu' }, { value: 'empty', label: 'Để trống' }]}
            />
          </div>
          <CatalogEditor rows={rows} onRows={setRows} policy={policy} onPolicy={setPolicy} />
        </div>
      )}

      {error && <p role="alert" className="mt-4 rounded-ctrl bg-crit/10 px-3 py-2 text-sm text-crit">{error}</p>}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Hủy</Button>}
        <Button icon={Radio} onClick={start} loading={busy} disabled={!meta || !ready || (needsTarget && !target.trim())}>
          {platform === 'simulator' ? 'Bắt đầu mô phỏng' : platform === 'manual' ? 'Mở phiên' : 'Kết nối và bắt đầu'}
        </Button>
      </div>
    </GlassPanel>
  );
};

export default StartSession;
