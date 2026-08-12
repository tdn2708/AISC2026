const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
  try {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // Actually, getting the list of models is not directly exposed in the JS SDK in a simple way.
    // Let's just fetch it using axios directly.
    const axios = require('axios');
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
    const response = await axios.get(url);
    console.log("AVAILABLE MODELS:");
    response.data.models.forEach(m => console.log(m.name));
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
}
listModels();
