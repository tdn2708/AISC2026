require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

async function startServer() {
  try {
    await client.connect();
    console.log('✅ MongoDB Native Driver connected successfully');
    
    // Inject the db into the request so routes can use it
    const db = client.db('customer_radar');
    app.use((req, res, next) => {
      req.db = db;
      next();
    });

    const apiRoutes = require('./routes/api');
    app.use('/api', apiRoutes);

    app.get('/', (req, res) => {
      res.send('Customer Radar API is running');
    });

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch(e) {
    console.error('❌ Error connecting to MongoDB', e);
  }
}

startServer();
