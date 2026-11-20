/**
 * KIỂM THỬ API QUẢN TRỊ MÁY CHỦ (mục 8.2 KE-HOACH-QUAN-TRI-MAY-CHU.md)
 * ==================================================================
 * Chạy với backend cục bộ đang mở ở cổng 5000, kho thử và biến admin thử:
 *   node backend/scripts/admin_check.js
 *
 * Chỉ dùng module http có sẵn của Node; không in mật khẩu hay bí mật.
 */
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PORT = Number(process.env.PORT) || 5000;
const HOST = '127.0.0.1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin.thu@customerradar.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ThuNghiem2026x';
const WRITE_KEY = process.env.WRITE_KEY || '';

function request(method, reqPath, { token = null, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : JSON.stringify(body);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (WRITE_KEY && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers['X-Write-Key'] = WRITE_KEY;
    }
    if (payload != null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      { hostname: HOST, port: PORT, path: reqPath, method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, data, raw });
        });
      }
    );
    req.on('error', reject);
    if (payload != null) req.write(payload);
    req.end();
  });
}

async function main() {
  let failed = 0;
  const pass = (step, note = '') => console.log(`ĐẠT  [${step}]${note ? ' ' + note : ''}`);
  const fail = (step, reason) => {
    failed += 1;
    console.error(`HỎNG [${step}] ${reason}`);
  };

  let adminToken = null;
  let adminUser = null;
  let userA = null;
  let userB = null;

  try {
    // Kiểm trước: không phiên gọi /api/admin/users phải 401
    const noAuth = await request('GET', '/api/admin/users');
    if (noAuth.status !== 401) {
      fail('0', `Không phiên gọi /api/admin/users trả ${noAuth.status}, kỳ vọng 401`);
    }

    // 1. Đăng nhập admin thử
    const loginAdm = await request('POST', '/api/auth/login', {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, scope: 'admin' }
    });
    if (loginAdm.status === 200 && loginAdm.data?.token && loginAdm.data?.user?.role === 'admin') {
      adminToken = loginAdm.data.token;
      adminUser = loginAdm.data.user;
      pass('1', 'Đăng nhập quản trị thành công');
    } else {
      fail('1', `Đăng nhập quản trị thất bại (${loginAdm.status})`);
      process.exit(1);
    }

    // 2. Tạo hai tài khoản thử
    const stamp = Date.now();
    const emailA = `kiemtra.${stamp}.a@customerradar.local`;
    const emailB = `kiemtra.${stamp}.b@customerradar.local`;
    const pwInit = 'MatKhauThu2026';

    const signA = await request('POST', '/api/auth/signup', {
      body: { name: 'Kiểm Tra A', shop: 'Shop A', email: emailA, password: pwInit }
    });
    const signB = await request('POST', '/api/auth/signup', {
      body: { name: 'Kiểm Tra B', shop: 'Shop B', email: emailB, password: pwInit }
    });
    if (signA.status === 201 && signB.status === 201) {
      userA = { ...signA.data.user, token: signA.data.token };
      userB = { ...signB.data.user, token: signB.data.token };
      pass('2', 'Tạo hai tài khoản thử A và B');
    } else {
      fail('2', `Đăng ký thất bại: A=${signA.status}, B=${signB.status}`);
      process.exit(1);
    }

    // 3. GET /api/admin/users?q=kiemtra thấy cả hai
    const listRes = await request('GET', '/api/admin/users?q=kiemtra', { token: adminToken });
    const foundEmails = (listRes.data?.items || []).map((u) => u.email);
    if (listRes.status === 200 && foundEmails.includes(emailA) && foundEmails.includes(emailB)) {
      pass('3', 'Tìm kiếm sổ tài khoản thấy đủ cả A và B');
    } else {
      fail('3', `Không thấy đủ A, B trong kết quả tìm kiếm (${listRes.status})`);
    }

    // 4. Khóa A không lý do -> 400; có lý do -> 200; A đăng nhập -> 403 câu bị khóa; phiên cũ /me -> 401
    const lockNoReason = await request('POST', `/api/admin/users/${userA.id}/lock`, {
      token: adminToken,
      body: { reason: '' }
    });
    const lockOk = await request('POST', `/api/admin/users/${userA.id}/lock`, {
      token: adminToken,
      body: { reason: 'Kiểm thử khóa tài khoản' }
    });
    const loginLocked = await request('POST', '/api/auth/login', {
      body: { email: emailA, password: pwInit }
    });
    const oldMe = await request('GET', '/api/auth/me', { token: userA.token });

    if (
      lockNoReason.status === 400 &&
      lockOk.status === 200 &&
      loginLocked.status === 403 &&
      String(loginLocked.data?.error || '').includes('bị khóa') &&
      oldMe.status === 401
    ) {
      pass('4', 'Khóa A chặn đăng nhập (403) và hủy phiên cũ (401)');
    } else {
      fail(
        '4',
        `lockNoReason=${lockNoReason.status}, lockOk=${lockOk.status}, loginLocked=${loginLocked.status}, oldMe=${oldMe.status}`
      );
    }

    // 5. Mở khóa A -> đăng nhập lại được
    const unlockOk = await request('POST', `/api/admin/users/${userA.id}/unlock`, {
      token: adminToken,
      body: {}
    });
    const loginUnlocked = await request('POST', '/api/auth/login', {
      body: { email: emailA, password: pwInit }
    });
    if (unlockOk.status === 200 && loginUnlocked.status === 200 && loginUnlocked.data?.token) {
      userA.token = loginUnlocked.data.token;
      pass('5', 'Mở khóa A và đăng nhập lại thành công');
    } else {
      fail('5', `unlock=${unlockOk.status}, relogin=${loginUnlocked.status}`);
    }

    // 6. Đặt lại mật khẩu B -> nhận tempPassword -> mật khẩu cũ hỏng -> tạm đăng nhập được với mustChangePassword=true -> đổi qua /api/auth/password
    const resetRes = await request('POST', `/api/admin/users/${userB.id}/reset-password`, {
      token: adminToken,
      body: {}
    });
    const tempPw = resetRes.data?.tempPassword;
    const oldPwLogin = await request('POST', '/api/auth/login', {
      body: { email: emailB, password: pwInit }
    });
    const tempPwLogin = await request('POST', '/api/auth/login', {
      body: { email: emailB, password: tempPw || '' }
    });
    const changePwRes = await request('POST', '/api/auth/password', {
      token: tempPwLogin.data?.token,
      body: { current: tempPw || '', next: 'MatKhauMoi2026b' }
    });
    if (
      resetRes.status === 200 &&
      typeof tempPw === 'string' &&
      tempPw.length === 14 &&
      oldPwLogin.status === 401 &&
      tempPwLogin.status === 200 &&
      tempPwLogin.data?.user?.mustChangePassword === true &&
      changePwRes.status === 200 &&
      changePwRes.data?.user?.mustChangePassword === false
    ) {
      pass('6', 'Đặt lại mật khẩu B, đăng nhập mật khẩu tạm và đổi mật khẩu thành công');
    } else {
      fail(
        '6',
        `reset=${resetRes.status}, oldPw=${oldPwLogin.status}, tempPw=${tempPwLogin.status} (must=${tempPwLogin.data?.user?.mustChangePassword}), change=${changePwRes.status} (must=${changePwRes.data?.user?.mustChangePassword})`
      );
    }

    // 7. Admin tự khóa mình -> 403; tự xóa -> 403
    const selfLock = await request('POST', `/api/admin/users/${adminUser.id}/lock`, {
      token: adminToken,
      body: { reason: 'Thử tự khóa chính mình' }
    });
    const selfDel = await request('DELETE', `/api/admin/users/${adminUser.id}`, {
      token: adminToken,
      body: { confirmEmail: adminUser.email }
    });
    if (selfLock.status === 403 && selfDel.status === 403) {
      pass('7', 'Chặn quản trị viên tự khóa và tự xóa chính mình (403)');
    } else {
      fail('7', `selfLock=${selfLock.status}, selfDel=${selfDel.status}`);
    }

    // 8. Khóa tài khoản mẫu -> 403
    const demoSearch = await request('GET', '/api/admin/users?q=demo@customerradar.vn', { token: adminToken });
    const demoRow = (demoSearch.data?.items || []).find((u) => u.email === 'demo@customerradar.vn');
    const lockDemo = demoRow
      ? await request('POST', `/api/admin/users/${demoRow.id}/lock`, {
          token: adminToken,
          body: { reason: 'Thử khóa tài khoản mẫu' }
        })
      : { status: 0 };
    if (lockDemo.status === 403) {
      pass('8', 'Chặn khóa tài khoản mẫu (403)');
    } else {
      fail('8', `lockDemo=${lockDemo.status}`);
    }

    // 9. Tài khoản thường A gọi /api/admin/overview và /api/admin/users -> 403
    const userOverview = await request('GET', '/api/admin/overview', { token: userA.token });
    const userList = await request('GET', '/api/admin/users', { token: userA.token });
    if (userOverview.status === 403 && userList.status === 403) {
      pass('9', 'Tài khoản thường gọi API quản trị nhận 403');
    } else {
      fail('9', `userOverview=${userOverview.status}, userList=${userList.status}`);
    }

    // 10. Nhật ký /api/admin/audit có đủ lock, unlock, reset_password và không chứa mật khẩu tạm
    const auditRes = await request('GET', '/api/admin/audit?limit=30', { token: adminToken });
    const auditItems = auditRes.data?.items || [];
    const actions = new Set(auditItems.map((x) => x.action));
    const leaksTempPw = tempPw ? String(auditRes.raw || '').includes(tempPw) : false;
    if (
      auditRes.status === 200 &&
      actions.has('lock') &&
      actions.has('unlock') &&
      actions.has('reset_password') &&
      !leaksTempPw
    ) {
      pass('10', 'Nhật ký ghi đủ lock, unlock, reset_password và không lộ mật khẩu tạm');
    } else {
      fail('10', `audit=${auditRes.status}, actions=${[...actions].join(',')}, leaks=${leaksTempPw}`);
    }

    // 11. Xóa A với confirmEmail sai -> 400; đúng -> 200; A đăng nhập -> 401; xóa B -> 200
    const delWrong = await request('DELETE', `/api/admin/users/${userA.id}`, {
      token: adminToken,
      body: { confirmEmail: 'sai@customerradar.local' }
    });
    const delA = await request('DELETE', `/api/admin/users/${userA.id}`, {
      token: adminToken,
      body: { confirmEmail: emailA }
    });
    const loginDeletedA = await request('POST', '/api/auth/login', {
      body: { email: emailA, password: pwInit }
    });
    const delB = await request('DELETE', `/api/admin/users/${userB.id}`, {
      token: adminToken,
      body: { confirmEmail: emailB }
    });
    if (delWrong.status === 400 && delA.status === 200 && loginDeletedA.status === 401 && delB.status === 200) {
      userA = null;
      userB = null;
      pass('11', 'Xóa A (sai email 400, đúng 200, đăng nhập 401) và xóa B thành công');
    } else {
      fail('11', `delWrong=${delWrong.status}, delA=${delA.status}, loginDelA=${loginDeletedA.status}, delB=${delB.status}`);
    }
  } finally {
    // Dọn phòng khi hỏng giữa chừng
    if (adminToken && userA?.id) {
      await request('DELETE', `/api/admin/users/${userA.id}`, {
        token: adminToken,
        body: { confirmEmail: userA.email }
      }).catch(() => {});
    }
    if (adminToken && userB?.id) {
      await request('DELETE', `/api/admin/users/${userB.id}`, {
        token: adminToken,
        body: { confirmEmail: userB.email }
      }).catch(() => {});
    }
  }

  if (failed === 0) {
    console.log('\nTẤT CẢ ĐẠT');
    process.exit(0);
  } else {
    console.error(`\nCÓ ${failed} BƯỚC HỎNG`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('HỎNG [chương trình]', e.message);
  process.exit(1);
});
