#!/usr/bin/env node

const { Command } = require('commander');
const ConfigLoader = require('./config');
const ClusterExecutor = require('./clusterExecutor');
const OutputFormatter = require('./outputFormatter');
const AuditLogger = require('./auditLogger');

let globalExecutor = null;

function setGlobalExecutor(executor) {
  globalExecutor = executor;
  try {
    const clusterModule = require('./clusterExecutor');
    if (clusterModule && clusterModule.setGlobalExecutor) {
      clusterModule.setGlobalExecutor(executor);
    }
  } catch (e) {}
}

const program = new Command();

program
  .name('cluster-audit')
  .description('分布式服务器集群 CLI 运维审计工具')
  .version('1.0.0')
  .option('-c, --config <path>', '指定配置文件路径');

program
  .command('exec <command>')
  .description('在所有或指定服务器上执行命令')
  .option('-s, --servers <names>', '指定服务器名称，多个用逗号分隔')
  .option('-n, --concurrency <number>', '并发数，默认为 5')
  .option('-v, --verbose', '显示详细输出')
  .option('--no-log', '不记录操作日志')
  .action(async (command, options) => {
    try {
      const configLoader = new ConfigLoader(program.opts().config);
      const servers = configLoader.getServers();
      
      const targetServerNames = options.servers 
        ? options.servers.split(',').map(s => s.trim())
        : null;
      
      const concurrency = parseInt(options.concurrency) || 5;
      
      const executor = new ClusterExecutor(servers, concurrency);
      setGlobalExecutor(executor);
      
      OutputFormatter.printInfo(`正在执行命令: ${command}`);
      const results = await executor.executeCommand(command, targetServerNames);
      
      OutputFormatter.printCommandResults(results, options.verbose);
      
      if (options.log !== false) {
        const logger = new AuditLogger();
        const logId = await logger.logCommand(command, servers, results, concurrency);
        OutputFormatter.printInfo(`操作已记录到审计日志 (ID: ${logId})`);
        await logger.close();
      }
      
      process.exit(results.every(r => r.success) ? 0 : 1);
    } catch (error) {
      OutputFormatter.printError(error.message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('列出已配置的所有服务器')
  .action(() => {
    try {
      const configLoader = new ConfigLoader(program.opts().config);
      const servers = configLoader.getServers();
      OutputFormatter.printServerList(servers);
    } catch (error) {
      OutputFormatter.printError(error.message);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('测试所有服务器的 SSH 连接')
  .action(async () => {
    try {
      const configLoader = new ConfigLoader(program.opts().config);
      const servers = configLoader.getServers();
      
      OutputFormatter.printInfo('正在测试服务器连接...');
      
      const executor = new ClusterExecutor(servers);
      setGlobalExecutor(executor);
      const results = await executor.testConnections();
      
      OutputFormatter.printConnectionTest(results);
      
      process.exit(results.every(r => r.success) ? 0 : 1);
    } catch (error) {
      OutputFormatter.printError(error.message);
      process.exit(1);
    }
  });

program
  .command('dashboard')
  .description('启动交互式 TUI 仪表盘')
  .option('-i, --interval <seconds>', '刷新间隔秒数，默认为 5')
  .option('-n, --concurrency <number>', '并发数，默认为 5')
  .action(async (options) => {
    try {
      const TuiDashboard = require('./tuiDashboard');
      const configLoader = new ConfigLoader(program.opts().config);
      const servers = configLoader.getServers();
      
      const dashboard = new TuiDashboard(servers, {
        refreshInterval: (parseInt(options.interval) || 5) * 1000,
        concurrency: parseInt(options.concurrency) || 5,
      });
      
      dashboard.init();

      process.on('SIGINT', () => {
        dashboard.destroy();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        dashboard.destroy();
        process.exit(0);
      });
    } catch (error) {
      OutputFormatter.printError(error.message);
      process.exit(1);
    }
  });

program
  .command('logs')
  .description('查看审计日志')
  .option('-l, --limit <number>', '显示的日志数量，默认为 20')
  .option('-s, --search <keyword>', '搜索关键词')
  .option('-d, --detail <id>', '查看指定 ID 的日志详情')
  .action(async (options) => {
    try {
      const logger = new AuditLogger();
      
      if (options.detail) {
        const log = await logger.getLogById(options.detail);
        if (log) {
          OutputFormatter.printAuditLogDetail(log);
        } else {
          OutputFormatter.printError(`未找到 ID 为 ${options.detail} 的日志`);
          process.exit(1);
        }
      } else if (options.search) {
        const logs = await logger.searchLogs(options.search, parseInt(options.limit) || 20);
        OutputFormatter.printAuditLogs(logs);
      } else {
        const logs = await logger.getLogs(parseInt(options.limit) || 20);
        OutputFormatter.printAuditLogs(logs, parseInt(options.limit) || 20);
      }
      
      await logger.close();
    } catch (error) {
      OutputFormatter.printError(error.message);
      process.exit(1);
    }
  });

program
  .command('logs-clear')
  .description('清空审计日志')
  .option('-d, --days <number>', '只清空指定天数之前的日志')
  .option('-y, --yes', '确认操作，跳过提示')
  .action(async (options) => {
    try {
      if (!options.yes) {
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const message = options.days
          ? `确定要清空 ${options.days} 天之前的审计日志吗？(y/N): `
          : '确定要清空所有审计日志吗？此操作不可恢复！(y/N): ';
        
        readline.question(message, async (answer) => {
          readline.close();
          
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            await performClearLogs(options.days);
          } else {
            OutputFormatter.printInfo('操作已取消');
            process.exit(0);
          }
        });
      } else {
        await performClearLogs(options.days);
      }
    } catch (error) {
      OutputFormatter.printError(error.message);
      process.exit(1);
    }
  });

async function performClearLogs(days) {
  const logger = new AuditLogger();
  const count = await logger.clearLogs(days ? parseInt(days) : null);
  await logger.close();
  
  if (days) {
    OutputFormatter.printSuccess(`已清空 ${days} 天之前的 ${count} 条日志`);
  } else {
    OutputFormatter.printSuccess(`已清空所有审计日志 (共 ${count} 条)`);
  }
}

program
  .command('init')
  .description('初始化配置目录并创建示例配置文件')
  .action(() => {
    const fs = require('fs');
    const path = require('path');
    
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    const configDir = path.join(homeDir, '.cluster-audit');
    const configFile = path.join(configDir, 'servers.yaml');
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    if (fs.existsSync(configFile)) {
      OutputFormatter.printError(`配置文件已存在: ${configFile}`);
      process.exit(1);
    }
    
    const exampleConfig = `# 分布式服务器集群配置示例
# 将此文件复制到 ~/.cluster-audit/servers.yaml

servers:
  # 密码认证示例
  - name: web-server-01
    host: 192.168.1.101
    port: 22
    username: root
    password: your_password_here
    timeout: 10000

  # 私钥认证示例
  - name: db-server-01
    host: 192.168.1.102
    port: 22
    username: admin
    privateKey: ~/.ssh/id_rsa
    # passphrase: your_private_key_passphrase

  # 更多服务器...
  - name: app-server-01
    host: 192.168.1.103
    port: 22
    username: deploy
    privateKey: ~/.ssh/deploy_key
`;
    
    fs.writeFileSync(configFile, exampleConfig, 'utf8');
    fs.chmodSync(configFile, 0o600);
    
    OutputFormatter.printSuccess(`配置文件已创建: ${configFile}`);
    OutputFormatter.printInfo('请编辑该文件添加您的服务器配置');
    OutputFormatter.printInfo('注意: 配置文件权限已设置为 0600 以保护敏感信息');
  });

program.parseAsync(process.argv);
