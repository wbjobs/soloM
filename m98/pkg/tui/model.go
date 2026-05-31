package tui

import (
	"fmt"
	"strings"
	"time"

	"flowcli/pkg/dsl"
	"flowcli/pkg/scheduler"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/bubbles/viewport"
	"github.com/charmbracelet/lipgloss"
)

type statusColors struct {
	pending   lipgloss.Style
	running   lipgloss.Style
	completed lipgloss.Style
	failed    lipgloss.Style
	skipped   lipgloss.Style
	paused    lipgloss.Style
	cancelled lipgloss.Style
}

type Model struct {
	config       *dsl.Config
	scheduler    *scheduler.Scheduler
	taskStatus   map[string]scheduler.TaskStatus
	taskResults  map[string]*scheduler.TaskResult
	taskOrder    []string
	logEntries   []string
	logViewport  viewport.Model
	width        int
	height       int
	isPaused     bool
	isCancelled  bool
	isFinished   bool
	workflowErr  error
	startTime    time.Time
	colors       statusColors
	selectedTask int
}

type tickMsg time.Time

func NewModel(config *dsl.Config, sched *scheduler.Scheduler) Model {
	vp := viewport.New(80, 10)
	vp.SetContent("")

	taskOrder := make([]string, len(config.Workflow.Tasks))
	taskStatus := make(map[string]scheduler.TaskStatus)
	for i, task := range config.Workflow.Tasks {
		taskOrder[i] = task.Name
		taskStatus[task.Name] = scheduler.StatusPending
	}

	colors := statusColors{
		pending:   lipgloss.NewStyle().Foreground(lipgloss.Color("244")),
		running:   lipgloss.NewStyle().Foreground(lipgloss.Color("33")).Bold(true),
		completed: lipgloss.NewStyle().Foreground(lipgloss.Color("42")).Bold(true),
		failed:    lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Bold(true),
		skipped:   lipgloss.NewStyle().Foreground(lipgloss.Color("244")).Faint(true),
		paused:    lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Bold(true),
		cancelled: lipgloss.NewStyle().Foreground(lipgloss.Color("166")).Bold(true),
	}

	return Model{
		config:      config,
		scheduler:   sched,
		taskStatus:  taskStatus,
		taskResults: make(map[string]*scheduler.TaskResult),
		taskOrder:   taskOrder,
		logEntries:  make([]string, 0),
		logViewport: vp,
		colors:      colors,
		startTime:   time.Now(),
	}
}

func (m Model) Init() tea.Cmd {
	return tea.Batch(
		tickCmd(),
		m.listenForUpdates(),
	)
}

func tickCmd() tea.Cmd {
	return tea.Tick(100*time.Millisecond, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}

func (m Model) listenForUpdates() tea.Cmd {
	return func() tea.Msg {
		update, ok := <-m.scheduler.GetUpdateChan()
		if !ok {
			return scheduler.SchedulerUpdate{Type: "finished"}
		}
		return update
	}
}

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd

	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			if !m.isFinished {
				m.scheduler.Cancel()
			}
			return m, tea.Quit
		case "p":
			if !m.isFinished && !m.isCancelled {
				if m.isPaused {
					m.scheduler.Resume()
				} else {
					m.scheduler.Pause()
				}
			}
		case "c":
			if !m.isFinished && !m.isCancelled {
				m.scheduler.Cancel()
			}
		case "up", "k":
			if m.selectedTask > 0 {
				m.selectedTask--
			}
		case "down", "j":
			if m.selectedTask < len(m.taskOrder)-1 {
				m.selectedTask++
			}
		}

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.logViewport.Width = m.width - 4
		m.logViewport.Height = m.height - 18

	case tickMsg:
		cmds = append(cmds, tickCmd())

	case scheduler.SchedulerUpdate:
		switch msg.Type {
		case "finished":
			m.isFinished = true
			m.workflowErr = m.scheduler.CheckResults()
			return m, nil
		case "pause":
			m.isPaused = true
		case "resume":
			m.isPaused = false
		case "cancel":
			m.isCancelled = true
		case "status":
			m.taskStatus[msg.TaskName] = msg.Status
		case "result":
			m.taskResults[msg.TaskName] = msg.Result
			m.taskStatus[msg.TaskName] = msg.Status
		case "log":
			if msg.LogEntry != nil {
				ts := msg.LogEntry.Timestamp.Format("15:04:05")
				taskName := msg.LogEntry.TaskName
				if taskName == "" {
					taskName = "system"
				}
				line := fmt.Sprintf("[%s] [%s] %s", ts, taskName, msg.LogEntry.Message)
				m.logEntries = append(m.logEntries, line)
				m.logViewport.SetContent(strings.Join(m.logEntries, "\n"))
				m.logViewport.GotoBottom()
			}
		}

		if !m.isFinished {
			cmds = append(cmds, m.listenForUpdates())
		}
	}

	var vpCmd tea.Cmd
	m.logViewport, vpCmd = m.logViewport.Update(msg)
	cmds = append(cmds, vpCmd)

	return m, tea.Batch(cmds...)
}

func (m Model) statusColor(status scheduler.TaskStatus) lipgloss.Style {
	switch status {
	case scheduler.StatusPending:
		return m.colors.pending
	case scheduler.StatusRunning:
		return m.colors.running
	case scheduler.StatusCompleted:
		return m.colors.completed
	case scheduler.StatusFailed:
		return m.colors.failed
	case scheduler.StatusSkipped:
		return m.colors.skipped
	case scheduler.StatusPaused:
		return m.colors.paused
	case scheduler.StatusCancelled:
		return m.colors.cancelled
	default:
		return m.colors.pending
	}
}

func statusIcon(status scheduler.TaskStatus) string {
	switch status {
	case scheduler.StatusPending:
		return "○"
	case scheduler.StatusRunning:
		return "●"
	case scheduler.StatusCompleted:
		return "✓"
	case scheduler.StatusFailed:
		return "✗"
	case scheduler.StatusSkipped:
		return "→"
	case scheduler.StatusPaused:
		return "⏸"
	case scheduler.StatusCancelled:
		return "⊘"
	default:
		return "○"
	}
}

func statusLabel(status scheduler.TaskStatus) string {
	switch status {
	case scheduler.StatusPending:
		return "PENDING"
	case scheduler.StatusRunning:
		return "RUNNING"
	case scheduler.StatusCompleted:
		return "DONE"
	case scheduler.StatusFailed:
		return "FAILED"
	case scheduler.StatusSkipped:
		return "SKIPPED"
	case scheduler.StatusPaused:
		return "PAUSED"
	case scheduler.StatusCancelled:
		return "CANCELLED"
	default:
		return "PENDING"
	}
}
