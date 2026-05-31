package tui

import (
	"flowcli/pkg/dsl"
	"flowcli/pkg/scheduler"

	tea "github.com/charmbracelet/bubbletea"
)

func Run(config *dsl.Config, sched *scheduler.Scheduler) (*scheduler.Scheduler, error) {
	model := NewModel(config, sched)

	p := tea.NewProgram(model, tea.WithAltScreen())

	go func() {
		if err := sched.Run(); err != nil {
		}
	}()

	if _, err := p.Run(); err != nil {
		return sched, err
	}

	return sched, nil
}
