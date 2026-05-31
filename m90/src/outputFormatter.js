const Table = require('cli-table3');
const chalk = require('chalk');

class OutputFormatter {
  static printCommandResults(results, showFullOutput = false) {
    console.log('\n' + chalk.cyan.bold('════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('                    命令执行结果'));
    console.log(chalk.cyan.bold('════════════════════════════════════════════════════════════\n'));

    const table = new Table({
      head: [
        chalk.white.bold('服务器'),
        chalk.white.bold('主机'),
        chalk.white.bold('状态'),
        chalk.white.bold('执行时间'),
        chalk.white.bold('退出码'),
      ],
      colWidths: [20, 20, 12, 14, 10],
      style: {
        head: [],
        border: ['gray'],
      },
    });

    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    results.forEach((result) => {
      const status = result.success
        ? chalk.green.bold('成功')
        : chalk.red.bold('失败');
      
      const exitCode = result.success
        ? chalk.green(result.exitCode || 0)
        : chalk.red(result.exitCode || 'N/A');

      table.push([
        chalk.white(result.server),
        chalk.gray(result.host),
        status,
        chalk.yellow(`${result.executionTime}ms`),
        exitCode,
      ]);
    });

    console.log(table.toString());

    console.log('\n' + chalk.blue('概要: ') + 
      chalk.green(`成功 ${successCount}`) + ' / ' + 
      chalk.red(`失败 ${failCount}`) + 
      ` (共 ${results.length} 台服务器)\n`);

    if (showFullOutput) {
      this.printDetailedOutput(results);
    } else {
      console.log(chalk.gray('提示: 使用 -v 或 --verbose 参数查看完整输出\n'));
    }
  }

  static printDetailedOutput(results) {
    console.log(chalk.magenta.bold('\n━━━━━━━━━━━━━━━━━━━━━━━━ 详细输出 ━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    results.forEach((result) => {
      const statusColor = result.success ? chalk.green : chalk.red;
      
      console.log(statusColor.bold(`【${result.server}】`) + chalk.gray(` (${result.host})`));
      console.log(chalk.gray('命令: ') + chalk.white(result.command));
      
      if (result.stdout) {
        console.log(chalk.blue.bold('标准输出:'));
        console.log(chalk.white(this.indentText(result.stdout)));
      }
      
      if (result.stderr) {
        console.log(chalk.red.bold('标准错误:'));
        console.log(chalk.red(this.indentText(result.stderr)));
      }
      
      if (result.error) {
        console.log(chalk.red.bold('错误信息: ') + chalk.red(result.error));
      }
      
      console.log(chalk.gray('─'.repeat(60)) + '\n');
    });
  }

  static printServerList(servers) {
    console.log('\n' + chalk.cyan.bold('════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('                    已配置的服务器列表'));
    console.log(chalk.cyan.bold('════════════════════════════════════════════════════════════\n'));

    const table = new Table({
      head: [
        chalk.white.bold('名称'),
        chalk.white.bold('主机'),
        chalk.white.bold('端口'),
        chalk.white.bold('用户名'),
        chalk.white.bold('认证方式'),
      ],
      colWidths: [20, 25, 10, 15, 15],
      style: {
        head: [],
        border: ['gray'],
      },
    });

    servers.forEach((server) => {
      const authMethod = server.privateKey ? '私钥' : '密码';
      table.push([
        chalk.white(server.name),
        chalk.gray(server.host),
        chalk.white(server.port || 22),
        chalk.white(server.username),
        chalk.cyan(authMethod),
      ]);
    });

    console.log(table.toString());
    console.log(`\n共 ${servers.length} 台服务器\n`);
  }

  static printConnectionTest(results) {
    console.log('\n' + chalk.cyan.bold('════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('                    连接测试结果'));
    console.log(chalk.cyan.bold('════════════════════════════════════════════════════════════\n'));

    const table = new Table({
      head: [
        chalk.white.bold('服务器'),
        chalk.white.bold('主机'),
        chalk.white.bold('状态'),
        chalk.white.bold('信息'),
      ],
      colWidths: [20, 25, 12, 35],
      style: {
        head: [],
        border: ['gray'],
      },
    });

    const successCount = results.filter(r => r.success).length;

    results.forEach((result) => {
      const status = result.success
        ? chalk.green.bold('成功')
        : chalk.red.bold('失败');
      
      const message = result.success
        ? chalk.gray('连接成功')
        : chalk.red(result.error || '未知错误');

      table.push([
        chalk.white(result.server),
        chalk.gray(result.host),
        status,
        message,
      ]);
    });

    console.log(table.toString());
    console.log('\n' + chalk.blue('连接成功率: ') + 
      chalk.green(`${successCount}/${results.length}`) +
      ` (${((successCount / results.length) * 100).toFixed(1)}%)\n`);
  }

  static printAuditLogs(logs, limit = null) {
    console.log('\n' + chalk.cyan.bold('════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('                    操作审计日志'));
    console.log(chalk.cyan.bold('════════════════════════════════════════════════════════════\n'));

    if (logs.length === 0) {
      console.log(chalk.yellow('暂无审计日志记录\n'));
      return;
    }

    const table = new Table({
      head: [
        chalk.white.bold('ID'),
        chalk.white.bold('时间'),
        chalk.white.bold('用户'),
        chalk.white.bold('命令'),
        chalk.white.bold('服务器'),
        chalk.white.bold('状态'),
      ],
      colWidths: [8, 20, 12, 30, 15, 10],
      style: {
        head: [],
        border: ['gray'],
      },
    });

    logs.forEach((log) => {
      const status = log.success
        ? chalk.green('成功')
        : chalk.red('失败');

      table.push([
        chalk.white(log.id),
        chalk.gray(log.executed_at),
        chalk.cyan(log.executed_by),
        chalk.white(this.truncateText(log.command, 27)),
        chalk.white(this.truncateText(log.servers, 12)),
        status,
      ]);
    });

    console.log(table.toString());
    console.log(`\n共 ${logs.length} 条记录${limit ? ` (显示前 ${limit} 条)` : ''}\n`);
  }

  static printAuditLogDetail(log) {
    console.log('\n' + chalk.cyan.bold('════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan.bold('                    审计日志详情'));
    console.log(chalk.cyan.bold('════════════════════════════════════════════════════════════\n'));

    console.log(chalk.blue.bold('基本信息:'));
    console.log(chalk.white(`  日志ID: ${log.id}`));
    console.log(chalk.white(`  执行时间: ${log.executed_at}`));
    console.log(chalk.white(`  执行用户: ${log.executed_by}`));
    console.log(chalk.white(`  目标服务器: ${log.servers}`));
    console.log(chalk.white(`  并发数: ${log.concurrency}`));
    console.log('');

    console.log(chalk.blue.bold('执行命令:'));
    console.log(chalk.white(this.indentText(log.command)));
    console.log('');

    const results = JSON.parse(log.results);
    console.log(chalk.blue.bold('执行结果汇总:'));
    
    const successCount = results.filter(r => r.success).length;
    console.log(chalk.white(`  成功: ${successCount}, 失败: ${results.length - successCount}`));
    console.log('');

    console.log(chalk.blue.bold('详细结果:'));
    results.forEach((result) => {
      const status = result.success ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${status} ${chalk.white(result.server)} (${result.executionTime}ms)`);
      if (!result.success && result.error) {
        console.log(chalk.red(`    错误: ${result.error}`));
      }
    });
    console.log('');
  }

  static indentText(text, indent = '  ') {
    return text.split('\n').map(line => indent + line).join('\n');
  }

  static truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  static printError(message) {
    console.error('\n' + chalk.red.bold('错误: ') + chalk.red(message) + '\n');
  }

  static printSuccess(message) {
    console.log('\n' + chalk.green.bold('成功: ') + chalk.green(message) + '\n');
  }

  static printInfo(message) {
    console.log(chalk.blue('ℹ ') + chalk.gray(message));
  }
}

module.exports = OutputFormatter;
