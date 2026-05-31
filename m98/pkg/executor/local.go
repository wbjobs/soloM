package executor

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"flowcli/pkg/dsl"
	"flowcli/pkg/scheduler"
)

type LocalExecutor struct{}

func NewLocalExecutor() *LocalExecutor {
	return &LocalExecutor{}
}

func (e *LocalExecutor) Execute(ctx context.Context, task *dsl.Task, node *dsl.Node) (*scheduler.ExecResult, error) {
	cmdStr := task.Command
	if task.Script != "" {
		cmdStr = task.Script
	}

	if cmdStr == "" {
		return nil, fmt.Errorf("no command or script specified for task: %s", task.Name)
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/C", cmdStr)
	} else {
		cmd = exec.CommandContext(ctx, "bash", "-c", cmdStr)
	}

	env := os.Environ()
	for k, v := range task.Env {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}
	cmd.Env = env

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	result := &scheduler.ExecResult{
		Stdout: strings.TrimSpace(stdout.String()),
		Stderr: strings.TrimSpace(stderr.String()),
	}

	if err != nil {
		return result, err
	}

	return result, nil
}
