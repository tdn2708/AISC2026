/**
 * API TÀI KHOẢN: /api/auth/*
 * ------------------------------------------------------------------
 *   POST  /signup   { name, shop?, email, password, remember? } -> 201 { user, token, expiresAt }
 *   POST  /login    { email, password, remember? }              -> 200 { user, token, expiresAt }
 *   POST  /logout   (Authorization: Bearer)                      -> 200 { ok }
 *   GET   /me       (Authorization: Bearer)                      -> 200 { user } | 401
 *   PATCH /me       { name?, shop? }                             -> 200 { user }
 *
 * Chống dò mật khẩu: giới hạn theo IP (rate_limit.js) cộng giới hạn theo email
 * (10 lần sai trong 15 phút thì khóa email đó 15 phút). Đăng nhập sai không nói
 * email có tồn tại hay không, và vẫn chạy một lượt băm để thời gian trả lời
 * không lộ điều đó.
 */
const express = require('express');
const auth = require('../services/auth');
const { rateLimit } = require('../services/rate_limit');

const FAIL_MAX = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

module.exports = function authRouter(authDb) {
  const router = express.Router();
  const fails = new Map(); // email -> [thời điểm sai]
  // Băm sẵn một mật khẩu giả để đường "không có email" tốn cùng thời gian
  const dummyHash = auth.hashPassword('khong-phai-mat-khau-that-1');

  const recentFails = (email, now = Date.now()) => (fails.get(email) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  const noteFail = (email) => {
    const list = recentFails(email);
    list.push(Date.now());
    fails.set(email, list);
    if (fails.size > 5000) for (const [k] of fails) if (!recentFails(k).length) fails.delete(k);
  };

  const issue = async (req, res, status, user, remember) => {
    const isAdmin = auth.roleOf(user) === 'admin';
    const { token, expiresAt } = await auth.createSession(authDb, user, {
      remember,
      admin: isAdmin,
      ua: req.get('User-Agent') || '',
      ip: req.ip || ''
    });
    res.status(status).json({ user: auth.publicUser(user), token, expiresAt });
  };

  router.post('/signup', rateLimit({ max: 5, windowMs: 10 * 60 * 1000, name: 'đăng ký' }), async (req, res, next) => {
    try {
      const checked = auth.validateSignup(req.body || {});
      if (checked.errors) return res.status(400).json({ error: 'Thông tin đăng ký chưa hợp lệ.', fields: checked.errors });
      const made = await auth.createUser(authDb, checked.value);
      if (made.taken) {
        return res.status(409).json({ error: 'Email này đã có tài khoản.', fields: { email: 'Email này đã có tài khoản. Hãy đăng nhập.' } });
      }
      return issue(req, res, 201, made.user, req.body?.remember !== false);
    } catch (e) {
      return next(e);
    }
  });

  router.post('/login', rateLimit({ max: 20, windowMs: 5 * 60 * 1000, name: 'đăng nhập' }), async (req, res, next) => {
    try {
      const email = auth.normalizeEmail(req.body?.email);
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || !password) return res.status(400).json({ error: 'Nhập email và mật khẩu.' });
      const left = recentFails(email);
      if (left.length >= FAIL_MAX) {
        const wait = Math.max(1, Math.ceil((FAIL_WINDOW_MS - (Date.now() - left[0])) / 60000));
        return res.status(429).json({ error: `Sai mật khẩu quá nhiều lần. Thử lại sau ${wait} phút.` });
      }
      const user = await auth.findByEmail(authDb, email);
      const ok = user ? await auth.verifyPassword(password, user.passwordHash) : (await auth.verifyPassword(password, await dummyHash), false);
      if (!ok) {
        noteFail(email);
        return res.status(401).json({ error: 'Email hoặc mật khẩu chưa đúng.' });
      }
      fails.delete(email);
      // Chỉ báo bị khóa sau khi mật khẩu đúng để không lộ trạng thái cho người đoán mật khẩu
      if (auth.isLocked(user)) {
        return res.status(403).json({ error: 'Tài khoản đã bị khóa. Liên hệ quản trị viên để mở lại.', code: 'account_locked' });
      }
      const scope = req.body?.scope === 'admin' ? 'admin' : 'user';
      const isAdmin = auth.roleOf(user) === 'admin';
      if (scope === 'admin' && !isAdmin) {
        return res.status(403).json({ error: 'Tài khoản này không có quyền quản trị.', code: 'admin_required' });
      }
      const now = new Date();
      await authDb.collection('users').updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });
      if (isAdmin) {
        await authDb.collection('admin_audit').insertOne({
          at: now,
          adminId: user._id,
          adminEmail: user.email,
          action: 'login',
          targetId: user._id,
          targetEmail: user.email,
          detail: { scope },
          ok: true
        }).catch(() => {});
      }
      return issue(req, res, 200, { ...user, lastLoginAt: now }, req.body?.remember !== false);
    } catch (e) {
      return next(e);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      await auth.endSession(authDb, auth.bearerToken(req));
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  const requireUser = async (req, res, next) => {
    try {
      const found = await auth.sessionUser(authDb, auth.bearerToken(req));
      if (!found) return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' });
      req.user = found.user;
      req.session = found.session;
      return next();
    } catch (e) {
      return next(e);
    }
  };

  router.get('/me', requireUser, (req, res) => res.json({ user: auth.publicUser(req.user) }));

  router.patch('/me', requireUser, async (req, res, next) => {
    try {
      // Tài khoản mẫu nhiều người cùng dùng: một người đổi tên thì người sau thấy tên lạ
      if (req.user.email === auth.DEMO_ACCOUNT.email) {
        return res.status(403).json({ error: 'Tài khoản mẫu dùng chung nên không đổi được tên. Hãy tạo tài khoản riêng.' });
      }
      const set = {};
      if (req.body?.name !== undefined) {
        const name = auth.cleanText(req.body.name, auth.NAME_MAX);
        if (name.length < 2) return res.status(400).json({ error: 'Tên cần ít nhất 2 ký tự.', fields: { name: 'Nhập họ và tên (ít nhất 2 ký tự).' } });
        set.name = name;
      }
      if (req.body?.shop !== undefined) set.shop = auth.cleanText(req.body.shop, auth.SHOP_MAX);
      if (!Object.keys(set).length) return res.json({ user: auth.publicUser(req.user) });
      await authDb.collection('users').updateOne({ _id: req.user._id }, { $set: set });
      auth.forgetUser(req.user._id); // phiên trong bộ nhớ đệm đang giữ tên cũ
      return res.json({ user: auth.publicUser({ ...req.user, ...set }) });
    } catch (e) {
      return next(e);
    }
  });

  router.post(
    '/password',
    requireUser,
    rateLimit({ max: 5, windowMs: 10 * 60 * 1000, name: 'đổi mật khẩu' }),
    async (req, res, next) => {
      try {
        if (req.user.email === auth.DEMO_ACCOUNT.email) {
          return res.status(403).json({ error: 'Tài khoản mẫu dùng chung nên không đổi được mật khẩu.' });
        }
        const current = typeof req.body?.current === 'string' ? req.body.current : '';
        const nextPw = typeof req.body?.next === 'string' ? req.body.next : '';
        if (!current || !nextPw) {
          return res.status(400).json({ error: 'Nhập mật khẩu hiện tại và mật khẩu mới.' });
        }
        const ok = await auth.verifyPassword(current, req.user.passwordHash);
        if (!ok) {
          return res.status(401).json({
            error: 'Mật khẩu hiện tại chưa đúng.',
            fields: { current: 'Mật khẩu hiện tại chưa đúng.' }
          });
        }
        const problems = auth.passwordProblems(nextPw);
        // Quản trị viên giữ cùng mức tối thiểu với mật khẩu quản trị đặt qua biến môi trường
        if (auth.roleOf(req.user) === 'admin' && nextPw.length < auth.ADMIN_PASSWORD_MIN) {
          problems.unshift(`Mật khẩu quản trị cần ít nhất ${auth.ADMIN_PASSWORD_MIN} ký tự.`);
        }
        if (problems.length > 0) {
          return res.status(400).json({ error: problems[0], fields: { next: problems[0] } });
        }
        if (nextPw === current) {
          return res.status(400).json({
            error: 'Mật khẩu mới phải khác mật khẩu hiện tại.',
            fields: { next: 'Mật khẩu mới phải khác mật khẩu hiện tại.' }
          });
        }
        const now = new Date();
        const passwordHash = await auth.hashPassword(nextPw);
        await authDb.collection('users').updateOne(
          { _id: req.user._id },
          { $set: { passwordHash, passwordChangedAt: now, mustChangePassword: false } }
        );
        // Xóa mọi phiên khác của người này, giữ nguyên phiên đang dùng
        await authDb.collection('auth_sessions').deleteMany({
          userId: req.user._id,
          tokenHash: { $ne: req.session.tokenHash }
        });
        auth.forgetUser(req.user._id);
        return res.json({
          user: auth.publicUser({ ...req.user, passwordHash, passwordChangedAt: now, mustChangePassword: false })
        });
      } catch (e) {
        return next(e);
      }
    }
  );

  return router;
};
