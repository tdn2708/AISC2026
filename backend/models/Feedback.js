const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  source: { type: String, enum: ['Facebook', 'TikTok', 'Other'], required: true },
  originalText: { type: String, required: true },
  author: { type: String },
  timestamp: { type: Date, default: Date.now },
  
  // AI Analyzed Fields
  category: { 
    type: String, 
    enum: ['Delivery', 'Product Quality', 'Customer Service', 'Payment', 'Technical Issue', 'Refund', 'Other'],
    default: 'Other'
  },
  subCategory: { type: String },
  sentiment: { 
    type: String, 
    enum: ['Positive', 'Neutral', 'Negative'],
    default: 'Neutral'
  },
  severity: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Low'
  },
  riskFlag: { type: Boolean, default: false },
  aiSummary: { type: String } // A short summary or extracted topic from AI
});

module.exports = mongoose.model('Feedback', feedbackSchema);
