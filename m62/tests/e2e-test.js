const http = require("http");

const API_HOST = "localhost";
const API_PORT = 3000;

function postCommand(data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = http.request(
      {
        hostname: API_HOST,
        port: API_PORT,
        path: "/api/commands",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getCommand(id) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: API_HOST,
        port: API_PORT,
        path: `/api/commands/${id}`,
        method: "GET",
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("=== E2E Test Start ===\n");

  console.log("[Test 1] Submit high-priority command...");
  const cmd1 = await postCommand({
    device_id: "sensor-001",
    command_type: "REBOOT",
    payload: { delay_sec: 5 },
    priority: 1,
  });
  console.log("  Response:", cmd1.status, cmd1.body);
  const id1 = cmd1.body.id;

  console.log("\n[Test 2] Submit normal-priority command...");
  const cmd2 = await postCommand({
    device_id: "sensor-002",
    command_type: "SET_CONFIG",
    payload: { interval_ms: 1000 },
    priority: 5,
  });
  console.log("  Response:", cmd2.status, cmd2.body);
  const id2 = cmd2.body.id;

  console.log("\n[Test 3] Submit low-priority command...");
  const cmd3 = await postCommand({
    device_id: "sensor-003",
    command_type: "REPORT_STATUS",
    payload: {},
    priority: 10,
  });
  console.log("  Response:", cmd3.status, cmd3.body);
  const id3 = cmd3.body.id;

  console.log("\n[Wait] Waiting for scheduler to process commands...");
  await sleep(5000);

  console.log("\n[Test 4] Check command statuses...");
  for (const [label, id] of [["High", id1], ["Normal", id2], ["Low", id3]]) {
    const result = await getCommand(id);
    console.log(`  ${label}-priority (${id}): status=${result.body.status}`);
  }

  console.log("\n=== E2E Test Complete ===");
  process.exit(0);
}

run().catch((err) => {
  console.error("E2E test failed:", err);
  process.exit(1);
});
