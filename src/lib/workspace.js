import axios from 'axios';
import { readStorage, writeStorage } from './storage';

/**
 * KHO DỮ LIỆU ĐANG XEM
 *  - demo: dữ liệu mô phỏng có cài sẵn sự cố, để chứng minh hệ thống bắt được
 *  - real: chỉ dữ liệu thật thu thập từ sàn, không trộn bản ghi mô phỏng nào
 * Máy chủ chọn database theo header X-Workspace, nên chỉ cần gắn header vào
 * mọi request của axios. Đổi kho thì tải lại trang: mọi trang và mọi bộ lọc
 * đều đọc lại từ đầu, không còn số liệu của kho cũ sót trong bộ nhớ.
 */
export const WORKSPACES = {
  demo: { label: 'Mô phỏng', hint: 'Dữ liệu mô phỏng có cài sẵn sự cố để kiểm chứng hệ thống' },
  real: { label: 'Dữ liệu thật', hint: 'Chỉ đánh giá thật thu thập từ sàn, tên người mua đã được che' }
};

export const getWorkspace = () => {
  const ws = readStorage('workspace', 'demo');
  return WORKSPACES[ws] ? ws : 'demo';
};

/**
 * Mã ghi (VITE_WRITE_KEY, đặt trên Vercel, khớp WRITE_KEY trên Render): chỉ gắn
 * vào lệnh ghi. Nó nằm trong gói JS nên không phải bí mật thật; nó chặn bot và
 * script gọi bừa vào API, xem backend/services/api_access.js.
 */
const WRITE_KEY = import.meta.env.VITE_WRITE_KEY;

export const applyWorkspaceHeader = () => {
  axios.defaults.headers.common['X-Workspace'] = getWorkspace();
  if (WRITE_KEY) for (const m of ['post', 'put', 'patch', 'delete']) axios.defaults.headers[m]['X-Write-Key'] = WRITE_KEY;
};

export const switchWorkspace = (ws) => {
  if (!WORKSPACES[ws] || ws === getWorkspace()) return;
  writeStorage('workspace', ws);
  // Bộ lọc của kho này (sản phẩm, nguồn) thường không tồn tại ở kho kia
  writeStorage('sourceFilter', 'All');
  writeStorage('productFilter', 'All');
  window.location.reload();
};
