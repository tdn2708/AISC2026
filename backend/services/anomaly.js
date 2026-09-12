/**
 * ISOLATION FOREST — phát hiện điểm dị thường không cần nhãn
 * ------------------------------------------------------------------
 * Dùng ở tín hiệu (3) của Trust Layer: bất thường hành vi tài khoản.
 * Chọn phương pháp không giám sát vì ta không có nhãn "tài khoản ảo" —
 * và cũng không có cách nào xác minh tuyệt đối điều đó từ dữ liệu công
 * khai. Isolation Forest cô lập điểm bất thường bằng số lần cắt ngẫu
 * nhiên cần thiết: điểm càng dễ cô lập thì càng bất thường.
 *
 * Cài đặt theo Liu, Ting & Zhou (2008), ICDM.
 */

/**
 * Độ dài đường đi trung bình của cây tìm kiếm nhị phân không thành công
 * trên n điểm — hằng số chuẩn hóa c(n).
 */
function averagePathLength(n) {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  const EULER = 0.5772156649;
  return 2 * (Math.log(n - 1) + EULER) - (2 * (n - 1)) / n;
}

function buildTree(points, currentHeight, heightLimit, dims, rng) {
  if (currentHeight >= heightLimit || points.length <= 1) {
    return { type: 'leaf', size: points.length };
  }

  // Chọn ngẫu nhiên một chiều còn phân tán được
  const candidates = [];
  for (let d = 0; d < dims; d++) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of points) {
      if (p[d] < min) min = p[d];
      if (p[d] > max) max = p[d];
    }
    if (max > min) candidates.push({ d, min, max });
  }

  if (candidates.length === 0) {
    return { type: 'leaf', size: points.length };
  }

  const pick = candidates[Math.floor(rng() * candidates.length)];
  const splitValue = pick.min + rng() * (pick.max - pick.min);

  const left = [];
  const right = [];
  for (const p of points) {
    if (p[pick.d] < splitValue) left.push(p);
    else right.push(p);
  }

  return {
    type: 'node',
    dim: pick.d,
    split: splitValue,
    left: buildTree(left, currentHeight + 1, heightLimit, dims, rng),
    right: buildTree(right, currentHeight + 1, heightLimit, dims, rng)
  };
}

function pathLength(point, node, currentHeight) {
  if (node.type === 'leaf') {
    // Cộng bù độ dài đường đi trung bình của phần chưa cô lập hết
    return currentHeight + averagePathLength(node.size);
  }
  return point[node.dim] < node.split
    ? pathLength(point, node.left, currentHeight + 1)
    : pathLength(point, node.right, currentHeight + 1);
}

/** Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32) — để kết quả tái lập được */
function seededRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Huấn luyện rừng và chấm điểm bất thường cho từng điểm.
 *
 * @param {number[][]} data ma trận đặc trưng
 * @param {{trees?:number, sampleSize?:number, seed?:number}} opts
 * @returns {number[]} điểm bất thường trong [0,1]; >0.6 là đáng ngờ,
 *          ~0.5 là bình thường, <0.4 gần như chắc chắn bình thường
 */
function isolationForestScores(data, opts = {}) {
  const n = data.length;
  if (n === 0) return [];
  if (n < 8) return data.map(() => 0.5); // quá ít điểm để nói gì có nghĩa

  const dims = data[0].length;
  const numTrees = opts.trees ?? 100;
  const sampleSize = Math.min(opts.sampleSize ?? 256, n);
  const heightLimit = Math.ceil(Math.log2(Math.max(2, sampleSize)));
  const rng = seededRandom(opts.seed ?? 42);

  const forest = [];
  for (let t = 0; t < numTrees; t++) {
    const sample = [];
    for (let i = 0; i < sampleSize; i++) {
      sample.push(data[Math.floor(rng() * n)]);
    }
    forest.push(buildTree(sample, 0, heightLimit, dims, rng));
  }

  const c = averagePathLength(sampleSize);

  return data.map((point) => {
    let total = 0;
    for (const tree of forest) total += pathLength(point, tree, 0);
    const expected = total / numTrees;
    return Math.pow(2, -expected / c);
  });
}

/** Phương sai mẫu — dùng cho đặc trưng "phương sai khoảng cách thời gian" */
function variance(values) {
  if (!values || values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
}

module.exports = { isolationForestScores, averagePathLength, variance, seededRandom };
