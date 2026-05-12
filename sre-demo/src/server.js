const express = require('express');
const redis = require('redis');

const app = express();
const PORT = process.env.PORT || 3000;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const client = redis.createClient({
  socket: { host: REDIS_HOST, port: REDIS_PORT }
});

client.on('error', (err) => {
  console.error(`[${new Date().toISOString()}] Redis connection error: ${err.message}`);
});

app.get('/order/:id', async (req, res) => {
  try {
    await client.connect();
    const order = await client.get(`order:${req.params.id}`);
    res.json({ order });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Request failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`order-service listening on ${PORT}`));
