# order-service

Order processing API for the demo platform.

## Stack
- Node.js 18+
- Express
- Redis (cache + session store)

## Conventions
- Environment variables in `.env`
- Structured logs in `/logs/orders-YYYY-MM-DD.log`
- Redis is required; service crashes if unreachable
- **Production Redis listens on 6379 (standard)**

## Recent deploys
See `/logs/deploys.log` for deploy history.
