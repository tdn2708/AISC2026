/**
 * NÂNG HOẶC HẠ QUYỀN QUẢN TRỊ CHO MỘT TÀI KHOẢN ĐÃ CÓ
 * ==================================================================
 * Cách dùng (chạy trong thư mục backend/):
 *   node scripts/make_admin.js --email x@y.z            (chỉ xem sẽ sửa gì, không ghi)
 *   node scripts/make_admin.js --email x@y.z --yes      (cấp quyền quản trị)
 *   node scripts/make_admin.js --email x@y.z --demote --yes
 *
 * Database tài khoản lấy từ MONGODB_AUTH_DB, không có thì <MONGODB_DB>_auth. Thiếu cả
 * MONGODB_DB thì là customer_radar_auth, tức BẢN THẬT. Muốn thử ở máy thì đặt
 * MONGODB_DB=customer_radar_ui_test trước khi chạy.
 *
 * Dùng khi cần cấp quyền cho quản trị viên mới hoặc cứu hộ nếu mất quyền.
 * Không in biến môi trường hay chuỗi kết nối ra màn hình.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');
const auth = require('../services/auth');

function parseArgs(argv) {
  let email = '';
  let demote = false;
  let yes = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--demote') demote = true;
    else if (a === '--yes') yes = true;
    else if (a === '--email' && argv[i + 1]) {
      email = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--email=')) {
      email = a.slice('--email='.length);
    }
  }
  return { email: auth.normalizeEmail(email), demote, yes };
}

async function main() {
  const { email, demote, yes } = parseArgs(process.argv);
  if (!email) {
    console.error('Thiếu tham số --email. Ví dụ: node scripts/make_admin.js --email x@y.z [--demote]');
    process.exit(1);
  }
  if (email === auth.DEMO_ACCOUNT.email) {
    console.error('Không được đổi vai trò của tài khoản mẫu dùng chung.');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Thiếu cấu hình MONGODB_URI.');
    process.exit(1);
  }

  const dbName = process.env.MONGODB_DB || 'customer_radar';
  const authDbName = process.env.MONGODB_AUTH_DB || `${dbName}_auth`;

  const isProd = !/_test/i.test(authDbName);
  console.log(`Database tài khoản: ${authDbName}${isProd ? ' (BẢN THẬT)' : ' (kho thử)'}`);
  console.log(`Việc sẽ làm: ${demote ? 'hạ quyền quản trị' : 'cấp quyền quản trị'} cho ${email}`);
  if (!yes) {
    console.log('Chưa ghi gì. Kiểm lại hai dòng trên rồi chạy lại kèm --yes để thực hiện.');
    return;
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const authDb = client.db(authDbName);
    const users = authDb.collection('users');
    const user = await users.findOne({ email });
    if (!user) {
      console.error(`Không tìm thấy tài khoản với email ${email} trong ${authDbName}.`);
      process.exit(1);
    }

    if (demote) {
      const adminCount = await users.countDocuments({ role: 'admin', status: { $ne: 'locked' } });
      if (auth.roleOf(user) === 'admin' && adminCount <= 1) {
        console.error('Phải còn ít nhất một quản trị viên đang hoạt động, không thể hạ quyền.');
        process.exit(1);
      }
      await users.updateOne({ _id: user._id }, { $set: { role: 'user' } });
      console.log(`Đã hạ quyền quản trị của ${email} về người dùng thường trong ${authDbName}.`);
    } else {
      await users.updateOne(
        { _id: user._id },
        { $set: { role: 'admin', status: 'active', lockedAt: null, lockedReason: null, lockedBy: null } }
      );
      console.log(`Đã cấp quyền quản trị cho ${email} trong ${authDbName}.`);
    }
    // Bộ đệm phiên nằm trong tiến trình máy chủ đang chạy, script này không xóa được:
    // máy chủ nhận vai trò mới sau tối đa 5 phút, hoặc ngay khi khởi động lại.
    console.log('Máy chủ đang chạy nhận thay đổi trong tối đa 5 phút (bộ đệm phiên), hoặc ngay sau khi khởi động lại.');
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error('Lỗi khi cập nhật vai trò:', e.message);
  process.exit(1);
});
