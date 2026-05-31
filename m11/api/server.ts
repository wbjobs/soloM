import express from "express";
import cors from "cors";
import { createServer } from "http";
import { ClusterManager } from "./cluster.js";
import { WsHub } from "./ws-hub.js";

const PORT = 3001;

const app = express();
const server = createServer(app);

app.use(cors());
app.use(express.json());

const cluster = new ClusterManager(3);
const wsHub = new WsHub(server, cluster);

app.get("/api/cluster", (_req, res) => {
  res.json({ nodes: cluster.getNodeStates() });
});

app.get("/api/cluster/snapshots", (_req, res) => {
  res.json({ snapshots: cluster.getSnapshots() });
});

app.get("/api/cluster/snapshots/:index", (req, res) => {
  const index = parseInt(req.params.index, 10);
  const snapshot = cluster.getSnapshot(index);
  if (!snapshot) {
    res.status(404).json({ error: "Snapshot not found" });
    return;
  }
  res.json({ snapshot });
});

app.post("/api/nodes/:id/network", (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  const { online } = req.body;
  if (typeof online !== "boolean") {
    res.status(400).json({ success: false, error: "online must be boolean" });
    return;
  }
  const success = cluster.toggleNetwork(nodeId, online);
  res.json({ success });
});

app.post("/api/nodes/:id/stop", (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  const success = cluster.stopNode(nodeId);
  res.json({ success });
});

app.post("/api/nodes/:id/start", (req, res) => {
  const nodeId = parseInt(req.params.id, 10);
  const success = cluster.startNode(nodeId);
  res.json({ success });
});

app.post("/api/cluster/log", (req, res) => {
  const { data } = req.body;
  if (typeof data !== "string" || data.length === 0) {
    res.status(400).json({ success: false, error: "data must be a non-empty string" });
    return;
  }
  const result = cluster.submitLog(data);
  res.json(result);
});

app.post("/api/cluster/elect", (req, res) => {
  const { nodeId } = req.body;
  if (typeof nodeId !== "number") {
    res.status(400).json({ success: false, error: "nodeId must be a number" });
    return;
  }
  const success = cluster.triggerElection(nodeId);
  res.json({ success });
});

app.post("/api/cluster/reset", (_req, res) => {
  cluster.reset();
  res.json({ success: true });
});

cluster.startAll();

server.listen(PORT, () => {
  console.log(`Raft cluster server running on http://localhost:${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});

process.on("SIGINT", () => {
  wsHub.close();
  server.close();
  process.exit(0);
});
