const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../shared/db");
const { redis, QUEUE_KEY } = require("../shared/redis-client");
const {
  isBlacklisted,
  getBlacklistedDevices,
  getBlacklistTTL,
  removeFromBlacklist,
} = require("../shared/device-blacklist");
const config = require("../shared/config");

const app = express();
app.use(express.json());

app.post("/api/commands", async (req, res) => {
  const { device_id, command_type, payload, priority, scheduled_at } = req.body;

  if (!device_id || !command_type) {
    return res.status(400).json({ error: "device_id and command_type are required" });
  }

  const id = uuidv4();
  const cmdPriority = priority ?? 5;

  try {
    const blacklisted = await isBlacklisted(device_id);
    if (blacklisted) {
      const ttl = await getBlacklistTTL(device_id);
      return res.status(403).json({
        error: "Device is currently blacklisted",
        device_id,
        remaining_ms: ttl > 0 ? ttl : 0,
      });
    }

    await db.query(
      `INSERT INTO commands (id, device_id, command_type, payload, priority, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)`,
      [id, device_id, command_type, JSON.stringify(payload || {}), cmdPriority, scheduled_at || null]
    );

    const score = Date.now() + cmdPriority * -1000;
    const member = JSON.stringify({
      id,
      device_id,
      command_type,
      payload: payload || {},
      priority: cmdPriority,
    });

    await redis.zadd(QUEUE_KEY, score, member);

    res.status(201).json({
      id,
      device_id,
      command_type,
      payload: payload || {},
      priority: cmdPriority,
      status: "pending",
    });
  } catch (err) {
    console.error("[API] Error creating command:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/commands/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM commands WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Command not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[API] Error fetching command:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/commands", async (req, res) => {
  const { status, device_id, limit = 50, offset = 0 } = req.query;
  try {
    let sql = "SELECT * FROM commands WHERE 1=1";
    const params = [];
    let idx = 1;

    if (status) {
      sql += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (device_id) {
      sql += ` AND device_id = $${idx++}`;
      params.push(device_id);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(Number(limit), Number(offset));

    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("[API] Error listing commands:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

app.get("/api/blacklist", async (_req, res) => {
  try {
    const devices = await getBlacklistedDevices();
    res.json(devices);
  } catch (err) {
    console.error("[API] Error fetching blacklist:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/blacklist/:device_id", async (req, res) => {
  try {
    const blacklisted = await isBlacklisted(req.params.device_id);
    if (!blacklisted) {
      return res.json({ device_id: req.params.device_id, blacklisted: false });
    }
    const ttl = await getBlacklistTTL(req.params.device_id);
    res.json({
      device_id: req.params.device_id,
      blacklisted: true,
      remaining_ms: ttl > 0 ? ttl : 0,
    });
  } catch (err) {
    console.error("[API] Error checking blacklist:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/blacklist/:device_id", async (req, res) => {
  try {
    await removeFromBlacklist(req.params.device_id);
    res.json({ device_id: req.params.device_id, action: "removed_from_blacklist" });
  } catch (err) {
    console.error("[API] Error removing from blacklist:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(config.api.port, () => {
  console.log(`[API Gateway] Listening on port ${config.api.port}`);
});
