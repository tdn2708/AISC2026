export const kpiData = {
  totalComplaints: 2458,
  complaintRate: "1.2%",
  avgResolutionTime: "4.5 hrs"
};

export const categoryData = [
  { name: 'Delivery', value: 35, fill: 'var(--accent-blue)' },
  { name: 'Product Quality', value: 28, fill: 'var(--accent-purple)' },
  { name: 'Customer Service', value: 20, fill: 'var(--accent-cyan)' },
  { name: 'Payment', value: 17, fill: 'var(--accent-indigo)' }
];

export const sentimentData = [
  { name: 'Negative', value: 65, fill: 'var(--risk-critical)' },
  { name: 'Neutral', value: 20, fill: 'var(--risk-medium)' },
  { name: 'Positive', value: 15, fill: 'var(--risk-low)' }
];

export const trendData = [
  { month: 'Jan', delivery: 18, product: 12, service: 15 },
  { month: 'Feb', delivery: 24, product: 14, service: 12 },
  { month: 'Mar', delivery: 35, product: 15, service: 10 },
  { month: 'Apr', delivery: 42, product: 18, service: 8 },
  { month: 'May', delivery: 50, product: 20, service: 9 }
];

export const risingIssues = [
  {
    issue: "Late Delivery",
    increase: "+40%",
    riskLevel: "HIGH",
    insight: "Khiếu nại giao hàng tăng 40%, tập trung chủ yếu ở khu vực A và B.",
    recommendations: [
      "Kiểm tra năng lực đơn vị vận chuyển tại A/B.",
      "Tăng capacity trong khung giờ cao điểm."
    ]
  },
  {
    issue: "Damaged Package",
    increase: "+15%",
    riskLevel: "MEDIUM",
    insight: "Phản hồi về việc hộp bị móp méo khi nhận hàng.",
    recommendations: [
      "Xem xét lại quy cách đóng gói cho hàng dễ vỡ."
    ]
  }
];
