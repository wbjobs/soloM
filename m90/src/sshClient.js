const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const path = require('path');

class SSHClient {
  constructor(serverConfig) {
    this.server = serverConfig;
    this.ssh = new NodeSSH();
    this.connected = false;
  }

  async connect() {
    const sshConfig = {
      host: this.server.host,
      port: this.server.port || 22,
      username: this.server.username,
      readyTimeout: this.server.timeout || 10000,
    };

    if (this.server.password) {
      sshConfig.password = this.server.password;
    }

    if (this.server.privateKey) {
      if (fs.existsSync(this.server.privateKey)) {
        sshConfig.privateKey = fs.readFileSync(this.server.privateKey, 'utf8');
      } else {
        sshConfig.privateKey = this.server.privateKey;
      }
    }

    if (this.server.passphrase) {
      sshConfig.passphrase = this.server.passphrase;
    }

    try {
      await this.ssh.connect(sshConfig);
      this.connected = true;
      return { success: true, server: this.server.name };
    } catch (error) {
      return {
        success: false,
        server: this.server.name,
        error: error.message,
      };
    }
  }

  async executeCommand(command) {
    const startTime = Date.now();
    
    try {
      if (!this.connected) {
        const connectResult = await this.connect();
        if (!connectResult.success) {
          return {
            server: this.server.name,
            host: this.server.host,
            success: false,
            command,
            error: connectResult.error,
            stdout: '',
            stderr: '',
            executionTime: Date.now() - startTime,
          };
        }
      }

      if (!this.ssh) {
        return {
          server: this.server.name,
          host: this.server.host,
          success: false,
          command,
          error: 'SSH 连接已断开',
          stdout: '',
          stderr: '',
          executionTime: Date.now() - startTime,
        };
      }

      const result = await this.ssh.execCommand(command, {
        cwd: this.server.cwd || '/tmp',
      });
      
      const executionTime = Date.now() - startTime;

      return {
        server: this.server.name,
        host: this.server.host,
        success: result.code === 0,
        command,
        exitCode: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      return {
        server: this.server.name,
        host: this.server.host,
        success: false,
        command,
        error: error.message,
        stdout: '',
        stderr: '',
        executionTime,
      };
    }
  }

  async executeCommands(commands) {
    const results = [];
    
    for (const command of commands) {
      const result = await this.executeCommand(command);
      results.push(result);
      
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  disconnect() {
    try {
      if (this.ssh) {
        if (typeof this.ssh.dispose === 'function') {
          this.ssh.dispose();
        }
        
        if (this.ssh.connection && typeof this.ssh.connection.end === 'function') {
          try {
            this.ssh.connection.end();
          } catch (e) {}
        }
        
        if (this.ssh.connection && typeof this.ssh.connection.destroy === 'function') {
          try {
            this.ssh.connection.destroy();
          } catch (e) {}
        }
      }
    } catch (error) {}
    
    this.connected = false;
    this.ssh = null;
  }
}

module.exports = SSHClient;
