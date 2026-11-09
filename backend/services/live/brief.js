/**
 * DỮ KIỆN LIVESTREAM CHO TRỢ LÝ "HỎI DỮ LIỆU"
 * Gom số liệu phiên đang live, phiên vừa kết thúc và vài phiên gần nhất thành
 * các câu dữ kiện ngắn. Trợ lý chỉ được diễn đạt lại các câu này, không tự tính.
 */

const hub = require('./hub');
const { buildReport } = require('./report');

const money = (n) => (n == null ? 'chưa rõ' : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} triệu đồng` : `${Math.round(n / 1000).toLocaleString('vi-VN')} nghìn đồng`);
const pct = (x) => (x == null ? 'chưa rõ' : `${Math.round(x * 100)}%`);

async function liveBriefing(db, workspace) {
  const sessions = await db.collection('live_sessions').find({}).sort({ createdAt: -1 }).limit(8).toArray();
  if (!sessions.length) return { facts: ['Kho này chưa có phiên livestream nào.'], sessionId: null };
  const facts = [];

  const running = sessions.map((s) => ({ s, r: hub.runtimeFor(s._id, workspace) })).find(({ r }) => r && r.status !== 'ended');
  if (running) {
    const snap = running.r.snapshot();
    const t = snap.totals;
    facts.push(`Đang live: "${running.s.title}"${running.s.simulated && !/mô phỏng/i.test(running.s.title) ? ' (mô phỏng)' : ''}, ${snap.viewers.now != null ? `${snap.viewers.now} người xem, ` : ''}${t.comments} bình luận, ${t.byIntent.order} lượt chốt (${t.orderQuantity} sản phẩm), ${t.byIntent.complaint} khiếu nại, ${snap.queueOpen} nhóm câu hỏi đang chờ trả lời.`);
    for (const a of snap.actions.active.slice(0, 3)) facts.push(`Việc nên làm ngay trong phiên: ${a.title}. ${a.why}`);
  }

  const target = running ? running.s : sessions.find((s) => s.status === 'ended');
  if (target) {
    const rep = await buildReport(db, target);
    const label = running ? 'Phiên đang live tính đến hiện tại' : `Phiên gần nhất "${target.title}"${target.simulated && !/mô phỏng/i.test(target.title) ? ' (mô phỏng)' : ''}`;
    facts.push(`${label}: doanh thu ước tính từ bình luận chốt ${money(rep.revenue.estimated)}, doanh thu lỡ vì hết hàng ${money(rep.revenue.lostTotal)}, ${pct(rep.response.answeredShare)} khách hỏi được trả lời.`);
    if (rep.revenue.lost[0]) {
      const l = rep.revenue.lost[0];
      facts.push(`Hết hàng gây lỡ nhiều nhất: ${l.name}${l.variant ? ` ${l.variant}` : ''}, ${l.people} lượt chốt đến sau khi hết (${money(l.value)}).`);
    }
    if (rep.topics.length) facts.push(`Khách hỏi nhiều nhất về: ${rep.topics.slice(0, 3).map((x) => `${x.label.toLowerCase()} (${x.count} câu)`).join(', ')}.`);
    if (rep.complaints.total) facts.push(`Khiếu nại: ${rep.complaints.total}, nhiều nhất ${rep.complaints.byCategory.slice(0, 2).map((c) => `${c.label.toLowerCase()} (${c.count})`).join(', ')}; ${rep.complaints.pushed} đã đưa vào hệ thống phản hồi.`);
    const best = rep.products.slice().sort((a, b) => b.quantity - a.quantity)[0];
    if (best) facts.push(`Sản phẩm chốt nhiều nhất: ${best.name} (${best.quantity} sản phẩm, ${best.questions} câu hỏi).`);
    for (const x of rep.todo.slice(0, 4)) facts.push(`Việc cho phiên sau: ${x.title}. ${x.detail}`);
  }

  const ended = sessions.filter((s) => s.status === 'ended' && s.summary).slice(0, 5);
  if (ended.length >= 2) {
    facts.push(`Các phiên gần đây: ${ended.map((s) => `"${s.title}" ${s.summary.comments} bình luận, ${s.summary.byIntent?.order ?? 0} lượt chốt${s.summary.revenue != null ? `, ${money(s.summary.revenue)}` : ''}`).join('; ')}.`);
  }
  return { facts, sessionId: target ? String(target._id) : null };
}

module.exports = { liveBriefing };
