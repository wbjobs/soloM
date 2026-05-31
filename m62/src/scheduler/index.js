const {
  redis,
  QUEUE_KEY,
  PROCESSING_KEY,
  DEAD_LETTER_KEY,
  MOVE_TO_PROCESSING_SCRIPT,
  ACK_AND_REMOVE_SCRIPT,
  REQUEUE_OR_DLQ_SCRIPT,
} = require("../shared/redis-client");
const db = require("../shared/db");
const { sendToDevice } = require("../shared/tcp-client");
const { isBlacklisted, recordFailure, recordSuccess } = require("../shared/device-blacklist");
const config = require("../shared/config");

let moveToProcessingSha = null;
let ackAndRemoveSha = null;
let requeueOrDlqSha = null;

async function loadScripts() {
  moveToProcessingSha = await redis.script("load", MOVE_TO_PROCESSING_SCRIPT);
  ackAndRemoveSha = await redis.script("load", ACK_AND_REMOVE_SCRIPT);
  requeueOrDlqSha = await redis.script("load", REQUEUE_OR_DLQ_SCRIPT);
  console.log("[Scheduler] Lua scripts loaded");
}

async function recoverStaleCommands() {
  console.log("[Scheduler] Recovering stale commands from processing set...");
  const now = Date.now();
  const result = await redis.evalsha(
    requeueOrDlqSha,
    3,
    PROCESSING_KEY,
    QUEUE_KEY,
    DEAD_LETTER_KEY,
    now,
    config.scheduler.maxRetries,
    now
  );

  if (result && typeof result === "object") {
    const [requeued, dead] = result;
    if (requeued > 0 || dead > 0) {
      console.log(`[Scheduler] Recovery complete: ${requeued} requeued, ${dead} moved to DLQ`);
    }
  } else {
    const recovered = await redis.zcard(PROCESSING_KEY);
    if (recovered > 0) {
      console.log(`[Scheduler] ${recovered} commands still in processing set after recovery attempt`);
    }
  }
}

async function moveToProcessing() {
  const now = Date.now();
  const result = await redis.evalsha(moveToProcessingSha, 2, QUEUE_KEY, PROCESSING_KEY, now);
  return result;
}

async function confirmAck(commandJson) {
  await redis.evalsha(ackAndRemoveSha, 1, PROCESSING_KEY, commandJson);
}

async function rejectFromProcessing(commandJson) {
  await redis.zrem(PROCESSING_KEY, commandJson);
}

async function sweepStaleCommands() {
  try {
    const cutoff = Date.now() - config.scheduler.ackTimeoutMs;
    const result = await redis.evalsha(
      requeueOrDlqSha,
      3,
      PROCESSING_KEY,
      QUEUE_KEY,
      DEAD_LETTER_KEY,
      cutoff,
      config.scheduler.maxRetries,
      Date.now()
    );

    if (result && typeof result === "object") {
      const [requeued, dead] = result;
      if (requeued > 0 || dead > 0) {
        console.log(`[Scheduler] Sweep: ${requeued} requeued, ${dead} moved to DLQ`);

        if (dead > 0) {
          await markDeadLettersInDb(cutoff);
        }
      }
    }
  } catch (err) {
    if (err.message && err.message.includes("NOSCRIPT")) {
      await loadScripts();
    } else {
      console.error("[Scheduler] Sweep error:", err);
    }
  }
}

async function markDeadLettersInDb(cutoff) {
  const dlqEntries = await redis.zrangebyscore(DEAD_LETTER_KEY, "-inf", cutoff);
  for (const entry of dlqEntries) {
    try {
      const command = JSON.parse(entry);
      await db.query(
        "UPDATE commands SET status = 'dead_letter', error_message = 'Exceeded max retries', updated_at = NOW() WHERE id = $1 AND status != 'acked'",
        [command.id]
      );
    } catch {}
  }
}

