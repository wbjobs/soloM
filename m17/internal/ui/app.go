package ui

import (
	"context"
	"fmt"
	"time"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
	"server-monitor/internal/collector"
	"server-monitor/internal/remote"
)

type Panel int

const (
	PanelOverview Panel = iota
	PanelProcesses
	PanelNetwork
	PanelDisk
	PanelServers
	PanelCount
)

type App struct {
	app              *tview.Application
	pages            *tview.Pages
	monitorPages     *tview.Pages
	serverTabs       *tview.TextView
	monitorTabs      *tview.TextView
	statusBar        *tview.TextView
	collector        *collector.Collector
	serverManager    *remote.ServerManager
	overview         *OverviewPanel
	processes        *ProcessesPanel
	network          *NetworkPanel
	disk             *DiskPanel
	serverMgrPanel   *ServerManagerPanel
	mainGrid         *tview.Grid
	currentPanel     Panel
	currentServer    string
	serverIDs        []string
	startTime        time.Time
	lastWidth        int
	lastHeight       int
	resizeChan       chan struct{}
}

func NewApp(configFile string) *App {
	a := &App{
		app:           tview.NewApplication(),
		pages:         tview.NewPages(),
		monitorPages:  tview.NewPages(),
		serverTabs:    tview.NewTextView(),
		monitorTabs:   tview.NewTextView(),
		statusBar:     tview.NewTextView(),
		collector:     collector.NewCollector(100),
		serverManager: remote.NewServerManager(100, configFile),
		overview:      NewOverviewPanel(),
		processes:     NewProcessesPanel(),
		network:       NewNetworkPanel(),
		disk:          NewDiskPanel(),
		currentPanel:  PanelOverview,
		currentServer: "local",
		startTime:     time.Now(),
		resizeChan:    make(chan struct{}, 1),
	}

	a.serverMgrPanel = NewServerManagerPanel(a.serverManager, a.app)
	a.serverMgrPanel.SetOnServerAdded(a.onServersChanged)
	a.serverMgrPanel.SetOnServerRemoved(a.onServersChanged)

	a.refreshServerList()
	a.setupUI()
	a.setupKeybindings()
	a.setupResizeHandler()

	return a
}

func (a *App) refreshServerList() {
	a.serverIDs = a.serverManager.GetServers()
}

func (a *App) onServersChanged() {
	a.refreshServerList()
	a.updateServerTabs()
	a.serverMgrPanel.RefreshServerList()
}

func (a *App) setupUI() {
	a.serverTabs.SetDynamicColors(true).
		SetTextAlign(tview.AlignCenter).
		SetBackgroundColor(tcell.ColorDefault)

	a.monitorTabs.SetDynamicColors(true).
		SetTextAlign(tview.AlignCenter).
		SetBackgroundColor(tcell.ColorDefault)

	a.statusBar.SetDynamicColors(true).
		SetTextAlign(tview.AlignLeft).
		SetBackgroundColor(tcell.ColorDefault)

	a.monitorPages.
		AddPage("overview", a.overview, true, true).
		AddPage("processes", a.processes, true, false).
		AddPage("network", a.network, true, false).
		AddPage("disk", a.disk, true, false).
		AddPage("servers", a.serverMgrPanel, true, false)

	monitorGrid := tview.NewGrid().
		SetRows(1, -1).
		AddItem(a.monitorTabs, 0, 0, 1, 1, 0, 0, false).
		AddItem(a.monitorPages, 1, 0, 1, 1, 0, 0, true)

	a.mainGrid = tview.NewGrid().
		SetRows(1, -1, 1).
		AddItem(a.serverTabs, 0, 0, 1, 1, 0, 0, false).
		AddItem(monitorGrid, 1, 0, 1, 1, 0, 0, true).
		AddItem(a.statusBar, 2, 0, 1, 1, 0, 0, false)

	a.pages.AddPage("main", a.mainGrid, true, true)
	a.app.SetRoot(a.pages, true)

	a.updateServerTabs()
	a.updateMonitorTabs()
}

