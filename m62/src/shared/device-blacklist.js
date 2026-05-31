const { redis, BLACKLIST_KEY_PREFIX, FAILURE_COUNT_PREFIX } = require("./redis-client");
const config = require("./config");

function blacklistKey(deviceId) {
  return `${BLACKLIST_KEY_PREFIX}${deviceId}`;
}

function failureKey(deviceId) {
  return `${FAILURE_COUNT_PREFIX}${deviceId}`;
}

async function isBlacklisted(deviceId) {
  const exists = await redis.exists(blacklistKey(deviceId));
  return exists === 1;
}

async function getBlacklistTTL(deviceId) {
  const ttl = await redis.pttl(blacklistKey(deviceId));
  return ttl;
}

async function recordFailure(deviceId) {
  const key = failureKey(deviceId);
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, config.scheduler.blacklistDurationMs / 1000 + 60);
  }

  if (count >= config.scheduler.blacklistThreshold) {
    const bk = blacklistKey(deviceId);
    await redis.set(bk, String(Date.now()), "PX", config.scheduler.blacklistDurationMs);
    await redis.del(key);
    console.log(
      `[Blacklist] Device ${deviceId} blacklisted for ${config.scheduler.blacklistDurationMs / 1000}s (consecutive failures: ${count})`
    );
    return { blacklisted: true, count };
  }

  console.log(`[Blacklist] Device ${deviceId} failure count: ${count}/${config.scheduler.blacklistThreshold}`);
  return { blacklisted: false, count };
}

async function recordSuccess(deviceId) {
  const key = failureKey(deviceId);
  const count = await redis.get(key);
  if (count) {
    await redis.del(key);
  }
}

async function removeFromBlacklist(deviceId) {
  await redis.del(blacklistKey(deviceId));
  await redis.del(failureKey(deviceId));
  console.log(`[Blacklist] Device ${deviceId} removed from blacklist`);
}

async function getBlacklistedDevices() {
  const keys = await redis.keys(`${BLACKLIST_KEY_PREFIX}*`);
  const devices = [];
  for (const key of keys) {
    const deviceId = key.replace(BLACKLIST_KEY_PREFIX, "");
    const ttl = await redis.pttl(key);
    const timestamp = await redis.get(key);
    devices.push({ deviceId, blacklistedAt: Number(timestamp), ttlMs: ttl });
  }
  return devices;
}

module.exports = {
  isBlacklisted,
  recordFailure,
  recordSuccess,
  removeFromBlacklist,
  getBlacklistedDevices,
  getBlacklistTTL,
};
