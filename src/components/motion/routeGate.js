/**
 * Trạng thái dùng chung giữa RouteTransition (ghi) và PageEnter (đọc), K3-01.
 * promise: lời hứa "chuyển trang bằng View Transition đã sẵn sàng chạy";
 * mounting: trang mới đang được gắn vào DOM giữa lần chuyển đó.
 * PageEnter tạm dừng animation tới khi promise giải, khỏi mất khung đầu.
 */
export const routeGate = { promise: null, mounting: false };

/** Promise khi trang đang gắn vào giữa một View Transition, không thì null */
export const routeReady = () => (routeGate.mounting ? routeGate.promise : null);
