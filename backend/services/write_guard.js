/**
 * CHỐT CHẶN CHO ROUTE GHI PHÁ DỮ LIỆU HÀNG LOẠT
 * ------------------------------------------------------------------
 * Hệ thống chưa có đăng nhập ở máy chủ, nên một route xóa sạch kho và nạp
 * lại dữ liệu mô phỏng không được phép mở sẵn: chỉ một lệnh curl là xóa kho.
 * `POST /api/seed` vì vậy mặc định TẮT; muốn dùng phải đặt biến môi trường
 * ALLOW_SEED_ROUTE=1, và chỉ chạy trên kho demo (MONGODB_DB), không bao giờ
 * trên kho Dữ liệu thật. Lệnh `npm run seed` (script) không đi qua route này.
 */

/**
 * @param {{ dbName: string, workspace: string, env?: object }} p
 * @returns {{ allowed: boolean, status?: number, error?: string }}
 */
function seedRouteCheck({ dbName, workspace, env = process.env }) {
  if (env.ALLOW_SEED_ROUTE !== '1') {
    return { allowed: false, status: 403, error: 'Route nạp dữ liệu mẫu đang tắt trên máy chủ này. Dùng lệnh `npm run seed` trong thư mục backend.' };
  }
  const demoDb = env.MONGODB_DB || 'customer_radar';
  if (workspace !== 'demo' || dbName !== demoDb) {
    return { allowed: false, status: 403, error: 'Chỉ được nạp dữ liệu mẫu vào kho demo, không phải kho này.' };
  }
  return { allowed: true };
}

module.exports = { seedRouteCheck };
