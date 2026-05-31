package ui

import (
	"fmt"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
	"server-monitor/internal/remote"
)

type DiskPanel struct {
	*tview.Grid
	ioSparkline    *MultiSparkline
	partitionsTable *tview.Table
	usageTextView  *tview.TextView
	readHistory    []float64
	writeHistory   []float64
	maxHistory     int
}

func NewDiskPanel() *DiskPanel {
	p := &DiskPanel{
		Grid:            tview.NewGrid(),
		ioSparkline:     NewMultiSparkline().SetTitle(" 磁盘 IO 趋势 "),
		partitionsTable: tview.NewTable().SetBorders(false),
		usageTextView:   tview.NewTextView().SetBorder(true).SetTitle(" 磁盘使用详情 "),
		maxHistory:      100,
	}

	p.partitionsTable.SetBorder(true).SetTitle(" 磁盘分区 ")
	p.partitionsTable.SetSelectable(true, false)
	p.usageTextView.SetDynamicColors(true)

	headers := []string{"挂载点", "设备", "文件系统", "总容量", "已用", "可用", "使用率"}
	headerStyle := tcell.StyleDefault.Foreground(tcell.ColorYellow).Bold(true)
	for i, header := range headers {
		p.partitionsTable.SetCell(0, i, tview.NewTableCell(header).SetStyle(headerStyle).SetSelectable(false))
	}

	p.SetRows(-3, -2).
		SetColumns(-1).
		AddItem(p.ioSparkline, 0, 0, 1, 1, 0, 0, false).
		AddItem(p.Grid.
			SetRows(-1).
			SetColumns(-3, -2).
			AddItem(p.partitionsTable, 0, 0, 1, 1, 0, 0, false).
			AddItem(p.usageTextView, 0, 1, 1, 1, 0, 0, false),
			1, 0, 1, 1, 0, 0, false)

	return p
}

func (p *DiskPanel) Update(node *remote.ServerNode) {
	metrics := node.GetMetrics()
	readHistory, writeHistory := node.GetDiskHistory()

	if metrics == nil || !metrics.Connected {
		lines := []*SparklineLine{
			{Data: []float64{}, Color: tcell.ColorCyan, Label: "读取", Unit: " KB/s"},
			{Data: []float64{}, Color: tcell.ColorOrange, Label: "写入", Unit: " KB/s"},
		}
		p.ioSparkline.SetLines(lines)
		errorMsg := "暂无数据"
		if metrics != nil && metrics.Error != "" {
			errorMsg = metrics.Error
		}
		p.usageTextView.SetText(fmt.Sprintf("\n  [red]%s[-]", errorMsg))
		return
	}

	lines := []*SparklineLine{
		{
			Data:  readHistory,
			Color: tcell.ColorCyan,
			Label: "读取",
			Unit:  " KB/s",
		},
		{
			Data:  writeHistory,
			Color: tcell.ColorOrange,
			Label: "写入",
			Unit:  " KB/s",
		},
	}
	p.ioSparkline.SetLines(lines)

	for i := 1; i < 20; i++ {
		for j := 0; j < 7; j++ {
			p.partitionsTable.SetCell(i, j, tview.NewTableCell(""))
		}
	}

	memPercent := metrics.MemoryPercent
	usageColor := tcell.ColorGreen
	if memPercent > 80 {
		usageColor = tcell.ColorRed
	} else if memPercent > 60 {
		usageColor = tcell.ColorYellow
	}

	p.partitionsTable.SetCell(1, 0, tview.NewTableCell("/"))
	p.partitionsTable.SetCell(1, 1, tview.NewTableCell(node.Config.Host))
	p.partitionsTable.SetCell(1, 2, tview.NewTableCell("remote"))
	p.partitionsTable.SetCell(1, 3, tview.NewTableCell(formatBytes(metrics.MemoryTotal)))
	p.partitionsTable.SetCell(1, 4, tview.NewTableCell(formatBytes(metrics.MemoryUsed)))
	p.partitionsTable.SetCell(1, 5, tview.NewTableCell(formatBytes(metrics.MemoryTotal - metrics.MemoryUsed)))
	p.partitionsTable.SetCell(1, 6, tview.NewTableCell(fmt.Sprintf("%.1f%%", memPercent)).SetTextColor(usageColor))

	totalPercent := memPercent

	usageText := fmt.Sprintf(`
  [green]主机:[-] %s
  [green]地址:[-] %s

  [green]总内存:[-] %s
  [green]已使用:[-] [yellow]%s[-]
  [green]可用:[-] [cyan]%s[-]
  [green]使用率:[-] %s

  [green]读取速率:[-] [cyan]%s/s[-]
  [green]写入速率:[-] [yellow]%s/s[-]

  [green]总读取:[-] %s
  [green]总写入:[-] %s
`,
		metrics.Hostname,
		node.Config.Host,
		formatBytes(metrics.MemoryTotal),
		formatBytes(metrics.MemoryUsed),
		formatBytes(metrics.MemoryTotal - metrics.MemoryUsed),
		formatPercent(totalPercent),
		formatBytes(uint64(metrics.DiskReadRate)),
		formatBytes(uint64(metrics.DiskWriteRate)),
		formatBytes(metrics.DiskReads),
		formatBytes(metrics.DiskWrites),
	)
	p.usageTextView.SetText(usageText)
}

func formatPercent(p float64) string {
	color := "[green]"
	if p > 80 {
		color = "[red]"
	} else if p > 60 {
		color = "[yellow]"
	}
	return fmt.Sprintf("%s%.1f%%[-]", color, p)
}
