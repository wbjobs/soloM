package tui

import (
	"fmt"
	"strings"
	"time"

	"flowcli/pkg/dsl"
	"flowcli/pkg/scheduler"

	"github.com/charmbracelet/lipgloss"
)

var (
	titleStyle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("255")).
			Background(lipgloss.Color("63")).
			Padding(0, 1).
			Width(80).
			Align(lipgloss.Center)

	subtitleStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("244")).
			Italic(true)

	sectionTitle = lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("33")).
			MarginTop(1).
			MarginBottom(0)

	borderStyle = lipgloss.NewStyle().
			Border(lipgloss.NormalBorder()).
			BorderForeground(lipgloss.Color("240")).
			Padding(1)

	selectedStyle = lipgloss.NewStyle().
			Background(lipgloss.Color("57")).
			Foreground(lipgloss.Color("255"))

	helpStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("244")).
			Italic(true)

	nodeBox = lipgloss.NewStyle().
		Border(lipgloss.NormalBorder()).
		Padding(0, 2).
		MarginRight(2).
		MarginBottom(1).
		Align(lipgloss.Center).
		Width(20)
)

func (m Model) View() string {
	var sb strings.Builder

	header := m.renderHeader()
	sb.WriteString(header)
	sb.WriteString("\n\n")

	topSection := lipgloss.JoinHorizontal(
		lipgloss.Top,
		m.renderTaskList(),
		m.renderTopology(),
	)
	sb.WriteString(topSection)
	sb.WriteString("\n")

	sb.WriteString(m.renderProgressBar())
	sb.WriteString("\n")

	sb.WriteString(m.renderLogs())
	sb.WriteString("\n")

	sb.WriteString(m.renderHelp())

	return sb.String()
}

func (m Model) renderHeader() string {
	status := "RUNNING"
	statusColor := m.colors.running
	if m.isPaused {
		status = "PAUSED"
		statusColor = m.colors.paused
	} else if m.isCancelled {
		status = "CANCELLED"
		statusColor = m.colors.cancelled
	} else if m.isFinished {
		if m.workflowErr != nil {
			status = "FAILED"
			statusColor = m.colors.failed
		} else {
			status = "COMPLETED"
			statusColor = m.colors.completed
		}
	}

	elapsed := time.Since(m.startTime).Round(time.Second)
	title := fmt.Sprintf("FlowCLI: %s", m.config.Workflow.Name)
	subtitle := fmt.Sprintf("%s | Elapsed: %v | Status: %s",
		m.config.Workflow.Description, elapsed, statusColor.Render(status))

	return fmt.Sprintf("%s\n%s",
		titleStyle.Render(title),
		subtitleStyle.Render("  "+subtitle))
}

func (m Model) renderTaskList() string {
	width := 45
	if m.width > 0 {
		width = m.width / 2 - 4
	}
	if width < 45 {
		width = 45
	}

	var sb strings.Builder
	sb.WriteString(sectionTitle.Render("Tasks"))
	sb.WriteString("\n")

	header := fmt.Sprintf("%-3s %-20s %-10s %-10s", " ", "Task", "Status", "Duration")
	sb.WriteString(header)
	sb.WriteString("\n")
	sb.WriteString(strings.Repeat("─", width))
	sb.WriteString("\n")

	for i, taskName := range m.taskOrder {
		status := m.taskStatus[taskName]
		result := m.taskResults[taskName]

		icon := statusIcon(status)
		coloredIcon := m.statusColor(status).Render(icon)
		coloredStatus := m.statusColor(status).Render(statusLabel(status))

		duration := "-"
		if result != nil && !result.StartTime.IsZero() {
			end := result.EndTime
			if end.IsZero() {
				end = time.Now()
			}
			duration = end.Sub(result.StartTime).Round(time.Millisecond).String()
		}

		line := fmt.Sprintf("%-3s %-20s %-10s %-10s",
			coloredIcon, truncate(taskName, 20), coloredStatus, duration)

		if i == m.selectedTask {
			line = selectedStyle.Render(line)
		}

		sb.WriteString(line)
		sb.WriteString("\n")

		if result != nil && m.selectedTask == i {
			if result.Stdout != "" {
				sb.WriteString("       stdout: " + truncate(result.Stdout, 40) + "\n")
			}
			if result.Stderr != "" {
				sb.WriteString("       stderr: " + truncate(result.Stderr, 40) + "\n")
			}
		}
	}

	return borderStyle.Copy().Width(width).Render(sb.String())
}

