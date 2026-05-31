const http = require("http");
const fs = require("fs");
const path = require("path");

const POINT_COUNT = 1_000_000;
const FLOATS_PER_POINT = 6;
const BYTES_PER_POINT = FLOATS_PER_POINT * 4;
const TOTAL_BYTES = POINT_COUNT * BYTES_PER_POINT;

function generatePointCloud() {
  const buffer = Buffer.alloc(TOTAL_BYTES);
  for (let i = 0; i < POINT_COUNT; i++) {
    const offset = i * BYTES_PER_POINT;

    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 0.3 + Math.random() * 0.7;
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);

    const nx = (x + 1) / 2;
    const ny = (y + 1) / 2;
    const nz = (z + 1) / 2;

    buffer.writeFloatLE(x, offset + 0);
    buffer.writeFloatLE(y, offset + 4);
    buffer.writeFloatLE(z, offset + 8);
    buffer.writeFloatLE(nx, offset + 12);
    buffer.writeFloatLE(ny, offset + 16);
    buffer.writeFloatLE(nz, offset + 20);
  }
  return buffer;
}

class OctreeNode {
  constructor(minX, minY, minZ, maxX, maxY, maxZ, depth) {
    this.minX = minX; this.minY = minY; this.minZ = minZ;
    this.maxX = maxX; this.maxY = maxY; this.maxZ = maxZ;
    this.depth = depth;
    this.indices = [];
    this.children = null;
  }

  subdivide() {
    const midX = (this.minX + this.maxX) / 2;
    const midY = (this.minY + this.maxY) / 2;
    const midZ = (this.minZ + this.maxZ) / 2;
    const d = this.depth + 1;

    this.children = [
      new OctreeNode(this.minX, this.minY, this.minZ, midX, midY, midZ, d),
      new OctreeNode(midX, this.minY, this.minZ, this.maxX, midY, midZ, d),
      new OctreeNode(this.minX, midY, this.minZ, midX, this.maxY, midZ, d),
      new OctreeNode(midX, midY, this.minZ, midX, midY, midZ, d),
      new OctreeNode(this.minX, this.minY, midZ, midX, midY, this.maxZ, d),
      new OctreeNode(midX, this.minY, midZ, this.maxX, midY, this.maxZ, d),
      new OctreeNode(this.minX, midY, midZ, midX, this.maxY, this.maxZ, d),
      new OctreeNode(midX, midY, midZ, this.maxX, this.maxY, this.maxZ, d),
    ];
  }

  containsPoint(x, y, z) {
    return x >= this.minX && x <= this.maxX &&
           y >= this.minY && y <= this.maxY &&
           z >= this.minZ && z <= this.maxZ;
  }

  intersectsAABB(qMinX, qMinY, qMinZ, qMaxX, qMaxY, qMaxZ) {
    return this.minX <= qMaxX && this.maxX >= qMinX &&
           this.minY <= qMaxY && this.maxY >= qMinY &&
           this.minZ <= qMaxZ && this.maxZ >= qMinZ;
  }

  insert(index, x, y, z, tree) {
    if (!this.containsPoint(x, y, z)) return false;

    if (this.children === null) {
      this.indices.push(index);
      if (this.indices.length > tree.maxPointsPerNode && this.depth < tree.maxDepth) {
        this.subdivide();
        const oldIndices = this.indices;
        this.indices = [];
        for (const idx of oldIndices) {
          const off = idx * 3;
          const px = tree.positions[off];
          const py = tree.positions[off + 1];
          const pz = tree.positions[off + 2];
          let inserted = false;
          for (const child of this.children) {
            if (child.insert(idx, px, py, pz, tree)) {
              inserted = true;
              break;
            }
          }
          if (!inserted) {
            this.indices.push(idx);
          }
        }
      }
      return true;
    }

    for (const child of this.children) {
      if (child.insert(index, x, y, z, tree)) {
        return true;
      }
    }

    this.indices.push(index);
    return true;
  }

  queryAABB(qMinX, qMinY, qMinZ, qMaxX, qMaxY, qMaxZ, result) {
    if (!this.intersectsAABB(qMinX, qMinY, qMinZ, qMaxX, qMaxY, qMaxZ)) return;

    for (const idx of this.indices) {
      result.push(idx);
    }

    if (this.children) {
      for (const child of this.children) {
        child.queryAABB(qMinX, qMinY, qMinZ, qMaxX, qMaxY, qMaxZ, result);
      }
    }
  }
}

class Octree {
  constructor(positions, minX, minY, minZ, maxX, maxY, maxZ, maxDepth, maxPointsPerNode) {
    this.positions = positions;
    this.maxDepth = maxDepth;
    this.maxPointsPerNode = maxPointsPerNode;
    this.root = new OctreeNode(minX, minY, minZ, maxX, maxY, maxZ, 0);
  }

  insert(index) {
    const off = index * 3;
    this.root.insert(index, this.positions[off], this.positions[off + 1], this.positions[off + 2], this);
  }

  queryAABB(minX, minY, minZ, maxX, maxY, maxZ) {
    const result = [];
    this.root.queryAABB(minX, minY, minZ, maxX, maxY, maxZ, result);
    return result;
  }
}

let cachedPointCloud = null;
let pointPositions = null;
let pointAttributes = null;
let octree = null;

