/**
 * BÓP CPU ĐỂ GIẢ LẬP RENDER GÓI MIỄN PHÍ (~0,1 CPU), CHỈ DÙNG KHI ĐO TẢI
 * ------------------------------------------------------------------
 * Nạp kèm: node -r ./scripts/cpu_throttle.js server.js
 * Mỗi chu kỳ CPU_PERIOD_MS, tiến trình bị chặn đứng (busy-wait) phần
 * (1 - CPU_SHARE), giống cgroup của Render tạm dừng tiến trình khi hết hạn mức.
 * Không nạp thì không có tác dụng gì.
 */
const share = Math.min(1, Math.max(0.02, Number(process.env.CPU_SHARE || 0.1)));
const period = Number(process.env.CPU_PERIOD_MS || 100);
const blockMs = Math.round(period * (1 - share));
if (share < 1) {
  const timer = setInterval(() => {
    const end = Date.now() + blockMs;
    while (Date.now() < end) { /* giữ CPU, giả lập bị tạm dừng */ }
  }, period - blockMs);
  timer.unref();
  console.log(`[CPU_THROTTLE] Chỉ còn khoảng ${Math.round(share * 100)}% CPU (chặn ${blockMs} ms mỗi ${period} ms)`);
}
