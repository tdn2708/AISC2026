/**
 * So sánh props theo NỘI DUNG cho React.memo: stats về mỗi 1,5 giây là object mới
 * dù phần lớn không đổi, nên so theo tham chiếu thì khối nào cũng vẽ lại.
 * Hàm truyền vào bị bỏ qua (mỗi lần vẽ là hàm mới nhưng cùng việc).
 */
export const sameContent = (a, b) => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    if (typeof a[k] === 'function' && typeof b[k] === 'function') return true;
    if (Object.is(a[k], b[k])) return true;
    if (a[k] && b[k] && typeof a[k] === 'object' && typeof b[k] === 'object') return JSON.stringify(a[k]) === JSON.stringify(b[k]);
    return false;
  });
};
