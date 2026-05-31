require("dotenv").config();

module.exports = {
  pg: {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER || "iot",
    password: process.env.PG_PASSWORD || "iot_secret",
    database: process.env.PG_DATABASE || "iot_commands",
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
  api: {
    port: Number(process.env.API_PORT) || 3000,
  },
  tcp: {
    devicePort: Number(process.env.TCP_DEVICE_PORT) || 4000,
  },
  scheduler: {
    pollIntervalMs: Number(process.env.SCHEDULER_POLL_INTERVAL_MS) || 500,
    ackTimeoutMs: Number(process.env.ACK_TIMEOUT_MS) || 15000,
    maxRetries: Number(process.env.MAX_RETRIES) || 3,
    sweepIntervalMs: Number(process.env.SWEEP_INTERVAL_MS) || 5000,
    blacklistThreshold: Number(process.env.BLACKLIST_THRESHOLD) || 5,
    blacklistDurationMs: Number(process.env.BLACKLIST_DURATION_MS) || 300000,
  },
};
