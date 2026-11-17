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

module.exports = { snapshot, loopDelay, lastWindow: () => last };
