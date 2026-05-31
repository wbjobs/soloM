package executor

import (
	"bytes"
	"context"
	"fmt"
	"io/ioutil"
	"net"
	"strings"
	"time"

	"flowcli/pkg/dsl"
	"flowcli/pkg/scheduler"

	"golang.org/x/crypto/ssh"
)

type SSHExecutor struct{}

func NewSSHExecutor() *SSHExecutor {
	return &SSHExecutor{}
}

func (e *SSHExecutor) Execute(ctx context.Context, task *dsl.Task, node *dsl.Node) (*scheduler.ExecResult, error) {
	if node == nil {
		return nil, fmt.Errorf("node is required for SSH execution")
	}

	client, err := e.connect(node)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to SSH node: %w", err)
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return nil, fmt.Errorf("failed to create SSH session: %w", err)
	}
	defer session.Close()

	cmdStr := task.Command
	if task.Script != "" {
		cmdStr = task.Script
	}

	if cmdStr == "" {
		return nil, fmt.Errorf("no command or script specified for task: %s", task.Name)
	}

	for k, v := range task.Env {
		if err := session.Setenv(k, v); err != nil {
			return nil, fmt.Errorf("failed to set env %s: %w", k, err)
		}
	}

	var stdoutBuf, stderrBuf bytes.Buffer
	session.Stdout = &stdoutBuf
	session.Stderr = &stderrBuf

	errChan := make(chan error, 1)
	go func() {
		errChan <- session.Run(cmdStr)
	}()

	select {
	case <-ctx.Done():
		session.Signal(ssh.SIGKILL)
		return nil, fmt.Errorf("command timed out")
	case err := <-errChan:
		result := &scheduler.ExecResult{
			Stdout: strings.TrimSpace(stdoutBuf.String()),
			Stderr: strings.TrimSpace(stderrBuf.String()),
		}

		if err != nil {
			return result, err
		}

		return result, nil
	}
}

func (e *SSHExecutor) connect(node *dsl.Node) (*ssh.Client, error) {
	var auth []ssh.AuthMethod

	if node.Password != "" {
		auth = append(auth, ssh.Password(node.Password))
	}

	if node.KeyFile != "" {
		key, err := ioutil.ReadFile(node.KeyFile)
		if err != nil {
			return nil, fmt.Errorf("failed to read key file: %w", err)
		}

		signer, err := ssh.ParsePrivateKey(key)
		if err != nil {
			return nil, fmt.Errorf("failed to parse private key: %w", err)
		}

		auth = append(auth, ssh.PublicKeys(signer))
	}

	if len(auth) == 0 {
		return nil, fmt.Errorf("no authentication method specified for node: %s", node.Name)
	}

	port := node.Port
	if port == 0 {
		port = 22
	}

	config := &ssh.ClientConfig{
		User:            node.User,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	addr := fmt.Sprintf("%s:%d", node.Host, port)

	conn, err := net.DialTimeout("tcp", addr, config.Timeout)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to %s: %w", addr, err)
	}

	hostConn, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("SSH handshake failed: %w", err)
	}

	return ssh.NewClient(hostConn, chans, reqs), nil
}
