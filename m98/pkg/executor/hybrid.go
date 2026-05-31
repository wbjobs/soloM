package executor

import (
	"context"

	"flowcli/pkg/dsl"
	"flowcli/pkg/scheduler"
)

type HybridExecutor struct {
	local *LocalExecutor
	ssh   *SSHExecutor
}

func NewHybridExecutor() *HybridExecutor {
	return &HybridExecutor{
		local: NewLocalExecutor(),
		ssh:   NewSSHExecutor(),
	}
}

func (e *HybridExecutor) Execute(ctx context.Context, task *dsl.Task, node *dsl.Node) (*scheduler.ExecResult, error) {
	switch task.Executor {
	case "ssh":
		return e.ssh.Execute(ctx, task, node)
	case "local":
		fallthrough
	default:
		return e.local.Execute(ctx, task, node)
	}
}

var _ scheduler.Executor = (*HybridExecutor)(nil)
