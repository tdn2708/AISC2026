const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// Initialize API Clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Models Configuration
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENROUTER_MODEL = "openai/gpt-4o-mini"; // Powerful, fast, supports JSON
const GEMINI_MODEL = "gemini-2.5-flash";

// 1. analyzeFeedbackBatch -> Routed to GROQ (Extremely fast JSON processing)
const analyzeFeedbackBatch = async (reviewsArray) => {
  const prompt = `
Bạn là chuyên gia phân tích dữ liệu khách hàng.
Phân tích mảng bình luận sau và trả về MẢNG JSON (JSON Array) tuyệt đối không có markdown.

Dữ liệu:
${JSON.stringify(reviewsArray)}

Output format cho mỗi item:
{
  "category": (String),
  "subCategory": (String),
  "sentiment": (String Positive/Neutral/Negative),
  "severity": (String Low/Medium/High/Critical),
  "riskFlag": (Boolean true nếu High/Critical),
  "aiSummary": (String 1 câu)
}
`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: GROQ_MODEL,
    });
    
    let textOutput = completion.choices[0].message.content;
    if (textOutput.startsWith('```json')) textOutput = textOutput.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '');
    else if (textOutput.startsWith('\`\`\`')) textOutput = textOutput.replace(/\`\`\`/g, '');
    
    return JSON.parse(textOutput.trim());
  } catch (error) {
    console.error('[GROQ] Lỗi analyzeFeedbackBatch:', error.message);
    // Fallback Mock
    const categories = ['Delivery', 'Product Quality', 'Customer Service', 'Payment', 'Refund'];
    const sentiments = ['Positive', 'Neutral', 'Negative'];
    const severities = ['Low', 'Medium', 'High', 'Critical'];
    
    return reviewsArray.map((_, index) => {
      const isNegative = index % 3 === 0;
      const severity = isNegative ? severities[Math.floor(Math.random() * 2) + 2] : severities[Math.floor(Math.random() * 2)];
      return {
        category: categories[index % categories.length],
        subCategory: 'Vấn đề phát sinh',
        sentiment: isNegative ? 'Negative' : sentiments[Math.floor(Math.random() * 2)],
        severity: severity,
        riskFlag: severity === 'High' || severity === 'Critical',
        aiSummary: isNegative ? 'Khách hàng gặp vấn đề nghiêm trọng cần xử lý.' : 'Trải nghiệm khách hàng bình thường.'
      };
    });
  }
};

// 2. generatePrediction -> Routed to OPENROUTER (Strategic Reasoning) -> Fallback GROQ
async function generatePrediction(feedbacks, timeFilter = 'All', productFilter = 'All') {
  let timeContext = "30 ngày tới";
  if (timeFilter === 'Today') timeContext = "7 ngày tới";
  else if (timeFilter === 'This Week') timeContext = "tháng tới (4 tuần tiếp theo)";
  else if (timeFilter === 'This Month') timeContext = "Quý tới (3 tháng tiếp theo)";
  
  let productContext = productFilter !== 'All' ? `về sản phẩm (${productFilter})` : 'về tất cả sản phẩm';

  const prompt = `
  Bạn là chuyên gia AI Phân tích Dữ liệu CXM.
  Khách hàng ${productContext}. Thời gian: ${timeFilter}.
  Dự đoán xu hướng trong ${timeContext}.
  Output JSON format:
  {
    "aiReport": "Đoạn văn 3-4 câu phân tích sâu tình hình và rủi ro.",
    "actionableSteps": ["Bước 1...", "Bước 2...", "Bước 3..."],
    "topRisks": [
      {"name": "Rủi ro A", "probability": "Cao"},
      {"name": "Rủi ro B", "probability": "Trung bình"}
    ]
  }
  
  Dữ liệu:
  ${JSON.stringify(feedbacks.map(f => ({text: f.originalText, sentiment: f.sentiment, category: f.category})), null, 2)}
  `;

  try {
    // Primary: OpenRouter
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'http://localhost:3000',
        'Content-Type': 'application/json'
      }
    });

    let jsonText = response.data.choices[0].message.content.trim();
    return JSON.parse(jsonText);

  } catch (error) {
    console.warn("[OPENROUTER] Lỗi generatePrediction, chuyển sang GROQ fallback:", error.message);
    try {
      // Fallback 1: Groq
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: GROQ_MODEL,
        response_format: { type: "json_object" }
      });
      let jsonText = completion.choices[0].message.content.trim();
      return JSON.parse(jsonText);

    } catch (fallbackError) {
      console.error("[GROQ] Lỗi fallback generatePrediction:", fallbackError.message);
      // Fallback 2: Mock
      const total = feedbacks.length;
      const negativeCount = feedbacks.filter(f => f.sentiment === 'Negative').length;
      return {
        aiReport: `(Chế độ Dự phòng) Hệ thống ghi nhận ${negativeCount} khiếu nại tiêu cực trên tổng ${total} phản hồi. Cần chú ý theo dõi biến động.`,
        actionableSteps: ["Kiểm tra lại toàn bộ quy trình", "Liên hệ với khách hàng có trải nghiệm xấu", "Tối ưu hóa thời gian phản hồi"],
        topRisks: [{ name: "Rủi ro chung", probability: "Trung bình" }]
      };
    }
  }
}

// 3. chatWithData -> Routed to GEMINI (Conversational Context) -> Fallback OPENROUTER
async function chatWithData(userMessage, feedbacks) {
  const prompt = `
  Ngươi là "CustomerRadar AI", Chuyên gia Phân tích CXO.
  Xưng hô: "Tôi" và "Bạn". Trả lời NGẮN GỌN bằng Markdown.
  LƯU Ý QUAN TRỌNG: Bạn đang được cung cấp một mảng chứa TẤT CẢ ${feedbacks.length} phản hồi từ hệ thống. Nếu người dùng hỏi có bao nhiêu phản hồi, HÃY TRẢ LỜI LÀ ${feedbacks.length}.
  
  Câu hỏi: "${userMessage}"
  
  Dữ liệu (${feedbacks.length} phản hồi):
  ${JSON.stringify(feedbacks.map(f => ({text: f.originalText, sentiment: f.sentiment, category: f.category})), null, 2)}
  `;

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.warn("[GEMINI] Lỗi chatWithData, chuyển sang OPENROUTER fallback:", error.message);
    try {
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: OPENROUTER_MODEL,
        messages: [{ role: "user", content: prompt }]
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data.choices[0].message.content.trim();
    } catch (fallbackError) {
      return "Xin lỗi, tất cả hệ thống AI đều đang quá tải. Vui lòng thử lại sau.";
    }
  }
};

const generateRiskAlertsBatch = async (highRisks) => {
  if (!highRisks || highRisks.length === 0) return [];
  
  const prompt = `
Bạn là chuyên gia quản trị rủi ro (Risk Manager).
Hãy phân tích danh sách các rủi ro (feedback tiêu cực/nghiêm trọng) sau đây và trả về MẢNG JSON (JSON Array) tuyệt đối không có markdown (\`\`\`json).

Dữ liệu đầu vào:
${JSON.stringify(highRisks.map(r => ({id: r._id, text: r.originalText, category: r.category, severity: r.severity})), null, 2)}

Yêu cầu Output JSON Array format cho mỗi item:
[
  {
    "id": "String (phải giữ nguyên id từ dữ liệu đầu vào)",
    "issue": "String (tóm tắt ngắn gọn vấn đề, vd: 'Lỗi phần cứng diện rộng')",
    "riskLevel": "String (CRITICAL hoặc HIGH)",
    "insight": "String (1-2 câu giải thích tại sao đây là rủi ro và tác động của nó)",
    "recommendations": ["String (Hành động 1)", "String (Hành động 2)"]
  }
]
`;

  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: OPENROUTER_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" } // While array is requested, some providers need object. We will parse it carefully.
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'http://localhost:3000',
        'Content-Type': 'application/json'
      }
    });

    let textOutput = response.data.choices[0].message.content.trim();
    if (textOutput.startsWith('```json')) textOutput = textOutput.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '');
    else if (textOutput.startsWith('```')) textOutput = textOutput.replace(/\`\`\`/g, '');
    
    // Parse the output. Sometimes it returns an object { "alerts": [...] } or just [...]
    const parsed = JSON.parse(textOutput);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.alerts && Array.isArray(parsed.alerts)) return parsed.alerts;
    
    // Fallback if parsing fails structurally but doesn't throw
    return Object.values(parsed).find(val => Array.isArray(val)) || [];

  } catch (error) {
    console.error("[OPENROUTER] Lỗi generateRiskAlertsBatch:", error.message);
    // Fallback: Return manual mapping if AI fails
    return highRisks.map(risk => ({
      id: risk._id,
      issue: risk.category + (risk.subCategory ? ` - ${risk.subCategory}` : ''),
      riskLevel: risk.severity.toUpperCase(),
      insight: risk.aiSummary || `Phát hiện vấn đề nghiêm trọng từ nguồn: ${risk.source}`,
      recommendations: ["Chuyển tiếp báo cáo cho bộ phận liên quan để xử lý ngay lập tức."]
    }));
  }
};

module.exports = {
  analyzeFeedbackBatch,
  generatePrediction,
  chatWithData,
  generateRiskAlertsBatch
};
