const fs = require('fs');
const path = require('path');
const { classifyComment } = require(path.resolve(__dirname, '../../backend/services/live/intent.js'));
const INTENT = { order: 'ORDER', question: 'QUESTION', complaint: 'COMPLAINT', praise: 'PRAISE', chatter: 'SOCIAL' };
const TOPIC = { promo: 'PROMOTION', price: 'PRICE', warranty: 'QUALITY_TRUST', stock: 'STOCK', size: 'SIZE_FIT', shipping: 'SHIPPING',
  material: 'SPEC_MATERIAL', color: 'VARIANT', payment: 'ORDER_PROCESS', authenticity: 'QUALITY_TRUST', howToOrder: 'ORDER_PROCESS', usage: 'USAGE' };
const SENT = { Positive: 'POS', Negative: 'NEG', Neutral: 'NEU' };
const items = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = items.map(({ item_id, text }) => {
  const r = classifyComment(text);
  const intent = INTENT[r.intent] || 'OTHER';
  return {
    item_id, intent,
    aspects: r.topic && TOPIC[r.topic] ? [TOPIC[r.topic]] : [],
    sentiment: SENT[r.sentiment] || 'NEU',
    needs_reply: ['QUESTION', 'COMPLAINT'].includes(intent) ? 1 : 0,
    product_ref: ''
  };
});
fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 0));
console.log('rules labelled', out.length);
