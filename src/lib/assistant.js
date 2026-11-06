/**
 * Mở trợ lý "Hỏi dữ liệu" từ bất kỳ đâu (thanh trên, Ctrl+K, nút "Hỏi về
 * cảnh báo này") mà không phải truyền props xuyên qua cây component:
 * trợ lý nghe sự kiện trên window.
 */
export const ASK_EVENT = 'cr-ask';

export const openAssistant = () => window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: {} }));

export const askAssistant = (question) =>
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { question: String(question || '').trim() } }));
