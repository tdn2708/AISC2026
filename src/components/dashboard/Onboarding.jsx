import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle } from 'lucide-react';
import { Button } from '../ui';
import { getWorkspace } from '../../lib/workspace';
import { readStorage, writeStorage } from '../../lib/storage';

/**
 * BẮT ĐẦU TRONG 5 PHÚT (chỉ kho Dữ liệu thật)
 * Bốn bước để shop có giá trị ngay: dữ liệu vào, đơn hàng để đối soát, Zalo để
 * nhận báo, một phiên live. Bước tự đánh dấu khi đã có dữ liệu; xong hết hoặc
 * bấm Ẩn thì không hiện nữa (lưu trên máy này).
 */
const KEY = 'cr-onboarding-hidden';

const Onboarding = () => {
  const [st, setSt] = useState(null);
  const [hidden, setHidden] = useState(() => String(readStorage(KEY, 'false')) === 'true');
  const real = getWorkspace() === 'real';

  useEffect(() => {
    if (!real || hidden) return undefined;
    let alive = true;
    Promise.all([
      axios.get('/onboarding').then((r) => r.data).catch(() => null),
      axios.get('/butler/status').then((r) => r.data).catch(() => null)
    ]).then(([o, b]) => alive && o && setSt({ ...o, zalo: Boolean(b?.link?.linked) }));
    return () => { alive = false; };
  }, [real, hidden]);

  if (!real || hidden || !st) return null;
  const steps = [
    { done: st.feedbacks > 0, title: 'Đưa đánh giá của shop vào', text: 'Dán liên kết sản phẩm Tiki, hoặc nạp file đánh giá xuất từ sàn.', to: '/data?tab=file', cta: 'Nạp đánh giá' },
    { done: st.orders > 0, title: 'Nạp file đơn hàng', text: 'File xuất từ trang người bán Shopee, TikTok Shop, Lazada. Có đơn thì tính được tỉ lệ khiếu nại trên đơn.', to: '/data?tab=file', cta: 'Nạp đơn hàng' },
    { done: st.zalo, title: 'Nối Zalo', text: 'Nhận bản tin sáng và tin báo sự cố, duyệt việc ngay trên Zalo.', to: '/butler', cta: 'Nối Zalo' },
    { done: st.liveSessions > 0, title: 'Mở phiên live đầu tiên', text: 'Nối TikTok hoặc YouTube đang live, bình luận được phân loại ngay.', to: '/live', cta: 'Mở phiên live' }
  ];
  const left = steps.filter((s) => !s.done).length;
  if (!left) return null;

  const hide = () => {
    writeStorage(KEY, 'true');
    setHidden(true);
  };

  return (
    <section aria-labelledby="onboard-title" className="glass-strong mb-8 rounded-surf p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="onboard-title" className="text-heading font-semibold text-ink-hi">Bắt đầu trong 5 phút</h2>
        <p className="text-sm text-ink-mid">Còn {left} trên {steps.length} bước</p>
      </div>
      <ol className="mt-4 flex list-none flex-col divide-y divide-line-soft">
        {steps.map((s) => (
          <li key={s.title} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
            {s.done
              ? <CheckCircle2 size={20} className="shrink-0 text-ok" aria-label="Đã xong" />
              : <Circle size={20} className="shrink-0 text-ink-lo" aria-label="Chưa làm" />}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${s.done ? 'text-ink-mid line-through' : 'text-ink-hi'}`}>{s.title}</p>
              {!s.done && <p className="mt-0.5 text-sm text-ink-mid">{s.text}</p>}
            </div>
            {!s.done && <Button as={Link} to={s.to} size="sm" variant="secondary">{s.cta}</Button>}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={hide}>Ẩn</Button>
      </div>
    </section>
  );
};

export default Onboarding;
