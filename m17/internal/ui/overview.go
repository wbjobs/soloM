package ui

import (
	"fmt"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
	"server-monitor/internal/remote"
)

type OverviewPanel struct {
	*tview.Grid
	cpuSparkline *Sparkline
	memTextView  *tview.TextView
	diskTextView *tview.TextView
	netTextView  *tview.TextView
	sysTextView  *tview.TextView
}

func NewOverviewPanel() *OverviewPanel {
	p := &OverviewPanel{
		Grid:         tview.NewGrid(),
		cpuSparkline: NewSparkline().SetTitle(" CPU 使用率 ").SetColor(tcell.ColorGreen),
		memTextView:  tview.NewTextView().SetBorder(true).SetTitle(" 内存使用 "),
		diskTextView: tview.NewTextView().SetBorder(true).SetTitle(" 磁盘 IO "),
		netTextView:  tview.NewTextView().SetBorder(true).SetTitle(" 网络流量 "),
		sysTextView:  tview.NewTextView().SetBorder(true).SetTitle(" 系统信息 "),
	}

	p.memTextView.SetDynamicColors(true)
	p.diskTextView.SetDynamicColors(true)
	p.netTextView.SetDynamicColors(true)
	p.sysTextView.SetDynamicColors(true)

	p.SetRows(-3, -2, -2).
		SetColumns(-1, -1).
		AddItem(p.cpuSparkline, 0, 0, 1, 2, 0, 0, false).
		AddItem(p.memTextView, 1, 0, 1, 1, 0, 0, false).
		AddItem(p.sysTextView, 1, 1, 1, 1, 0, 0, false).
		AddItem(p.diskTextView, 2, 0, 1, 1, 0, 0, false).
		AddItem(p.netTextView, 2, 1, 1, 1, 0, 0, false)

	return p
}

func (p *OverviewPanel) Update(node *remote.ServerNode) {
	metrics := node.GetMetrics()
	cpuHistory := node.GetCPUHistory()

	if metrics == nil {
		p.cpuSparkline.SetData([]float64{})
		p.memTextView.SetText("\n  [red]暂无数据[-]")
		p.sysTextView.SetText("\n  [red]暂无数据[-]")
		p.diskTextView.SetText("\n  [red]暂无数据[-]")
		p.netTextView.SetText("\n  [red]暂无数据[-]")
		return
	}

	if !metrics.Connected {
		errorMsg := metrics.Error
		if errorMsg == "" {
			errorMsg = "未连接"
		}
		p.cpuSparkline.SetData([]float64{})
		p.memTextView.SetText(fmt.Sprintf("\n  [red]%s[-]", errorMsg))
		p.sysTextView.SetText(fmt.Sprintf("\n  [red]%s[-]", errorMsg))
		p.diskTextView.SetText(fmt.Sprintf("\n  [red]%s[-]", errorMsg))
		p.netTextView.SetText(fmt.Sprintf("\n  [red]%s[-]", errorMsg))
		return
	}

	p.cpuSparkline.SetData(cpuHistory)

	memText := fmt.Sprintf(`
  [green]物理内存:[-]
    已用: [yellow]%s[-] / %s (%.1f%%)
    可用: [cyan]%s[-]

  [green]交换分区:[-]
    已用: [yellow]%s[-] / %s (%.1f%%)
`,
		formatBytes(metrics.MemoryUsed),
		formatBytes(metrics.MemoryTotal),
		metrics.MemoryPercent,
		formatBytes(metrics.MemoryTotal-metrics.MemoryUsed),
		formatBytes(metrics.SwapUsed),
		formatBytes(metrics.SwapTotal),
		metrics.SwapPercent,
	)
	p.memTextView.SetText(memText)

	status := "[green]● 在线[-]"
	if !node.IsConnected() {
		status = "[red]● 离线[-]"
	}

	sysText := fmt.Sprintf(`
  [green]CPU:[-] [yellow]%.1f%%[-]
  [green]状态:[-] %s
  [green]主机:[-] %s
  [green]进程数:[-] [yellow]%d[-]
`,
		metrics.CPUPercent,
		status,
		metrics.Hostname,
		len(metrics.Processes),
	)
	p.sysTextView.SetText(sysText)

	diskText := fmt.Sprintf(`
  [green]读取速率:[-] [cyan]%s/s[-]
  [green]写入速率:[-] [yellow]%s/s[-]

  [green]总读取:[-] %s
  [green]总写入:[-] %s
`,
		formatBytes(uint64(metrics.DiskReadRate)),
		formatBytes(uint64(metrics.DiskWriteRate)),
		formatBytes(metrics.DiskReads),
		formatBytes(metrics.DiskWrites),
	)
	p.diskTextView.SetText(diskText)

	netText := fmt.Sprintf(`
  [green]下载速率:[-] [cyan]%s/s[-]
  [green]上传速率:[-] [yellow]%s/s[-]

  [green]总下载:[-] %s
  [green]总上传:[-] %s
`,
		formatBytes(uint64(metrics.NetRecvRate)),
		formatBytes(uint64(metrics.NetSentRate)),
		formatBytes(metrics.NetRecv),
		formatBytes(metrics.NetSent),
	)
	p.netTextView.SetText(netText)
}

func formatBytes(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
