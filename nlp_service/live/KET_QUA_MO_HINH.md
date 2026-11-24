Kết quả lần chạy Kaggle 18/11/2026 (ViSoBERT, trung bình 3 seed; test 1.345 câu / 35 phiên, không phiên nào trùng train/dev).

| Chỉ số | ViSoBERT fine-tune | Luật từ khoá cũ |
|---|---|---|
| Intent macro-F1 | **0,577** | 0,228 |
| Intent accuracy | 0,839 | |
| Aspects micro-F1 / macro-F1 | 0,690 / 0,391 | |
| Sentiment macro-F1 | 0,743 | |
| Needs_reply F1 | 0,946 | |

F1 theo intent: ORDER 0,92 · QUESTION 0,89 · SOCIAL 0,80 · PRAISE 0,76 · REQUEST 0,74 · OTHER 0,51 · COMPLAINT 0,47 · NEGOTIATE 0,11 · GIVEAWAY 0,00 (NEGOTIATE/GIVEAWAY chỉ 8 và 4 câu test).

Checkpoint bàn giao là seed 42: intent macro-F1 0,577 (KTC 95% theo phiên 0,524–0,660), accuracy 0,838, aspects 0,679 / 0,384, sentiment 0,734, needs_reply 0,947.
