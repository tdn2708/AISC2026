const { MongoClient } = require('mongodb');
require('dotenv').config();
// Chuoi ket noi CHI doc tu bien moi truong.
const uri = process.env.MONGODB_URI;

async function run() {
  const client = new MongoClient(uri);
  try {
    console.log("Connecting...");
    await client.connect();
    console.log("Connected correctly to server");
    const db = client.db("customer_radar");
    const col = db.collection("feedbacks");
    await col.insertOne({ test: "data" });
    console.log("Insert successful!");
  } catch (err) {
    console.log(err.stack);
  } finally {
    await client.close();
  }
}
run();