func (a *App) setupKeybindings() {
	a.app.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey {
		switch event.Key() {
		case tcell.KeyTab, tcell.KeyRight:
			if event.Modifiers()&tcell.ModShift != 0 {
				a.switchServer((a.getCurrentServerIndex() + 1) % len(a.serverIDs))
			} else {
				a.switchPanel((a.currentPanel + 1) % PanelCount)
			}
			return nil
		case tcell.KeyBacktab, tcell.KeyLeft:
			if event.Modifiers()&tcell.ModShift != 0 {
				a.switchServer((a.getCurrentServerIndex() - 1 + len(a.serverIDs)) % len(a.serverIDs))
			} else {
				a.switchPanel((a.currentPanel - 1 + PanelCount) % PanelCount)
			}
			return nil
		case tcell.KeyUp:
			a.switchServer((a.getCurrentServerIndex() - 1 + len(a.serverIDs)) % len(a.serverIDs))
			return nil
		case tcell.KeyDown:
			a.switchServer((a.getCurrentServerIndex() + 1) % len(a.serverIDs))
			return nil
		case tcell.KeyCtrlC, tcell.KeyEsc:
			a.app.Stop()
			return nil
		case tcell.KeyF1:
			a.switchPanel(PanelOverview)
			return nil
		case tcell.KeyF2:
			a.switchPanel(PanelProcesses)
			return nil
		case tcell.KeyF3:
			a.switchPanel(PanelNetwork)
			return nil
		case tcell.KeyF4:
			a.switchPanel(PanelDisk)
			return nil
		case tcell.KeyF5:
			a.switchPanel(PanelServers)
			return nil
		}

		switch event.Rune() {
		case '1':
			a.switchPanel(PanelOverview)
			return nil
		case '2':
			a.switchPanel(PanelProcesses)
			return nil
		case '3':
			a.switchPanel(PanelNetwork)
			return nil
		case '4':
			a.switchPanel(PanelDisk)
			return nil
		case '5':
			a.switchPanel(PanelServers)
			return nil
		case 'q', 'Q':
			a.app.Stop()
			return nil
		}

		return event
	})
}

func (a *App) setupResizeHandler() {
	a.app.SetAfterDrawFunc(func(screen tcell.Screen) {
		width, height := screen.Size()
		if width != a.lastWidth || height != a.lastHeight {
			a.lastWidth = width
			a.lastHeight = height

			select {
			case a.resizeChan <- struct{}{}:
			default:
			}
		}
	})
}

func (a *App) forceRedraw() {
	a.app.QueueUpdateDraw(func() {
		screen := a.app.GetScreen()
		if screen != nil {
			width, height := screen.Size()
			style := tcell.StyleDefault.Background(tcell.ColorDefault)
			for y := 0; y < height; y++ {
				for x := 0; x < width; x++ {
					screen.SetContent(x, y, ' ', nil, style)
				}
			}
			screen.Show()
		}
	})
}

func (a *App) getCurrentServerIndex() int {
	for i, id := range a.serverIDs {
		if id == a.currentServer {
			return i
		}
	}
	return 0
}

func (a *App) switchServer(index int) {
	if index >= 0 && index < len(a.serverIDs) {
		a.currentServer = a.serverIDs[index]
		a.updateServerTabs()
		a.app.QueueUpdateDraw(a.updateUI)
	}
}

func (a *App) switchPanel(panel Panel) {
	a.currentPanel = panel
	a.updateMonitorTabs()

	switch panel {
	case PanelOverview:
		a.monitorPages.SwitchToPage("overview")
	case PanelProcesses:
		a.monitorPages.SwitchToPage("processes")
	case PanelNetwork:
		a.monitorPages.SwitchToPage("network")
	case PanelDisk:
		a.monitorPages.SwitchToPage("disk")
	case PanelServers:
		a.monitorPages.SwitchToPage("servers")
		a.serverMgrPanel.RefreshServerList()
	}
}

