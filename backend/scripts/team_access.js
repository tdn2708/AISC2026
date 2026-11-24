/**
 * CẤP HOẶC BỎ QUYỀN DÙNG HAI KHO CHUNG (kho mô phỏng và kho thật trưng bày)
 * ==================================================================
 * Từ khi tách dữ liệu từng shop (services/tenants.js), tài khoản thường dùng kho thật
 * riêng và chỉ xem được kho mô phỏng. Thành viên nhóm quản kho trưng bày thì cần quyền
 * dùng hai kho chung như tài khoản mẫu và quản trị viên.
 *
 * Cách dùng (chạy trong thư mục backend/):
 *   node scripts/team_access.js --list                     (liệt kê ai đang có quyền, không ghi)
 *   node scripts/team_access.js --email x@y.z              (chỉ xem sẽ sửa gì)
 *   node scripts/team_access.js --email x@y.z --yes        (cấp quyền)
 *   node scripts/team_access.js --email x@y.z --remove --yes
 *
 * Database tài khoản: MONGODB_AUTH_DB, không có thì <MONGODB_DB>_auth; thiếu cả MONGODB_DB
 * thì là customer_radar_auth, tức BẢN THẬT. Máy chủ đang chạy nhận quyền mới khi người đó
 * đăng nhập lại hoặc sau tối đa 5 phút (bộ nhớ đệm phiên).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { MongoClient } = require('mongodb');
const auth = require('../services/auth');

function parseArgs(argv) {
  const out = { email: '', remove: false, yes: false, list: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--remove') out.remove = true;
    else if (a === '--yes') out.yes = true;
    else if (a === '--list') out.list = true;
    else if (a === '--email' && argv[i + 1]) { out.email = argv[i + 1]; i += 1; } else if (a.startsWith('--email=')) out.email = a.slice(8);
  }
  out.email = auth.normalizeEmail(out.email);
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const dbName = process.env.MONGODB_AUTH_DB || `${process.env.MONGODB_DB || 'customer_radar'}_auth`;
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const users = client.db(dbName).collection('users');
    console.log(`Database tài khoản: ${dbName}`);
    if (args.list) {
      const list = await users.find({ $or: [{ sharedWorkspaces: true }, { role: 'admin' }, { email: auth.DEMO_ACCOUNT.email }] }, { projection: { email: 1, role: 1, sharedWorkspaces: 1 } }).toArray();
      for (const u of list) console.log(`- ${u.email}: ${u.email === auth.DEMO_ACCOUNT.email ? 'tài khoản mẫu' : u.role === 'admin' ? 'quản trị viên' : 'thành viên nhóm'}`);
      const others = await users.countDocuments({ sharedWorkspaces: { $ne: true }, role: { $ne: 'admin' }, email: { $ne: auth.DEMO_ACCOUNT.email } });
      console.log(`Tài khoản dùng kho riêng: ${others}`);
      return;
    }
    if (!args.email) { console.error('Thiếu --email. Xem hướng dẫn ở đầu file.'); process.exitCode = 1; return; }
    const u = await users.findOne({ email: args.email });
    if (!u) { console.error(`Không có tài khoản ${args.email}.`); process.exitCode = 1; return; }
    const want = !args.remove;
    console.log(`${args.email}: hiện ${u.sharedWorkspaces ? 'ĐANG' : 'CHƯA'} dùng kho chung; sẽ ${want ? 'cấp' : 'bỏ'} quyền.`);
    if (!args.yes) { console.log('Chưa ghi gì. Thêm --yes để thực hiện.'); return; }
    await users.updateOne({ _id: u._id }, want ? { $set: { sharedWorkspaces: true } } : { $unset: { sharedWorkspaces: '' } });
    console.log('Đã ghi. Người dùng đăng nhập lại để thấy ngay.');
  } finally {
    await client.close();
  }
}

main().catch((e) => { console.error('Lỗi:', e.message); process.exit(1); });
