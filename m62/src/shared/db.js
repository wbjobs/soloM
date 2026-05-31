const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool(config.pg);

pool.on("error", (err) => {
  console.error("[PG] Unexpected error on idle client", err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
