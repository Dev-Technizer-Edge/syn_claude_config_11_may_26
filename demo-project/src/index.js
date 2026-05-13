const express = require('express');
const authRoutes = require('./api/routes');
const { requestLogger, errorHandler } = require('./api/middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust exactly one upstream reverse-proxy hop (e.g. nginx / AWS ALB).
// This lets Express resolve req.ip from X-Forwarded-For only when the TCP
// connection arrives from a trusted proxy — direct clients cannot spoof it.
app.set('trust proxy', 1);

app.use(express.json());
app.use(requestLogger);

app.use('/api/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
