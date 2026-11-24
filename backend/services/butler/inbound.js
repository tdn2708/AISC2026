/**
 * HÀNG ĐỢI TIN ĐẾN TỪ ZALO (inbound)
 * ==================================================================
 * Nhận sự kiện từ webhook hoặc long-polling:
 *   - Chống xử lý trùng bằng collection butler_inbound (_id = messageId).
 *   - Giới hạn 20 tin mỗi phút mỗi cuộc trò chuyện; quá ngưỡng báo chậm lại một lần.
 *   - Xử lý tuần tự trong từng chatId, song song tối đa `concurrency` cuộc trò chuyện.
 */

const { parseCommand } = require('./commands');
const store = require('./store');
const outbox = require('./outbox');
const engine = require('./engine');
const zalo = require('./zalo');

const UNLINKED_GUIDE =
  'Bot này của Customer Radar. Để nhận báo, mở trang Quản gia trên web, bấm "Nối Zalo" rồi gửi mã 6 số vào đây.';

function createInbound({ authDb, workspaces, maxQueue = 500, concurrency = 2 }) {
  const chatQueues = new Map();
  const activeChats = new Set();
  const readyChats = [];
  let totalQueued = 0;
  let activeWorkers = 0;

  // Giới hạn 20 tin mỗi phút mỗi chatId
  const chatRates = new Map();
  // Đếm số lần nhập sai mã nối Zalo (tối đa 5 lần trong 10 phút mỗi chatId)
  const badCodeTries = new Map();

  function checkChatRate(chatId) {
    const now = Date.now();
    let entry = chatRates.get(chatId);
    if (!entry || now - entry.startMs >= 60 * 1000) {
      entry = { startMs: now, count: 0, warned: false };
      if (chatRates.size > 5000) chatRates.clear();
      chatRates.set(chatId, entry);
    }
    entry.count += 1;
    if (entry.count <= 20) return 'ok';
    if (!entry.warned) {
      entry.warned = true;
      return 'warn';
    }
    return 'drop';
  }

  function recordBadCode(chatId) {
    const now = Date.now();
    const tenMinAgo = now - 10 * 60 * 1000;
    const list = (badCodeTries.get(chatId) || []).filter((t) => t > tenMinAgo);
    list.push(now);
    if (badCodeTries.size > 5000) badCodeTries.clear();
    badCodeTries.set(chatId, list);
    return list.length;
  }

  function isBadCodeLocked(chatId) {
    const now = Date.now();
    const tenMinAgo = now - 10 * 60 * 1000;
    const list = (badCodeTries.get(chatId) || []).filter((t) => t > tenMinAgo);
    return list.length >= 5;
  }

  async function processUpdate(u) {
    const messageId = String(u.messageId || '');
    const chatId = String(u.chatId || '');
    if (!messageId || !chatId) return;

    // 1. Chống xử lý một tin hai lần
    try {
      await authDb.collection('butler_inbound').insertOne({
        _id: messageId,
        at: new Date()
      });
    } catch (e) {
      if (e && e.code === 11000) return;
      throw e;
    }

    // 2. Chỉ xử lý tin chữ
    if (u.kind !== 'text') {
      await outbox.enqueue(authDb, {
        dedupKey: `reply|${messageId}`,
        userId: null,
        chatId,
        kind: 'reply',
        text: 'Quản gia mới đọc được tin chữ.'
      });
      return;
    }

    // 3. Giới hạn 20 tin mỗi phút mỗi cuộc trò chuyện
    const rateState = checkChatRate(chatId);
    if (rateState === 'warn') {
      await outbox.enqueue(authDb, {
        dedupKey: `reply|${messageId}`,
        userId: null,
        chatId,
        kind: 'reply',
        text: 'Nhắn chậm lại một chút.'
      });
      return;
    }
    if (rateState === 'drop') return;

    // 4. Kiểm tra kết nối tài khoản
    const link = await store.findLinkByChat(authDb, chatId);
    if (!link) {
      const cmd = parseCommand(u.text);
      if (cmd.type === 'link_code') {
        if (isBadCodeLocked(chatId)) return;
        const userId = await store.consumeLinkCode(authDb, cmd.code);
        if (!userId) {
          const tries = recordBadCode(chatId);
          if (tries <= 5) {
            await outbox.enqueue(authDb, {
              dedupKey: `reply|${messageId}`,
              userId: null,
              chatId,
              kind: 'reply',
              text: 'Mã nối không đúng hoặc đã hết hạn. Mở trang Quản gia trên web để lấy mã 6 số mới.'
            });
          }
          return;
        }

        const user = await authDb.collection('users').findOne({ _id: userId });
        if (!user) {
          await outbox.enqueue(authDb, {
            dedupKey: `reply|${messageId}`,
            userId: null,
            chatId,
            kind: 'reply',
            text: UNLINKED_GUIDE
          });
          return;
        }

        await store.linkChat(authDb, user._id, chatId, u.fromName);
        badCodeTries.delete(chatId);
        const shopPart = user.shop ? `, shop ${user.shop}` : '';
        await outbox.enqueue(authDb, {
          dedupKey: `reply|${messageId}`,
          userId: user._id,
          chatId,
          kind: 'link',
          text: `Đã nối Zalo với tài khoản ${user.name}${shopPart}. Nhắn "giúp" để xem lệnh.`
        });
        return;
      }

      await outbox.enqueue(authDb, {
        dedupKey: `reply|${messageId}`,
        userId: null,
        chatId,
        kind: 'reply',
        text: UNLINKED_GUIDE
      });
      return;
    }

    // Đã nối Zalo: kiểm tra người dùng còn tồn tại
    const user = await authDb.collection('users').findOne({ _id: link.userId });
    if (!user) {
      await store.unlink(authDb, link.userId);
      await outbox.enqueue(authDb, {
        dedupKey: `reply|${messageId}`,
        userId: null,
        chatId,
        kind: 'reply',
        text: UNLINKED_GUIDE
      });
      return;
    }

    zalo.typing(chatId);
    const ws = require('../tenants').keyFor(user, link.settings?.workspace === 'demo' ? 'demo' : 'real');
    const reply = await engine.handle({
      authDb,
      workspaces,
      user,
      link,
      text: u.text,
      channel: 'zalo',
      workspace: ws
    });

    await store.saveMessage(authDb, {
      userId: user._id,
      channel: 'zalo',
      role: 'user',
      text: u.text,
      reply: null,
      workspace: ws,
      at: u.at || new Date()
    });

    const { text: replyText, ...replyRest } = reply;
    await store.saveMessage(authDb, {
      userId: user._id,
      channel: 'zalo',
      role: 'butler',
      text: replyText,
      reply: { kind: reply.kind, ...replyRest },
      workspace: ws,
      at: new Date()
    });

    await outbox.enqueue(authDb, {
      dedupKey: `reply|${messageId}`,
      userId: user._id,
      chatId,
      kind: 'reply',
      text: replyText
    });
  }

  function pump() {
    while (activeWorkers < concurrency && readyChats.length > 0) {
      const cid = readyChats.shift();
      const q = chatQueues.get(cid);
      if (!q || q.length === 0) {
        chatQueues.delete(cid);
        continue;
      }
      const u = q.shift();
      totalQueued -= 1;
      activeChats.add(cid);
      activeWorkers += 1;

      processUpdate(u)
        .catch((e) => {
          console.error('[QUẢN GIA] Lỗi xử lý tin nhắn Zalo đến:', e.message);
        })
        .finally(() => {
          activeWorkers -= 1;
          activeChats.delete(cid);
          const rem = chatQueues.get(cid);
          if (rem && rem.length > 0) {
            readyChats.push(cid);
          } else {
            chatQueues.delete(cid);
          }
          pump();
        });
    }
  }

  function push(update) {
    if (!update || !update.chatId || !update.messageId) return false;
    if (totalQueued >= maxQueue) {
      console.warn('[QUẢN GIA] Hàng đợi tin đến đã đầy, bỏ qua tin:', update.messageId);
      return false;
    }
    const cid = String(update.chatId);
    let q = chatQueues.get(cid);
    if (!q) {
      q = [];
      chatQueues.set(cid, q);
    }
    q.push(update);
    totalQueued += 1;
    if (!activeChats.has(cid) && !readyChats.includes(cid)) {
      readyChats.push(cid);
    }
    pump();
    return true;
  }

  return {
    push,
    process: processUpdate
  };
}

module.exports = {
  createInbound
};
