/**
 * MÁY CHỦ ZALO BOT PLATFORM GIẢ LẬP (CỔNG 5055)
 * ==================================================================
 * Dùng để kiểm thử đầu cuối và kiểm thử tải trên máy cục bộ mà không cần
 * kết nối tới máy chủ Zalo thật.
 */

const express = require('express');

function createMockZaloApp() {
  const app = express();
  app.use(express.json());

  let seq = Date.now();
  let failNext = 0;
  const sent = [];
  const updates = [];
  const waiters = [];

  function pushUpdate(ev) {
    if (waiters.length > 0) {
      const w = waiters.shift();
      w(ev);
    } else {
      updates.push(ev);
    }
  }

  // Giả lập phương thức của Bot: /bot<TOKEN>/<method>
  app.post(/^\/bot[^/]+\/([A-Za-z0-9_]+)$/, (req, res) => {
    const method = req.params[0];

    if (method === 'getMe') {
      return res.json({
        ok: true,
        result: {
          id: '1',
          account_name: 'Bot Radar Thử',
          account_type: 'bot',
          can_join_groups: false
        }
      });
    }

    if (method === 'sendChatAction' || method === 'setWebhook') {
      return res.json({ ok: true, result: true });
    }

    if (method === 'sendMessage') {
      if (failNext > 0) {
        failNext -= 1;
        return res.status(500).json({
          ok: false,
          error_code: 500,
          description: 'Lỗi máy chủ giả lập'
        });
      }
      seq += 1;
      const chatId = String(req.body?.chat_id ?? '');
      const text = String(req.body?.text ?? '');
      const item = {
        message_id: String(seq),
        chat_id: chatId,
        text,
        date: Date.now()
      };
      sent.push(item);
      const preview = text.replace(/\s+/g, ' ').slice(0, 80);
      console.log(`[GỬI] chat=${chatId}: ${preview}`);
      return res.json({
        ok: true,
        result: { message_id: item.message_id, date: item.date }
      });
    }

    if (method === 'getUpdates') {
      if (updates.length > 0) {
        const ev = updates.shift();
        return res.json({ ok: true, result: ev });
      }
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        const idx = waiters.indexOf(deliver);
        if (idx !== -1) waiters.splice(idx, 1);
        res.json({ ok: false, error_code: 408, description: 'timeout' });
      }, 25000);
      if (timer.unref) timer.unref();

      const deliver = (ev) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        res.json({ ok: true, result: ev });
      };
      waiters.push(deliver);
      res.on('close', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const idx = waiters.indexOf(deliver);
        if (idx !== -1) waiters.splice(idx, 1);
      });
      return;
    }

    return res.status(404).json({ ok: false, error_code: 404, description: `Unknown method ${method}` });
  });

  // Các đường điều khiển riêng cho kịch bản kiểm thử
  app.post('/_say', (req, res) => {
    seq += 1;
    const msgId = req.body?.message_id != null ? String(req.body.message_id) : String(seq);
    const chatId = String(req.body?.chat_id ?? '9001');
    const text = String(req.body?.text ?? '');
    const name = String(req.body?.name ?? 'Chủ Shop Thử');
    const eventName = String(req.body?.event_name || 'message.text.received');
    const ev = {
      event_name: eventName,
      message: {
        message_id: msgId,
        date: Date.now(),
        message_type: eventName === 'message.text.received' ? 'text' : 'other',
        text,
        from: { id: chatId, display_name: name, is_bot: Boolean(req.body?.is_bot) },
        chat: { id: chatId, chat_type: 'PRIVATE' }
      }
    };
    pushUpdate(ev);
    res.json({ ok: true, message_id: msgId, event: ev });
  });

  app.post('/_fail', (req, res) => {
    failNext = Math.max(0, Number(req.body?.n) || 0);
    res.json({ ok: true, failNext });
  });

  app.get('/_sent', (_req, res) => {
    res.json({ sent, failNext });
  });

  app.post('/_reset', (_req, res) => {
    sent.length = 0;
    updates.length = 0;
    failNext = 0;
    res.json({ ok: true });
  });

  return app;
}

if (require.main === module) {
  const port = Number(process.env.MOCK_ZALO_PORT) || 5055;
  const app = createMockZaloApp();
  app.listen(port, '127.0.0.1', () => {
    console.log(`Máy Zalo giả lập đang chạy tại http://127.0.0.1:${port}`);
  });
}

module.exports = { createMockZaloApp };
