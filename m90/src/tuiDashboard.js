const blessed = require('blessed');
const contrib = require('blessed-contrib');
const StatsCollector = require('./statsCollector');
const AuditLogger = require('./auditLogger');

class TuiDashboard {
  constructor(servers, options = {}) {
    this.servers = servers;
    this.refreshInterval = options.refreshInterval || 5000;
    this.concurrency = options.concurrency || 5;
    this.collector = new StatsCollector(servers, this.concurrency);
    this.screen = null;
    this.grid = null;
    this.widgets = {};
    this.refreshTimer = null;
    this.commandRunning = false;
    this.currentCommand = '';
    this.statsData = new Map();
    this.logLines = [];
    this.commandInput = null;
  }

  init() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Cluster Audit - 分布式集群运维仪表盘',
      fullUnicode: true,
    });

    this.createLayout();
    this.bindKeys();
    this.startRefresh();

    this.screen.render();

    this.addLog('{bold}仪表盘已启动{/bold}');
    this.addLog(`监控 ${this.servers.length} 台服务器，刷新间隔 ${this.refreshInterval / 1000}s`);
    this.addLog('{cyan-fg}[r]{/cyan-fg} 刷新  {cyan-fg}[e]{/cyan-fg} 执行命令  {cyan-fg}[q]{/cyan-fg} 退出');
  }

  createLayout() {
    const serverCount = this.servers.length;
    const rowsNeeded = Math.ceil(serverCount / 2);
    const totalRows = Math.max(7, rowsNeeded + 5);

    this.grid = new contrib.grid({
      rows: totalRows,
      cols: 4,
      screen: this.screen,
    });

    this.widgets.header = this.grid.set(0, 0, 1, 4, blessed.box, {
      content: '{center}{bold}{cyan-fg}  Cluster Audit — 分布式集群运维仪表盘  {/cyan-fg}{/bold}{/center}',
      tags: true,
      style: {
        bg: 'blue',
      },
    });

    this.widgets.cpuGauges = [];
    this.widgets.memGauges = [];
    this.widgets.cpuLabels = [];
    this.widgets.memLabels = [];

    for (let i = 0; i < serverCount; i++) {
      const col = (i % 2) * 2;
      const row = 1 + Math.floor(i / 2);
      const name = this.servers[i].name;

      const cpuGauge = this.grid.set(row, col, 1, 1, contrib.gauge, {
        label: ` CPU: ${name} `,
        stroke: 'green',
        fill: 'white',
        style: {
          border: { fg: 'cyan' },
        },
      });

      const memGauge = this.grid.set(row, col + 1, 1, 1, contrib.gauge, {
        label: ` MEM: ${name} `,
        stroke: 'yellow',
        fill: 'white',
        style: {
          border: { fg: 'cyan' },
        },
      });

      this.widgets.cpuGauges.push(cpuGauge);
      this.widgets.memGauges.push(memGauge);
    }

    const logRow = 1 + rowsNeeded;

    this.widgets.serverTable = this.grid.set(logRow, 0, 2, 2, contrib.table, {
      label: ' 服务器状态概览 ',
      columnWidth: [16, 16, 8, 10, 16],
      columnSpacing: 1,
      style: {
        border: { fg: 'cyan' },
        header: { fg: 'white', bold: true },
      },
    });
    this.widgets.serverTable.setData({
      headers: ['服务器', '负载均值', '连接', 'CPU', '内存'],
      rows: this.servers.map(s => [s.name, '—', '—', '—', '—']),
    });

    this.widgets.log = this.grid.set(logRow, 2, 2, 2, contrib.log, {
      label: ' 操作日志 ',
      style: {
        border: { fg: 'cyan' },
      },
      fg: 'green',
      selectedFg: 'green',
      bufferLength: 100,
    });

    const progressRow = logRow + 2;

    this.widgets.progressBar = this.grid.set(progressRow, 0, 1, 3, contrib.gauge, {
      label: ' 命令执行进度 ',
      stroke: 'cyan',
      fill: 'white',
      style: {
        border: { fg: 'cyan' },
      },
    });
    this.setGaugePercent(this.widgets.progressBar, 0);

    this.widgets.commandBox = this.grid.set(progressRow, 3, 1, 1, blessed.box, {
      label: ' 当前命令 ',
      content: '{center}无{/center}',
      tags: true,
      style: {
        border: { fg: 'cyan' },
      },
    });

    this.widgets.statusBar = this.grid.set(progressRow + 1, 0, 1, 4, blessed.box, {
      content: '{center}[r] 刷新  [e] 执行命令  [q] 退出  自动刷新: {green-fg}ON{/green-fg}{/center}',
      tags: true,
      style: {
        bg: 'blue',
        fg: 'white',
        bold: true,
      },
    });

    this.commandInput = blessed.textbox({
      parent: this.screen,
      bottom: 1,
      left: 'center',
      width: '60%',
      height: 3,
      border: { type: 'line', fg: 'yellow' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'yellow' },
        focus: { border: { fg: 'green' } },
      },
      hidden: true,
      inputOnFocus: true,
    });

    this.commandInput.key('enter', () => {
      const cmd = this.commandInput.getValue().trim();
      this.commandInput.hide();
      this.screen.render();
      if (cmd) {
        this.runCommand(cmd);
      }
    });

    this.commandInput.key('escape', () => {
      this.commandInput.hide();
      this.screen.render();
    });
  }

  setGaugePercent(gauge, percent) {
    try {
      if (typeof gauge.setPercent === 'function') {
        gauge.setPercent(percent);
      } else if (typeof gauge.setData === 'function') {
        gauge.setData([{
          percent: percent,
          stroke: percent > 90 ? 'red' : percent > 70 ? 'yellow' : 'green',
        }]);
      }
    } catch (e) {
      try { gauge.setPercent(percent); } catch (e2) {}
    }
  }

  bindKeys() {
    this.screen.key(['q', 'C-c'], () => {
      this.stopRefresh();
      this.collector.disconnectAll();
      this.screen.destroy();
      process.exit(0);
    });

    this.screen.key(['r'], () => {
      if (!this.commandRunning) {
        this.addLog('{cyan-fg}手动刷新...{/cyan-fg}');
        this.refreshStats();
      }
    });

    this.screen.key(['e'], () => {
      this.showCommandInput();
    });

    this.screen.on('resize', () => {
      this.screen.render();
    });
  }

  showCommandInput() {
    this.commandInput.show();
    this.commandInput.setValue('');
    this.commandInput.focus();
    this.screen.render();
  }

  startRefresh() {
    this.refreshStats();
    this.refreshTimer = setInterval(() => {
      if (!this.commandRunning) {
        this.refreshStats();
      }
    }, this.refreshInterval);
  }

  stopRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async refreshStats() {
    try {
      const stats = await this.collector.collectAll();
      this.updateDashboard(stats);
    } catch (error) {
      this.addLog(`{red-fg}采集失败: ${error.message}{/red-fg}`);
    }
  }

  updateDashboard(stats) {
    const tableRows = [];

    stats.forEach((stat, index) => {
      if (index < this.widgets.cpuGauges.length) {
        const cpuPercent = Math.round(stat.cpu);
        this.setGaugePercent(this.widgets.cpuGauges[index], cpuPercent);

        const memPercent = Math.round(stat.memPercent);
        this.setGaugePercent(this.widgets.memGauges[index], memPercent);
      }

      const status = stat.connected ? 'OK' : 'FAIL';
      const cpuStr = stat.connected ? `${stat.cpu.toFixed(1)}%` : 'N/A';
      const memStr = stat.connected
        ? `${stat.memUsed}/${stat.memTotal}M ${stat.memPercent.toFixed(0)}%`
        : 'N/A';
      const loadStr = stat.connected
        ? `${stat.loadAvg[0]} ${stat.loadAvg[1]} ${stat.loadAvg[2]}`
        : 'N/A';

      tableRows.push([stat.server, loadStr, status, cpuStr, memStr]);
    });

    try {
      if (this.widgets.serverTable) {
        this.widgets.serverTable.setData({
          headers: ['服务器', '负载均值', '连接', 'CPU', '内存'],
          rows: tableRows,
        });
      }
    } catch (e) {}

    this.statsData = new Map(stats.map(s => [s.server, s]));
    this.screen.render();
  }

  async runCommand(command) {
    if (this.commandRunning) {
      this.addLog('{red-fg}命令正在执行中，请等待...{/red-fg}');
      return;
    }

    this.commandRunning = true;
    this.currentCommand = command;
    this.widgets.commandBox.setContent(`{center}${command}{/center}`);
    this.addLog(`{yellow-fg}执行命令:{/yellow-fg} ${command}`);
    this.screen.render();

    this.stopRefresh();

    try {
      const results = await this.collector.executeWithProgress(command, (completed, total, serverName, success) => {
        const percent = Math.round((completed / total) * 100);
        this.setGaugePercent(this.widgets.progressBar, percent);
        
        const status = success ? '{green-fg}OK{/green-fg}' : '{red-fg}FAIL{/red-fg}';
        this.addLog(`${status} [${completed}/${total}] ${serverName}`);
        this.screen.render();
      });

      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      this.addLog(`{bold}执行完成:{/bold} 成功 ${successCount}, 失败 ${failCount}`);

      try {
        const logger = new AuditLogger();
        await logger.logCommand(command, this.servers, results, this.concurrency);
        this.addLog('{cyan-fg}已记录到审计日志{/cyan-fg}');
        await logger.close();
      } catch (logError) {
        this.addLog(`{red-fg}日志记录失败: ${logError.message}{/red-fg}`);
      }

      if (failCount > 0) {
        results.filter(r => !r.success).forEach(r => {
          const errMsg = r.error || r.stderr || '未知错误';
          this.addLog(`{red-fg}${r.server}: ${errMsg}{/red-fg}`);
        });
      }
    } catch (error) {
      this.addLog(`{red-fg}执行异常: ${error.message}{/red-fg}`);
    }

    this.commandRunning = false;
    this.currentCommand = '';

    setTimeout(() => {
      this.setGaugePercent(this.widgets.progressBar, 0);
      this.widgets.commandBox.setContent('{center}无{/center}');
      this.screen.render();
    }, 2000);

    this.startRefresh();
  }

  addLog(message) {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const line = `{grey-fg}[${time}]{/grey-fg} ${message}`;
    
    try {
      if (this.widgets.log) {
        this.widgets.log.log(line);
      }
    } catch (e) {}
    this.logLines.push(line);
    this.screen.render();
  }

  destroy() {
    this.stopRefresh();
    this.collector.disconnectAll();
    if (this.screen) {
      this.screen.destroy();
    }
  }
}

module.exports = TuiDashboard;
