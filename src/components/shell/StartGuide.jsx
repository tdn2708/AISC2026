import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FileUp, Link2, FlaskConical, Database, Inbox } from 'lucide-react';
import { Button } from '../ui';
import { GlassPanel } from '../ui/Glass';
import { getWorkspace, switchWorkspace } from '../../lib/workspace';
import { useWorkspaceEmpty } from '../../lib/workspaceEmpty';

/**
 * KHO CHƯA CÓ DỮ LIỆU (đánh giá 16/11, mục 6)
 *
 * StartGuide: thay cả trang Tổng quan khi kho chưa có phản hồi nào. Nói thật
 * là chưa có gì để tính, rồi cho ba cách có dữ liệu, mỗi cách một nút dẫn
 * thẳng tới chỗ làm. Ba cách là lựa chọn ngang hàng, không phải các bước,
 * nên không đánh số.
 *
 * NoDataNotice: một dòng báo ở đầu các trang số liệu khác (Bảng số liệu, Cảnh
 * báo, Phân tích...), để "0 cảnh báo" không bị đọc thành "cửa hàng ổn".
 */

const realWays = [
  {
    icon: Link2,
    title: 'Lấy đánh giá từ liên kết sản phẩm',
    text: 'Dán liên kết một sản phẩm trên Tiki. Hệ thống lấy các đánh giá công khai rồi phân loại.',
    action: 'Mở trang thu thập',
    to: '/data?tab=url'
  },
  {
    icon: FileUp,
    title: 'Nạp file phản hồi của shop',
    text: 'File CSV hoặc Excel xuất từ sàn, Google Form hay bảng tự ghi, cả file đơn hàng của trang người bán. Tên và số điện thoại được che trước khi lưu.',
    action: 'Nạp file CSV',
    to: '/data?tab=file'
  },
  {
    icon: FlaskConical,
    title: 'Xem thử bằng dữ liệu mô phỏng',
    text: 'Kho mô phỏng có sẵn phản hồi và vài sự cố cài sẵn, để xem hệ thống phát hiện vấn đề ra sao trước khi dùng dữ liệu của mình.',
    action: 'Chuyển sang kho mô phỏng',
    onClick: () => switchWorkspace('demo')
  }
];

const demoWays = [
  {
    icon: Database,
    title: 'Dùng dữ liệu thật',
    text: 'Kho dữ liệu thật nhận đánh giá thu thập từ sàn và file phản hồi của shop.',
    action: 'Chuyển sang dữ liệu thật',
    onClick: () => switchWorkspace('real')
  }
];

const WayAction = ({ way }) =>
  way.to ? (
    <Button as={Link} to={way.to} variant="secondary" size="lg" className="mt-4 w-full sm:w-auto">
      {way.action}
    </Button>
  ) : (
    <Button variant="secondary" size="lg" className="mt-4 w-full sm:w-auto" onClick={way.onClick}>
      {way.action}
    </Button>
  );

export const StartGuide = () => {
  const real = getWorkspace() === 'real';
  const ways = real ? realWays : demoWays;
  return (
    <GlassPanel as="section" tone="strong" aria-labelledby="start-title" className="mt-2 mb-8 px-5 py-6 sm:px-8 sm:py-8">
      <h1 id="start-title" className="max-w-[30ch] text-display font-semibold tracking-[-0.02em] text-ink-hi">
        {real ? 'Kho dữ liệu thật chưa có phản hồi nào.' : 'Kho mô phỏng đang trống.'}
      </h1>
      <p className="mt-3 max-w-[60ch] text-base leading-relaxed text-ink-mid">
        {real
          ? 'Chọn một cách dưới đây để có dữ liệu.'
          : 'Kho này chưa được nạp dữ liệu mô phỏng. Người quản trị nạp lại trên máy chủ, hoặc chuyển sang dữ liệu thật.'}
      </p>
      <ul className={`mt-8 grid gap-x-8 gap-y-6 border-t border-line-soft pt-6 ${ways.length > 1 ? 'lg:grid-cols-3' : ''}`}>
        {ways.map((w) => (
          <li key={w.title} className="flex min-w-0 flex-col">
            <w.icon size={20} className="text-accent" aria-hidden="true" />
            <h2 className="mt-3 text-heading font-semibold text-ink-hi">{w.title}</h2>
            <p className="mt-1.5 max-w-[48ch] flex-1 text-sm leading-relaxed text-ink-mid">{w.text}</p>
            <div><WayAction way={w} /></div>
          </li>
        ))}
      </ul>
    </GlassPanel>
  );
};

// Trang tự lo trạng thái trống (Tổng quan, Phản hồi) hoặc không đọc kho phản hồi
const SKIP = ['/dashboard', '/feedbacks', '/data', '/settings', '/lab', '/live'];

export const NoDataNotice = () => {
  const { pathname } = useLocation();
  const empty = useWorkspaceEmpty();
  if (empty !== true || SKIP.some((p) => pathname.startsWith(p))) return null;
  const real = getWorkspace() === 'real';
  return (
    <div role="status" className="cx mt-2 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-ctrl bg-accent-dim px-4 py-3 text-sm text-ink-hi">
      <span className="flex min-w-0 items-center gap-2.5">
        <Inbox size={16} className="shrink-0 text-accent" aria-hidden="true" />
        <span>
          {real ? 'Kho dữ liệu thật chưa có phản hồi nào' : 'Kho mô phỏng đang trống'}, nên các số trên trang này đều bằng 0.
        </span>
      </span>
      <Button as={Link} to="/dashboard" variant="link" size="sm">
        Xem cách có dữ liệu
      </Button>
    </div>
  );
};
