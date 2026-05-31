const db = require("./db");

async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS commands (
      id            VARCHAR(36) PRIMARY KEY,
      device_id     VARCHAR(64) NOT NULL,
      command_type  VARCHAR(64) NOT NULL,
      payload       JSONB DEFAULT '{}',
      priority      INT NOT NULL DEFAULT 5,
      status        VARCHAR(16) NOT NULL DEFAULT 'pending',
      retry_count   INT NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scheduled_at  TIMESTAMPTZ,
      delivered_at  TIMESTAMPTZ,
      acked_at      TIMESTAMPTZ,
      error_message TEXT
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_commands_status ON commands(status);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_commands_device_id ON commands(device_id);
  `);

  console.log("[DB] Tables initialized");
}

module.exports = { initDatabase };
