package ui

import (
	"fmt"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
	"server-monitor/internal/collector"
)

type ProcessesPanel struct {
	*tview.Table
	headerStyle tcell.Style
}

func NewProcessesPanel() *ProcessesPanel {
	p := &ProcessesPanel{
		Table:       tview.NewTable().SetBorders(false),
		headerStyle: tcell.StyleDefault.Foreground(tcell.ColorYellow).Bold(true),
	}

	p.SetBorder(true).SetTitle(" Top 10 内存占用进程 ")

	headers := []string{"PID", "进程名", "内存占用", "内存占比", "CPU占用"}
	for i, header := range headers {
		p.SetCell(0, i, tview.NewTableCell(header).SetStyle(p.headerStyle).SetSelectable(false))
	}

	p.SetSelectable(true, false)

	return p
}

func (p *ProcessesPanel) Update(processes []collector.ProcessInfo) {
	for i := 1; i <= 10; i++ {
		for j := 0; j < 5; j++ {
			p.SetCell(i, j, tview.NewTableCell(""))
		}
	}

	for i, proc := range processes {
		if i >= 10 {
			break
		}

		row := i + 1
		name := proc.Name
		if len(name) > 20 {
			name = name[:17] + "..."
		}

		p.SetCell(row, 0, tview.NewTableCell(fmt.Sprintf("%d", proc.PID)))
		p.SetCell(row, 1, tview.NewTableCell(name))
		p.SetCell(row, 2, tview.NewTableCell(formatBytes(proc.MemoryRSS)))
		p.SetCell(row, 3, tview.NewTableCell(fmt.Sprintf("%.1f%%", proc.MemoryPercent)))
		p.SetCell(row, 4, tview.NewTableCell(fmt.Sprintf("%.1f%%", proc.CPUPercent)))
	}
}
