const SSHClient = require('./sshClient');

const MAX_SAFE_CONCURRENCY = 20;
const BATCH_DELAY_MS = 200;

class ClusterExecutor {
  constructor(servers, concurrency = 5) {
    this.servers = servers;
    this.concurrency = Math.min(concurrency, MAX_SAFE_CONCURRENCY);
    this.clients = [];
    
    if (concurrency > MAX_SAFE_CONCURRENCY) {
      console.warn(`警告: 并发数 ${concurrency} 过高，已自动限制为最大安全值 ${MAX_SAFE_CONCURRENCY}`);
    }
    
    if (servers.length > 50) {
      console.warn(`提示: 管理 ${servers.length} 台服务器，建议并发数不要超过 10 以避免系统资源耗尽`);
    }
  }

  async executeCommand(command, serverNames = null) {
    const targetServers = serverNames
      ? this.servers.filter(s => serverNames.includes(s.name))
      : this.servers;

    if (targetServers.length === 0) {
      throw new Error('未找到匹配的服务器');
    }

    const results = [];
    const chunks = this.chunkArray(targetServers, this.concurrency);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkResults = await Promise.all(
        chunk.map(server => this.executeOnServer(server, command))
      );
      results.push(...chunkResults);
      
      if (i < chunks.length - 1) {
        await this.delay(BATCH_DELAY_MS);
        if (global.gc) {
          try { global.gc(); } catch (e) {}
        }
      }
    }

    return results;
  }

  async executeOnServer(server, command) {
    const client = new SSHClient(server);
    
    try {
      const result = await client.executeCommand(command);
      return result;
    } finally {
      client.disconnect();
    }
  }

  async executeCommands(commands, serverNames = null) {
    const targetServers = serverNames
      ? this.servers.filter(s => serverNames.includes(s.name))
      : this.servers;

    if (targetServers.length === 0) {
      throw new Error('未找到匹配的服务器');
    }

    const results = [];
    const chunks = this.chunkArray(targetServers, this.concurrency);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkResults = await Promise.all(
        chunk.map(server => this.executeCommandsOnServer(server, commands))
      );
      results.push(...chunkResults);
      
      if (i < chunks.length - 1) {
        await this.delay(BATCH_DELAY_MS);
        if (global.gc) {
          try { global.gc(); } catch (e) {}
        }
      }
    }

    return results;
  }

  async executeCommandsOnServer(server, commands) {
    const client = new SSHClient(server);
    
    try {
      const results = await client.executeCommands(commands);
      return {
        server: server.name,
        host: server.host,
        results,
        success: results.every(r => r.success),
      };
    } finally {
      client.disconnect();
    }
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  async testConnections() {
    const results = [];
    const chunks = this.chunkArray(this.servers, this.concurrency);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkResults = await Promise.all(
        chunk.map(server => this.testServerConnection(server))
      );
      results.push(...chunkResults);
      
      if (i < chunks.length - 1) {
        await this.delay(BATCH_DELAY_MS);
        if (global.gc) {
          try { global.gc(); } catch (e) {}
        }
      }
    }

    return results;
  }

  async testServerConnection(server) {
    const client = new SSHClient(server);
    
    try {
      const result = await client.connect();
      return {
        server: server.name,
        host: server.host,
        success: result.success,
        error: result.error,
      };
    } finally {
      client.disconnect();
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup() {
    this.clients.forEach(client => {
      try {
        client.disconnect();
      } catch (e) {}
    });
    this.clients = [];
  }
}

process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

process.on('exit', () => {
  if (globalClusterExecutor) {
    globalClusterExecutor.cleanup();
  }
});

let globalClusterExecutor = null;

function setGlobalExecutor(executor) {
  globalClusterExecutor = executor;
}

module.exports = ClusterExecutor;
module.exports.setGlobalExecutor = setGlobalExecutor;
