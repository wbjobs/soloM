const SSHClient = require('./sshClient');

const CPU_COMMAND = "grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {printf \"%.1f\", usage}'";
const MEM_COMMAND = "free -m | awk '/Mem:/{printf \"%.1f %.1f %.1f\", $2, $3, $3/$2*100}'";
const LOAD_COMMAND = "cat /proc/loadavg | awk '{printf \"%.2f %.2f %.2f\", $1, $2, $3}'";
const UPTIME_COMMAND = "uptime -p 2>/dev/null || uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}'";

class StatsCollector {
  constructor(servers, concurrency = 5) {
    this.servers = servers;
    this.concurrency = Math.min(concurrency, 10);
    this.clients = new Map();
  }

  async ensureConnection(server) {
    if (this.clients.has(server.name)) {
      const client = this.clients.get(server.name);
      if (client.connected && client.ssh) {
        return client;
      }
      try { client.disconnect(); } catch (e) {}
      this.clients.delete(server.name);
    }

    const client = new SSHClient(server);
    const result = await client.connect();
    if (result.success) {
      this.clients.set(server.name, client);
      return client;
    }
    return null;
  }

  async collectFromServer(server) {
    const client = await this.ensureConnection(server);
    
    if (!client) {
      return {
        server: server.name,
        host: server.host,
        connected: false,
        cpu: 0,
        memTotal: 0,
        memUsed: 0,
        memPercent: 0,
        loadAvg: [0, 0, 0],
        uptime: 'N/A',
        error: '连接失败',
        timestamp: Date.now(),
      };
    }

    try {
      const [cpuRes, memRes, loadRes, uptimeRes] = await Promise.all([
        client.executeCommand(CPU_COMMAND),
        client.executeCommand(MEM_COMMAND),
        client.executeCommand(LOAD_COMMAND),
        client.executeCommand(UPTIME_COMMAND),
      ]);

      const cpu = cpuRes.success ? parseFloat(cpuRes.stdout.trim()) || 0 : 0;
      
      let memTotal = 0, memUsed = 0, memPercent = 0;
      if (memRes.success) {
        const parts = memRes.stdout.trim().split(/\s+/);
        if (parts.length >= 3) {
          memTotal = parseFloat(parts[0]) || 0;
          memUsed = parseFloat(parts[1]) || 0;
          memPercent = parseFloat(parts[2]) || 0;
        }
      }

      let loadAvg = [0, 0, 0];
      if (loadRes.success) {
        const loads = loadRes.stdout.trim().split(/\s+/);
        loadAvg = [
          parseFloat(loads[0]) || 0,
          parseFloat(loads[1]) || 0,
          parseFloat(loads[2]) || 0,
        ];
      }

      const uptime = uptimeRes.success ? uptimeRes.stdout.trim() : 'N/A';

      return {
        server: server.name,
        host: server.host,
        connected: true,
        cpu,
        memTotal,
        memUsed,
        memPercent,
        loadAvg,
        uptime,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        server: server.name,
        host: server.host,
        connected: true,
        cpu: 0,
        memTotal: 0,
        memUsed: 0,
        memPercent: 0,
        loadAvg: [0, 0, 0],
        uptime: 'N/A',
        error: error.message,
        timestamp: Date.now(),
      };
    }
  }

  async collectAll() {
    const results = [];
    const chunks = this.chunkArray(this.servers, this.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(server => this.collectFromServer(server))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  async executeWithProgress(command, onProgress) {
    const total = this.servers.length;
    let completed = 0;
    const results = [];
    const chunks = this.chunkArray(this.servers, this.concurrency);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (server) => {
          const client = new SSHClient(server);
          try {
            const result = await client.executeCommand(command);
            completed++;
            if (onProgress) {
              onProgress(completed, total, server.name, result.success);
            }
            return result;
          } finally {
            client.disconnect();
          }
        })
      );
      results.push(...chunkResults);
    }

    return results;
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  disconnectAll() {
    for (const [, client] of this.clients) {
      try {
        client.disconnect();
      } catch (e) {}
    }
    this.clients.clear();
  }
}

module.exports = StatsCollector;