func (a *App) updateServerTabs() {
	var tabText string
	for i, id := range a.serverIDs {
		node, exists := a.serverManager.GetNode(id)
		if !exists {
			continue
		}

		name := node.Config.Name
		status := ""
		if id != "local" {
			if node.IsConnected() {
				status = "[green]●[-]"
			} else {
				status = "[red]●[-]"
			}
		} else {
			status = "[green]●[-]"
		}

		if id == a.currentServer {
			tabText += fmt.Sprintf("[white:blue] %s %s [-:-] ", status, name)
		} else {
			tabText += fmt.Sprintf("[gray:default] %s %s [-:-] ", status, name)
		}
	}
	tabText += "[gray:default]  切换: ↑↓ / Shift+Tab [-:-]"
	a.serverTabs.SetText(tabText)
}

func (a *App) updateMonitorTabs() {
	tabs := []string{"概览", "进程", "网络", "磁盘", "服务器"}
	var tabText string
	for i, tab := range tabs {
		if Panel(i) == a.currentPanel {
			tabText += fmt.Sprintf("[white:blue] %d.%s [-:-] ", i+1, tab)
		} else {
			tabText += fmt.Sprintf("[gray:default] %d.%s [-:-] ", i+1, tab)
		}
	}
	tabText += "[gray:default]  切换: ←→ / Tab  退出: q / Ctrl-C [-:-]"
	a.monitorTabs.SetText(tabText)
}

func (a *App) updateUI() {
	node, exists := a.serverManager.GetNode(a.currentServer)
	if !exists {
		return
	}

	if a.currentServer == "local" {
		metrics := a.collector.GetMetrics()
		a.serverManager.UpdateLocalMetrics(metrics)
	}

	switch a.currentPanel {
	case PanelOverview:
		a.overview.Update(node)
	case PanelProcesses:
		metrics := node.GetMetrics()
		if metrics != nil {
			a.processes.Update(metrics.Processes)
		}
	case PanelNetwork:
		a.network.Update(node)
	case PanelDisk:
		a.disk.Update(node)
	}

	a.updateStatusBar(node)
	a.app.Draw()
}

func (a *App) updateStatusBar(node *remote.ServerNode) {
	uptime := time.Since(a.startTime)
	hours := int(uptime.Hours())
	minutes := int(uptime.Minutes()) % 60
	seconds := int(uptime.Seconds()) % 60

	metrics := node.GetMetrics()
	cpuPercent := 0.0
	memPercent := 0.0
	if metrics != nil {
		cpuPercent = metrics.CPUPercent
		memPercent = metrics.MemoryPercent
	}

	status := fmt.Sprintf(
		"[green]服务器监控仪表盘[-] | [cyan]运行时间: %02d:%02d:%02d[-] | [yellow]%s[-] | [yellow]CPU: %.1f%%[-] [yellow]内存: %.1f%%[-] | [gray]%s[-]",
		hours, minutes, seconds,
		node.Config.Name,
		cpuPercent,
		memPercent,
		time.Now().Format("2006-01-02 15:04:05"),
	)
	a.statusBar.SetText(status)
}

func (a *App) Run() error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go a.collector.Start(ctx, 1*time.Second)

	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		resizeDebounce := time.NewTimer(50 * time.Millisecond)
		resizeDebounce.Stop()
		resizePending := false

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.serverManager.CollectAllRemote(ctx)
				a.app.QueueUpdateDraw(a.updateUI)
			case <-a.resizeChan:
				if !resizePending {
					resizePending = true
					resizeDebounce.Reset(50 * time.Millisecond)
				}
			case <-resizeDebounce.C:
				resizePending = false
				a.forceRedraw()
				a.app.QueueUpdateDraw(a.updateUI)
			}
		}
	}()

	return a.app.Run()
}
