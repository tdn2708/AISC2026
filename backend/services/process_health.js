/**
 * SỨC KHỎE TIẾN TRÌNH
 * ------------------------------------------------------------------
 * Đo độ khựng của vòng lặp sự kiện (event loop) và bộ nhớ mà không hỏi cơ
 * sở dữ liệu. Dùng cho /health/live, bài đo tải livestream và quản gia
 * (báo Zalo khi máy chủ quá tải giữa phiên live).
 */
const { monitorEventLoopDelay } = require('perf_hooks');

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

let windowStart = Date.now();
let last = { p99Ms: 0, maxMs: 0, meanMs: 0 };

/** Số liệu trong cửa sổ hiện tại; reset=true thì bắt đầu cửa sổ mới */
function loopDelay({ reset = false } = {}) {
  const ms = (ns) => Math.round(ns / 1e6);
  const cur = {
    p99Ms: ms(histogram.percentile(99)),
    maxMs: ms(histogram.max),
    meanMs: ms(histogram.mean || 0),
    windowSec: Math.round((Date.now() - windowStart) / 1000)
  };
  if (reset) {
    last = cur;
    histogram.reset();
    windowStart = Date.now();
  }
  return cur;
}

function snapshot({ reset = false } = {}) {
  const m = process.memoryUsage();
  return {
    rssMb: Math.round(m.rss / 1048576),
    heapMb: Math.round(m.heapUsed / 1048576),
    loop: loopDelay({ reset }),
    cpuMs: Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1000),
    uptimeSec: Math.round(process.uptime())
  };
}

// ------------------------------------------------------------------
// Lỗi máy chủ: yêu cầu trả 5xx và lỗi không bắt được, giữ trong 15 phút gần nhất
// để quản gia báo Zalo khi lỗi dồn dập (live_tech.detectSystemProblems)
// ------------------------------------------------------------------
const ERR_KEEP_MS = 15 * 60 * 1000;
const errors = [];
function recordError(kind, where) {
  const now = Date.now();
  errors.push({ at: now, kind, where: String(where || '').slice(0, 120) });
  while (errors.length && now - errors[0].at > ERR_KEEP_MS) errors.shift();
  if (errors.length > 500) errors.splice(0, errors.length - 500);
}
function recentErrors(windowMs = 5 * 60 * 1000, now = Date.now()) {
  const list = errors.filter((e) => now - e.at <= windowMs);
  const byWhere = new Map();
  for (const e of list) byWhere.set(e.where, (byWhere.get(e.where) || 0) + 1);
  return { count: list.length, top: [...byWhere.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([where, n]) => ({ where, n })) };
}

module.exports = { snapshot, loopDelay, lastWindow: () => last, recordError, recentErrors };
