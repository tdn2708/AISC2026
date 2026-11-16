import axios from 'axios';

/**
 * GỌI API LỊCH LIVESTREAM (/api/live/schedule)
 * ==================================================================
 * Dùng thực thể axios mặc định của ứng dụng (đã gắn sẵn phiên, kho, khóa ghi).
 */

export async function getSchedules() {
  const r = await axios.get('/live/schedule');
  return r.data?.items || [];
}

export async function createSchedule(payload) {
  const r = await axios.post('/live/schedule', payload);
  return r.data?.item;
}

export async function updateSchedule(id, patch) {
  const r = await axios.patch(`/live/schedule/${encodeURIComponent(id)}`, patch);
  return r.data?.item;
}

export async function cancelSchedule(id) {
  const r = await axios.patch(`/live/schedule/${encodeURIComponent(id)}`, { status: 'cancelled' });
  return r.data?.item;
}

export async function deleteSchedule(id) {
  const r = await axios.delete(`/live/schedule/${encodeURIComponent(id)}`);
  return r.data;
}
