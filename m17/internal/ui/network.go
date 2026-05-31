package ui

import (
	"fmt"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
	"server-monitor/internal/remote"
)

type NetworkPanel struct {
	*tview.Grid
	trafficSparkline *MultiSparkline
	interfacesTable  *tview.Table
	statsTextView    *tview.TextView
	recvHistory      []float64
	sentHistory      []float64
	maxHistory       int
}

func NewNetworkPanel() *NetworkPanel {
	p := &NetworkPanel{
		Grid:             tview.NewGrid(),
		trafficSparkline: NewMultiSparkline().SetTitle(" 网络流量趋势 "),
		interfacesTable:  tview.NewTable().SetBorders(false),
		statsTextView:    tview.NewTextView().SetBorder(true).SetTitle(" 网络统计 "),
		maxHistory:       100,
	}

	p.interfacesTable.SetBorder(true).SetTitle(" 网络接口 ")
	p.interfacesTable.SetSelectable(true, false)
	p.statsTextView.SetDynamicColors(true)

	headers := []string{"接口", "状态", "MTU", "硬件地址", "IP地址"}
	headerStyle := tcell.StyleDefault.Foreground(tcell.ColorYellow).Bold(true)
	for i, header := range headers {
		p.interfacesTable.SetCell(0, i, tview.NewTableCell(header).SetStyle(headerStyle).SetSelectable(false))
	}

	p.SetRows(-3, -2).
		SetColumns(-1).
		AddItem(p.trafficSparkline, 0, 0, 1, 1, 0, 0, false).
		AddItem(p.Grid.
			SetRows(-1).
			SetColumns(-2, -1).
			AddItem(p.interfacesTable, 0, 0, 1, 1, 0, 0, false).
			AddItem(p.statsTextView, 0, 1, 1, 1, 0, 0, false),
			1, 0, 1, 1, 0, 0, false)

	return p
}

func (p *NetworkPanel) Update(node *remote.ServerNode) {
	metrics := node.GetMetrics()
	recvHistory, sentHistory := node.GetNetworkHistory()

	if metrics == nil || !metrics.Connected {
		lines := []*SparklineLine{
			{Data: []float64{}, Color: tcell.ColorGreen, Label: "下载", Unit: " KB/s"},
			{Data: []float64{}, Color: tcell.ColorRed, Label: "上传", Unit: " KB/s"},
		}
		p.trafficSparkline.SetLines(lines)
		errorMsg := "暂无数据"
		if metrics != nil && metrics.Error != "" {
			errorMsg = metrics.Error
		}
		p.statsTextView.SetText(fmt.Sprintf("\n  [red]%s[-]", errorMsg))
		return
	}

	lines := []*SparklineLine{
		{
			Data:  recvHistory,
			Color: tcell.ColorGreen,
			Label: "下载",
			Unit:  " KB/s",
		},
		{
			Data:  sentHistory,
			Color: tcell.ColorRed,
			Label: "上传",
			Unit:  " KB/s",
		},
	}
	p.trafficSparkline.SetLines(lines)

	for i := 1; i < 20; i++ {
		for j := 0; j < 5; j++ {
			p.interfacesTable.SetCell(i, j, tview.NewTableCell(""))
		}
	}

	p.interfacesTable.SetCell(1, 0, tview.NewTableCell(node.Config.Host))
	p.interfacesTable.SetCell(1, 1, tview.NewTableCell("UP").SetTextColor(tcell.ColorGreen))
	p.interfacesTable.SetCell(1, 2, tview.NewTableCell("-"))
	p.interfacesTable.SetCell(1, 3, tview.NewTableCell("-"))
	p.interfacesTable.SetCell(1, 4, tview.NewTableCell(metrics.Hostname))

	statsText := fmt.Sprintf(`
  [green]主机:[-] %s
  [green]地址:[-] %s

  [green]总接收:[-] %s
  [green]总发送:[-] %s

  [green]接收速率:[-] [cyan]%s/s[-]
  [green]发送速率:[-] [yellow]%s/s[-]
`,
		metrics.Hostname,
		node.Config.Host,
		formatBytes(metrics.NetRecv),
		formatBytes(metrics.NetSent),
		formatBytes(uint64(metrics.NetRecvRate)),
		formatBytes(uint64(metrics.NetSentRate)),
	)
	p.statsTextView.SetText(statsText)
}
