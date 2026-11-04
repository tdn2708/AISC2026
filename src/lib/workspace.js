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

export const applyWorkspaceHeader = () => {
  axios.defaults.headers.common['X-Workspace'] = getWorkspace();
};

export const switchWorkspace = (ws) => {
  if (!WORKSPACES[ws] || ws === getWorkspace()) return;
  writeStorage('workspace', ws);
  // Bộ lọc của kho này (sản phẩm, nguồn) thường không tồn tại ở kho kia
  writeStorage('sourceFilter', 'All');
  writeStorage('productFilter', 'All');
  window.location.reload();
};
