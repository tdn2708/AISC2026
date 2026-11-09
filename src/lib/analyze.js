import axios from 'axios';
import { useSyncExternalStore } from 'react';
import {
  browserModelSupported, loadBrowserModel, browserExplain, browserPredict, getModelStatus, subscribeModelStatus
} from './visobertBrowser';

/**
 * PHÂN TÍCH MỘT CÂU — máy chủ trước, trình duyệt khi cần.
 * Lượt 1: POST /analyze như bình thường. Nếu máy chủ không có dịch vụ mô hình
 * (trace.model.available = false), trình duyệt tự chạy ViSoBERT trên đúng
 * `modelInput` (đã che PII ở máy chủ) rồi gửi lượt 2 kèm kết quả, để câu đi
 * tiếp qua cùng các tầng phía sau. Trình duyệt không chạy được thì giữ kết
 * quả lượt 1 (lớp luật) — không bao giờ để màn hình trống.
 */
export async function analyzeText(text) {
  const first = (await axios.post('/analyze', { text })).data;
  if (first.trace?.model?.available || !first.modelInput || !browserModelSupported()) return first;
  try {
    const clientExplain = await browserExplain(first.modelInput);
    return (await axios.post('/analyze', { text, clientExplain })).data;
  } catch (e) {
    console.warn('Không chạy được mô hình trên trình duyệt, dùng kết quả lớp luật:', e);
    return first;
  }
}

/**
 * Chạy cả lô. Máy chủ có mô hình thì dùng máy chủ; không thì trình duyệt chạy
 * trên /model-inputs của lô rồi gửi kết quả kèm thời gian đo được.
 */
export async function analyzeBatch(texts, { serverHasModel, onProgress } = {}) {
  if (serverHasModel || !browserModelSupported()) return (await axios.post('/analyze/batch', { texts })).data;
  try {
    const { texts: clean, inputs } = (await axios.post('/model-inputs', { texts })).data;
    await loadBrowserModel();
    // Chạy từng nhóm nhỏ và nhường trình duyệt vẽ lại giữa các nhóm: 200 câu mất
    // gần một phút trên CPU, không báo tiến độ thì trông như trang bị treo
    const CHUNK = 8;
    const clientPredictions = [];
    let modelMs = 0;
    onProgress?.(0, inputs.length);
    for (let i = 0; i < inputs.length; i += CHUNK) {
      const t0 = performance.now();
      clientPredictions.push(...(await browserPredict(inputs.slice(i, i + CHUNK))));
      modelMs += performance.now() - t0;
      onProgress?.(Math.min(i + CHUNK, inputs.length), inputs.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    const clientModelMs = Math.round(modelMs * 10) / 10;
    return (await axios.post('/analyze/batch', { texts: clean, clientPredictions, clientModelMs })).data;
  } catch (e) {
    console.warn('Không chạy được mô hình trên trình duyệt, dùng lớp luật:', e);
    return (await axios.post('/analyze/batch', { texts })).data;
  }
}

/** Trạng thái tải mô hình trên trình duyệt, cho thanh tiến độ */
export const useBrowserModelStatus = () => useSyncExternalStore(subscribeModelStatus, getModelStatus);

/** Bắt đầu tải mô hình sớm (khi mở Lab) nếu máy chủ không có dịch vụ mô hình */
export function preloadBrowserModel() {
  if (browserModelSupported()) loadBrowserModel().catch(() => {});
}
