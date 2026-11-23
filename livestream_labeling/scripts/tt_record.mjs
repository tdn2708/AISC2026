// Ghi bình luận + người xem + lượt thích từ các phiên TikTok Live đang phát.
// Cách dùng: node tt_record.mjs OUT_DIR PHUT_MOI_PHIEN SO_PHIEN_SONG_SONG user1 user2 ...
// Chỉ đọc dữ liệu công khai (không đăng nhập). Tên người xem được băm, SĐT/email bị che.
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const require = createRequire(process.env.TT_LIB_DIR + '/');
const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');

const [out, minsArg, parArg, ...users] = process.argv.slice(2);
const MINS = Number(minsArg) || 12, PAR = Number(parArg) || 3;
const SALT = process.env.PII_SALT || 'aisc2026-live';
const PHONE = /(?:\+?84|0)(?:[\s.\-]?\d){8,10}/g, EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const h = (x) => crypto.createHash('sha256').update(SALT + (x ?? '')).digest('hex').slice(0, 12);
const csvq = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
fs.mkdirSync(out, { recursive: true });
const cFile = path.join(out, 'tt_comments.csv'), mFile = path.join(out, 'tt_metrics.csv'), sFile = path.join(out, 'tt_sessions.csv');
const init = (f, hdr) => { if (!fs.existsSync(f)) fs.writeFileSync(f, '﻿' + hdr.join(',') + '\n'); };
init(cFile, ['platform','session_id','msg_id','ts_utc','offset_sec','author_hash','msg_type','text','has_phone']);
init(mFile, ['platform','session_id','ts_utc','offset_sec','metric','value']);
init(sFile, ['platform','session_id','url','channel','title','start_utc','duration_sec','view_count_final','like_count_final','n_comments','collected_at','method']);
const app = (f, row) => fs.appendFileSync(f, row.map(csvq).join(',') + '\n');

async function record(user) {
  const conn = new TikTokLiveConnection(user, { processInitialData: false, enableExtendedGiftInfo: false });
  let state;
  for (let attempt = 1; ; attempt++) {
    try { state = await conn.connect(); break; } catch (e) {
      const msg = String(e?.message || e);
      if (/rate.?limit/i.test(msg) && attempt <= 4) { await new Promise(r => setTimeout(r, 70000)); continue; }
      console.log(user, 'BỎ QUA:', msg.slice(0, 90)); return;
    }
  }
  const sid = `tt_${user}_${state?.roomId || Date.now()}`, t0 = Date.now();
  let n = 0, lastViewers = null, lastLikes = null;
  const off = () => ((Date.now() - t0) / 1000).toFixed(1);
  console.log(user, 'ĐANG GHI', sid);
  conn.on(WebcastEvent.CHAT, (d) => {
    let text = d?.content ?? d?.comment; if (!text) return;
    const hp = PHONE.test(text); PHONE.lastIndex = 0;
    text = text.replace(PHONE, '[SĐT]').replace(EMAIL, '[EMAIL]');
    const u = d.user || {}; const ct = Number(d.common?.createTime);
    n++; app(cFile, ['tiktok', sid, d.common?.msgId ?? '', new Date(ct > 0 ? ct : Date.now()).toISOString(), off(), h(String(u.userId ?? u.uniqueId ?? '')), 'text', text, hp]);
  });
  conn.on(WebcastEvent.ROOM_USER, (d) => { const v = Number(d?.viewerCount ?? d?.total ?? d?.totalUser); if (v > 0) { lastViewers = v; app(mFile, ['tiktok', sid, new Date().toISOString(), off(), 'viewers', v]); } });
  conn.on(WebcastEvent.LIKE, (d) => { const v = Number(d?.totalLikeCount ?? d?.total); if (v > 0) { lastLikes = v; } });
  const likeTick = setInterval(() => { if (lastLikes) app(mFile, ['tiktok', sid, new Date().toISOString(), off(), 'likes_total', lastLikes]); }, 30000);
  await new Promise((res) => { const t = setTimeout(res, MINS * 60000); conn.on(WebcastEvent.STREAM_END, () => { clearTimeout(t); res(); }); });
  clearInterval(likeTick); try { conn.disconnect(); } catch {}
  const ri = state?.roomInfo || {};
  app(sFile, ['tiktok', sid, `https://www.tiktok.com/@${user}/live`, user, ri.title || '', ri.create_time ? new Date(ri.create_time * 1000).toISOString() : new Date(t0).toISOString(), Math.round((Date.now() - t0) / 1000), lastViewers ?? '', lastLikes ?? '', n, new Date().toISOString(), `tiktok-live-connector, ghi ${MINS} phút`]);
  console.log(user, 'XONG', n, 'bình luận');
}

const queue = [...users];
await Promise.all(Array.from({ length: PAR }, async () => { while (queue.length) { await record(queue.shift()); await new Promise(r => setTimeout(r, 15000)); } }));
process.exit(0);
