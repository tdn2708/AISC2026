import axios from 'axios';

/**
 * GỌI API QUẢN GIA (/api/butler/*)
 * ==================================================================
 * Dùng thể hiện axios mặc định của ứng dụng (đã gắn sẵn phiên đăng nhập,
 * kho dữ liệu và khóa ghi).
 */

export const getStatus = async () => {
  const { data } = await axios.get('/butler/status');
  return data;
};

export const getMessages = async ({ before, limit = 30 } = {}) => {
  const params = {};
  if (before) params.before = before;
  if (limit) params.limit = limit;
  const { data } = await axios.get('/butler/messages', { params });
  return data;
};

export const sendCommand = async (text) => {
  const { data } = await axios.post('/butler/command', { text });
  return data;
};

export const createLinkCode = async () => {
  const { data } = await axios.post('/butler/link-code');
  return data;
};

export const unlinkZalo = async () => {
  const { data } = await axios.delete('/butler/link');
  return data;
};

export const saveSettings = async (patch) => {
  const { data } = await axios.patch('/butler/settings', patch);
  return data;
};

export const getOutbox = async (limit = 10) => {
  const { data } = await axios.get('/butler/outbox', { params: { limit } });
  return data;
};

export const sendTest = async () => {
  const { data } = await axios.post('/butler/test');
  return data;
};
