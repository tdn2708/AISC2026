/**
 * Luồng riêng chạy phần tính của ngữ cảnh phân tích (xem context_compute.js).
 * Nhận { id, input }, trả { id, ok, value | error }. Một worker sống suốt đời
 * tiến trình, mỗi lúc tính một kho.
 */
const { parentPort } = require('worker_threads');
const { computeContext } = require('./context_compute');

parentPort.on('message', ({ id, input }) => {
  try {
    const t0 = Date.now();
    const value = computeContext(input);
    parentPort.postMessage({ id, ok: true, value, computeMs: Date.now() - t0 });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e && e.message ? e.message : String(e) });
  }
});
