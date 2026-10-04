import { useState, useCallback } from 'react';
import axios from 'axios';

/**
 * Ghi quyết định cho một khuyến nghị: Chấp nhận / Bỏ qua.
 * Dùng chung cho Trung tâm hành động trên Tổng quan và trang Cảnh báo, để
 * hai nơi gửi cùng một dạng dữ liệu — ở mức HÀNH ĐỘNG (actionIds, scopeKey),
 * không chỉ mức cảnh báo, vì vòng lặp học của recommender cần đúng hai
 * trường đó để quy quyết định về mẫu hành động.
 *
 * Trạng thái mỗi cảnh báo: undefined | 'saving' | 'ACCEPTED' | 'DISMISSED' | 'error'
 */
export const useDecisions = (initial = {}) => {
  const [states, setStates] = useState(initial);

  const decide = useCallback(async (alert, decision, reason) => {
    const rec = alert.recommendation;
    setStates((s) => ({ ...s, [alert.id]: 'saving' }));
    try {
      await axios.post('/recommendations/decision', {
        alertId: alert.id,
        decision,
        reason: reason || undefined,
        actionIds: rec?.steps?.map((st) => st.actionId) ?? [],
        scopeKey: rec?.scopeKey
      });
      setStates((s) => ({ ...s, [alert.id]: decision }));
      return true;
    } catch (err) {
      console.error('Không lưu được quyết định:', err);
      setStates((s) => ({ ...s, [alert.id]: 'error' }));
      return false;
    }
  }, []);

  return {
    states,
    setStates,
    accept: (alert) => decide(alert, 'ACCEPTED'),
    dismiss: (alert, reason) => decide(alert, 'DISMISSED', reason)
  };
};