async function pollAndDispatch() {
  while (true) {
    try {
      let result;
      try {
        result = await moveToProcessing();
      } catch (err) {
        if (err.message && err.message.includes("NOSCRIPT")) {
          await loadScripts();
          result = await moveToProcessing();
        } else {
          throw err;
        }
      }

      if (!result) {
        await sleep(config.scheduler.pollIntervalMs);
        continue;
      }

      let command;
      let commandJson;
      try {
        command = JSON.parse(result);
        commandJson = result;
      } catch {
        console.error("[Scheduler] Invalid command JSON in queue:", result);
        await redis.zrem(PROCESSING_KEY, result);
        continue;
      }

      const blacklisted = await isBlacklisted(command.device_id);
      if (blacklisted) {
        console.log(
          `[Scheduler] Device ${command.device_id} is blacklisted, rejecting command ${command.id}`
        );

        await rejectFromProcessing(commandJson);

        await db.query(
          "UPDATE commands SET status = 'device_error', error_message = 'Device is blacklisted', updated_at = NOW() WHERE id = $1",
          [command.id]
        );
        continue;
      }

      console.log(
        `[Scheduler] Dispatching command ${command.id} (retry: ${command.retry_count || 0}) to device ${command.device_id}`
      );

      await db.query(
        "UPDATE commands SET status = 'delivering', delivered_at = NOW(), retry_count = $1, updated_at = NOW() WHERE id = $2",
        [command.retry_count || 0, command.id]
      );

      try {
        const ack = await sendToDevice({
          id: command.id,
          device_id: command.device_id,
          command_type: command.command_type,
          payload: command.payload,
        });

        if (ack.status === "error") {
          throw new Error(ack.result?.message || "Device returned error ACK");
        }

        console.log(`[Scheduler] ACK received for ${command.id}:`, ack);

        await confirmAck(commandJson);
        await recordSuccess(command.device_id);

        await db.query(
          "UPDATE commands SET status = 'acked', acked_at = NOW(), updated_at = NOW() WHERE id = $1",
          [command.id]
        );
      } catch (err) {
        console.error(`[Scheduler] Failed to deliver command ${command.id}:`, err.message);

        const { blacklisted: nowBlacklisted, count } = await recordFailure(command.device_id);

        if (nowBlacklisted) {
          await rejectFromProcessing(commandJson);

          await db.query(
            "UPDATE commands SET status = 'device_error', error_message = $1, updated_at = NOW() WHERE id = $2",
            [`Device blacklisted after ${count} consecutive failures`, command.id]
          );

          await rejectBlacklistedDeviceCommands(command.device_id);
        } else {
          const retryCount = (command.retry_count || 0) + 1;
          if (retryCount < config.scheduler.maxRetries) {
            console.log(`[Scheduler] Will retry ${command.id} on next sweep (attempt ${retryCount}/${config.scheduler.maxRetries})`);
            await db.query(
              "UPDATE commands SET status = 'retrying', retry_count = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
              [retryCount, err.message, command.id]
            );
          } else {
            console.log(`[Scheduler] Command ${command.id} exceeded max retries, will be moved to DLQ`);
            await db.query(
              "UPDATE commands SET status = 'dead_letter', retry_count = $1, error_message = $2, updated_at = NOW() WHERE id = $3",
              [retryCount, `Exceeded max retries: ${err.message}`, command.id]
            );
          }
        }
      }
    } catch (err) {
      console.error("[Scheduler] Poll error:", err);
      await sleep(config.scheduler.pollIntervalMs);
    }
  }
}

async function rejectBlacklistedDeviceCommands(deviceId) {
  let cursor = "0";
  do {
    const [nextCursor, members] = await redis.zscan(QUEUE_KEY, cursor, "COUNT", 100);
    cursor = nextCursor;

    for (const member of members) {
      try {
        const cmd = JSON.parse(member);
        if (cmd.device_id === deviceId) {
          await redis.zrem(QUEUE_KEY, member);
          await db.query(
            "UPDATE commands SET status = 'device_error', error_message = 'Device is blacklisted', updated_at = NOW() WHERE id = $1",
            [cmd.id]
          );
          console.log(`[Scheduler] Rejected queued command ${cmd.id} for blacklisted device ${deviceId}`);
        }
      } catch {}
    }
  } while (cursor !== "0");
}

function startSweeper() {
  setInterval(async () => {
    await sweepStaleCommands();
  }, config.scheduler.sweepIntervalMs);
  console.log(`[Scheduler] Stale-command sweeper started (interval: ${config.scheduler.sweepIntervalMs}ms, timeout: ${config.scheduler.ackTimeoutMs}ms)`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await loadScripts();
  await recoverStaleCommands();
  startSweeper();
  console.log("[Scheduler] Starting command dispatch loop...");
  pollAndDispatch();
}

main().catch((err) => {
  console.error("[Scheduler] Fatal error:", err);
  process.exit(1);
});
