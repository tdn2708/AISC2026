const { MongoClient } = require('mongodb');
const uri = "mongodb+srv://nthanhdung2708dn_db_user:lb1ciCFNb03FryXb@cluster0.bezprjg.mongodb.net/customer_radar?retryWrites=true&w=majority";

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