function getPointCloud() {
  if (!cachedPointCloud) {
    console.log(`Generating ${POINT_COUNT.toLocaleString()} points (${(TOTAL_BYTES / 1024 / 1024).toFixed(1)} MB)...`);
    const start = performance.now();
    cachedPointCloud = generatePointCloud();
    const elapsed = (performance.now() - start).toFixed(0);
    console.log(`Generated in ${elapsed} ms`);
  }
  return cachedPointCloud;
}

function buildSpatialIndex() {
  if (octree) return;

  const buffer = getPointCloud();

  pointPositions = new Float32Array(POINT_COUNT * 3);
  pointAttributes = new Float32Array(POINT_COUNT * 4);

  let minPX = Infinity, minPY = Infinity, minPZ = Infinity;
  let maxPX = -Infinity, maxPY = -Infinity, maxPZ = -Infinity;

  for (let i = 0; i < POINT_COUNT; i++) {
    const srcOff = i * FLOATS_PER_POINT;
    const dstOff = i * 3;
    const x = buffer.readFloatLE(srcOff * 4 + 0);
    const y = buffer.readFloatLE(srcOff * 4 + 4);
    const z = buffer.readFloatLE(srcOff * 4 + 8);
    pointPositions[dstOff] = x;
    pointPositions[dstOff + 1] = y;
    pointPositions[dstOff + 2] = z;

    if (x < minPX) minPX = x; if (x > maxPX) maxPX = x;
    if (y < minPY) minPY = y; if (y > maxPY) maxPY = y;
    if (z < minPZ) minPZ = z; if (z > maxPZ) maxPZ = z;

    const attrOff = i * 4;
    const distFromCenter = Math.sqrt(x * x + y * y + z * z);
    pointAttributes[attrOff] = 20 + 15 * (1 - distFromCenter) + (Math.random() - 0.5) * 4;
    pointAttributes[attrOff + 1] = 40 + 30 * distFromCenter + (Math.random() - 0.5) * 10;
    pointAttributes[attrOff + 2] = 1013.25 + 20 * (1 - distFromCenter) + (Math.random() - 0.5) * 5;
    pointAttributes[attrOff + 3] = 0.5 + 2.5 * (1 - distFromCenter) + (Math.random() - 0.5) * 0.5;
  }

  const pad = 0.01;
  console.log(`Building Octree (depth=10, maxPoints=128)...`);
  const start = performance.now();

  octree = new Octree(
    pointPositions,
    minPX - pad, minPY - pad, minPZ - pad,
    maxPX + pad, maxPY + pad, maxPZ + pad,
    10, 128
  );

  for (let i = 0; i < POINT_COUNT; i++) {
    octree.insert(i);
  }

  const elapsed = (performance.now() - start).toFixed(0);
  console.log(`Octree built in ${elapsed} ms`);
}

function readPostBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".wgsl": "text/plain",
};

const server = http.createServer(async (req, res) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  if (req.url === "/api/pointcloud" && req.method === "GET") {
    const data = getPointCloud();
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": data.length,
      ...corsHeaders,
      "Cache-Control": "public, max-age=3600",
    });
    res.end(data);
    return;
  }

  if (req.url === "/api/query" && req.method === "POST") {
    try {
      buildSpatialIndex();
      const body = await readPostBody(req);
      const params = JSON.parse(body.toString());

      const { minX, minY, minZ, maxX, maxY, maxZ } = params;

      if (typeof minX !== "number" || typeof maxX !== "number") {
        res.writeHead(400, { "Content-Type": "application/json", ...corsHeaders });
        res.end(JSON.stringify({ error: "Invalid AABB parameters" }));
        return;
      }

      const t0 = performance.now();
      const resultIndices = octree.queryAABB(minX, minY, minZ, maxX, maxY, maxZ);
      const queryTime = (performance.now() - t0).toFixed(2);

      const filtered = resultIndices.filter(idx => {
        const off = idx * 3;
        const px = pointPositions[off];
        const py = pointPositions[off + 1];
        const pz = pointPositions[off + 2];
        return px >= minX && px <= maxX &&
               py >= minY && py <= maxY &&
               pz >= minZ && pz <= maxZ;
      });

      console.log(`Octree query: ${filtered.length} points found in ${queryTime} ms (broad phase: ${resultIndices.length})`);

      let csv = "index,x,y,z,temperature_c,humidity_pct,pressure_hpa,wind_speed_ms\n";
      for (const idx of filtered) {
        const posOff = idx * 3;
        const attrOff = idx * 4;
        csv += `${idx},` +
               `${pointPositions[posOff].toFixed(6)},` +
               `${pointPositions[posOff + 1].toFixed(6)},` +
               `${pointPositions[posOff + 2].toFixed(6)},` +
               `${pointAttributes[attrOff].toFixed(2)},` +
               `${pointAttributes[attrOff + 1].toFixed(2)},` +
               `${pointAttributes[attrOff + 2].toFixed(2)},` +
               `${pointAttributes[attrOff + 3].toFixed(2)}\n`;
      }

      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=pointcloud_query.csv",
        ...corsHeaders,
        "X-Query-Time-Ms": queryTime,
        "X-Result-Count": filtered.length.toString(),
      });
      res.end(csv);
    } catch (e) {
      console.error("Query error:", e);
      res.writeHead(500, { "Content-Type": "application/json", ...corsHeaders });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(__dirname, "public", filePath);

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType, ...corsHeaders });
    res.end(data);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Point cloud API: http://localhost:${PORT}/api/pointcloud`);
  console.log(`Spatial query API: POST http://localhost:${PORT}/api/query`);
  console.log(`  Body: { minX, minY, minZ, maxX, maxY, maxZ }`);
});