func (m Model) renderTopology() string {
	width := 45
	if m.width > 0 {
		width = m.width/2 - 4
	}
	if width < 45 {
		width = 45
	}

	var sb strings.Builder
	sb.WriteString(sectionTitle.Render("Task Topology"))
	sb.WriteString("\n")

	taskMap := make(map[string]*dsl.Task)
	for i := range m.config.Workflow.Tasks {
		task := &m.config.Workflow.Tasks[i]
		taskMap[task.Name] = task
	}

	levels := m.topologicalLevels()
	for lvl, level := range levels {
		var nodes []string
		for _, taskName := range level {
			status := m.taskStatus[taskName]
			coloredName := m.statusColor(status).Render(taskName)
			icon := statusIcon(status)
			nodeContent := fmt.Sprintf("%s %s", icon, coloredName)
			nodeBoxStyled := nodeBox.Copy().
				BorderForeground(lipgloss.Color(m.statusColorHex(status)))
			nodes = append(nodes, nodeBoxStyled.Render(nodeContent))
		}

		sb.WriteString(lipgloss.JoinHorizontal(lipgloss.Center, nodes...))
		sb.WriteString("\n")

		if lvl < len(levels)-1 {
			sb.WriteString(strings.Repeat("          ↓          ", len(level)) + "\n")
		}
	}

	return borderStyle.Copy().Width(width).Render(sb.String())
}

func (m Model) statusColorHex(status scheduler.TaskStatus) string {
	switch status {
	case scheduler.StatusPending:
		return "244"
	case scheduler.StatusRunning:
		return "33"
	case scheduler.StatusCompleted:
		return "42"
	case scheduler.StatusFailed:
		return "196"
	case scheduler.StatusSkipped:
		return "244"
	case scheduler.StatusPaused:
		return "214"
	case scheduler.StatusCancelled:
		return "166"
	default:
		return "244"
	}
}

func (m Model) topologicalLevels() [][]string {
	visited := make(map[string]bool)
	levels := [][]string{}
	taskMap := make(map[string][]string)
	for _, task := range m.config.Workflow.Tasks {
		taskMap[task.Name] = task.DependsOn
	}

	for len(visited) < len(m.config.Workflow.Tasks) {
		currentLevel := []string{}
		for _, task := range m.config.Workflow.Tasks {
			if visited[task.Name] {
				continue
			}
			allDepsVisited := true
			for _, dep := range task.DependsOn {
				if !visited[dep] {
					allDepsVisited = false
					break
				}
			}
			if allDepsVisited {
				currentLevel = append(currentLevel, task.Name)
			}
		}
		for _, name := range currentLevel {
			visited[name] = true
		}
		levels = append(levels, currentLevel)
	}

	return levels
}

func (m Model) renderProgressBar() string {
	total := len(m.taskOrder)
	completed := 0
	running := 0
	failed := 0
	skipped := 0
	cancelled := 0

	for _, name := range m.taskOrder {
		status := m.taskStatus[name]
		switch status {
		case scheduler.StatusCompleted:
			completed++
		case scheduler.StatusRunning:
			running++
		case scheduler.StatusFailed:
			failed++
		case scheduler.StatusSkipped:
			skipped++
		case scheduler.StatusCancelled:
			cancelled++
		}
	}

	percent := 0
	if total > 0 {
		percent = (completed * 100) / total
	}

	width := 60
	if m.width > 0 {
		width = m.width - 20
	}

	progressWidth := width
	if progressWidth < 20 {
		progressWidth = 20
	}

	filled := (percent * progressWidth) / 100

	bar := strings.Builder{}
	bar.WriteString(m.colors.completed.Render(strings.Repeat("█", filled)))
	bar.WriteString(strings.Repeat("░", progressWidth-filled))

	var sb strings.Builder
	sb.WriteString(sectionTitle.Render("Progress"))
	sb.WriteString("\n")
	sb.WriteString(fmt.Sprintf("  [%s] %d%%\n", bar.String(), percent))
	sb.WriteString(fmt.Sprintf("  %s %d completed | %s %d running | %s %d failed | %s %d skipped | %s %d cancelled",
		m.colors.completed.Render("●"), completed,
		m.colors.running.Render("●"), running,
		m.colors.failed.Render("●"), failed,
		m.colors.skipped.Render("●"), skipped,
		m.colors.cancelled.Render("●"), cancelled))

	return sb.String()
}

func (m Model) renderLogs() string {
	return m.logViewport.View()
}

func (m Model) renderHelp() string {
	var keys []string

	if m.isPaused {
		keys = append(keys, "p: resume")
	} else if !m.isFinished && !m.isCancelled {
		keys = append(keys, "p: pause")
	}

	if !m.isFinished && !m.isCancelled {
		keys = append(keys, "c: cancel")
	}

	keys = append(keys, "↑↓/jk: select", "q: quit")

	return helpStyle.Render("  " + strings.Join(keys, "  |  "))
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	if max <= 3 {
		return s[:max]
	}
	return s[:max-3] + "..."
}
