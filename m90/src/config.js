const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class ConfigLoader {
  constructor(configPath = null) {
    this.configPath = configPath || this.getDefaultConfigPath();
  }

  getDefaultConfigPath() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    return path.join(homeDir, '.cluster-audit', 'servers.yaml');
  }

  load() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`配置文件不存在: ${this.configPath}`);
    }

    try {
      const fileContent = fs.readFileSync(this.configPath, 'utf8');
      const config = yaml.load(fileContent);
      
      this.validateConfig(config);
      return config;
    } catch (error) {
      if (error.name === 'YAMLException') {
        throw new Error(`YAML 解析错误: ${error.message}`);
      }
      throw error;
    }
  }

  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('配置文件格式错误');
    }

    if (!config.servers || !Array.isArray(config.servers)) {
      throw new Error('配置文件必须包含 servers 数组');
    }

    config.servers.forEach((server, index) => {
      this.validateServer(server, index);
    });
  }

  validateServer(server, index) {
    const requiredFields = ['name', 'host', 'username'];
    
    for (const field of requiredFields) {
      if (!server[field]) {
        throw new Error(`服务器 #${index + 1} 缺少必填字段: ${field}`);
      }
    }

    if (!server.password && !server.privateKey) {
      throw new Error(`服务器 "${server.name}" 必须提供 password 或 privateKey`);
    }
  }

  getServers() {
    const config = this.load();
    return config.servers;
  }
}

module.exports = ConfigLoader;
