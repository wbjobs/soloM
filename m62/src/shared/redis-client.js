const Redis = require("ioredis");
const config = require("./config");

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
});

redis.on("error", (err) => {
  console.error("[Redis] Connection error", err);
});

redis.on("connect", () => {
  console.log("[Redis] Connected");
});

const QUEUE_KEY = "iot:command_queue";
const PROCESSING_KEY = "iot:command_processing";
const DEAD_LETTER_KEY = "iot:command_dead_letter";
const BLACKLIST_KEY_PREFIX = "iot:device_blacklist:";
const FAILURE_COUNT_PREFIX = "iot:device_failures:";

const MOVE_TO_PROCESSING_SCRIPT = `
local member = redis.call('ZPOPMIN', KEYS[1])
if #member > 0 then
    redis.call('ZADD', KEYS[2], ARGV[1], member[1])
    return member[1]
end
return nil
`;

const ACK_AND_REMOVE_SCRIPT = `
local removed = redis.call('ZREM', KEYS[1], ARGV[1])
return removed
`;

const REQUEUE_OR_DLQ_SCRIPT = `
local stale = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
local requeued = 0
local dead = 0
for i, member in ipairs(stale) do
    redis.call('ZREM', KEYS[1], member)
    local data = cjson.decode(member)
    data.retry_count = (data.retry_count or 0) + 1
    if data.retry_count < tonumber(ARGV[2]) then
        local score = tonumber(ARGV[3]) + data.priority * -1000
        redis.call('ZADD', KEYS[2], score, cjson.encode(data))
        requeued = requeued + 1
    else
        redis.call('ZADD', KEYS[3], ARGV[1], member)
        dead = dead + 1
    end
end
return { requeued, dead }
`;

module.exports = {
  redis,
  QUEUE_KEY,
  PROCESSING_KEY,
  DEAD_LETTER_KEY,
  BLACKLIST_KEY_PREFIX,
  FAILURE_COUNT_PREFIX,
  MOVE_TO_PROCESSING_SCRIPT,
  ACK_AND_REMOVE_SCRIPT,
  REQUEUE_OR_DLQ_SCRIPT,
};
