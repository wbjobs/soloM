package dsl

import (
	"fmt"
	"io/ioutil"
	"time"

	"gopkg.in/yaml.v2"
)

type Workflow struct {
	Name        string            `yaml:"name"`
	Description string            `yaml:"description"`
	Version     string            `yaml:"version"`
	Variables   map[string]string `yaml:"variables"`
	Tasks       []Task            `yaml:"tasks"`
}

type Task struct {
	Name         string   `yaml:"name"`
	Description  string   `yaml:"description"`
	DependsOn    []string `yaml:"depends_on"`
	Executor     string   `yaml:"executor"`
	Node         string   `yaml:"node"`
	Command      string   `yaml:"command"`
	Script       string   `yaml:"script"`
	RetryPolicy  RetryPolicy `yaml:"retry_policy"`
	Timeout      string   `yaml:"timeout"`
	TimeoutDur   time.Duration
	Env          map[string]string `yaml:"env"`
}

type RetryPolicy struct {
	MaxAttempts int    `yaml:"max_attempts"`
	Delay       string `yaml:"delay"`
	DelayDur    time.Duration
	Backoff     string `yaml:"backoff"`
}

type Node struct {
	Name     string `yaml:"name"`
	Type     string `yaml:"type"`
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
	KeyFile  string `yaml:"key_file"`
}

type Config struct {
	Workflow Workflow `yaml:"workflow"`
	Nodes    []Node   `yaml:"nodes"`
}

func ParseWorkflowFile(path string) (*Config, error) {
	data, err := ioutil.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read workflow file: %w", err)
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	if err := config.Validate(); err != nil {
		return nil, err
	}

	if err := config.ResolveDurations(); err != nil {
		return nil, err
	}

	return &config, nil
}

func (c *Config) Validate() error {
	if c.Workflow.Name == "" {
		return fmt.Errorf("workflow name is required")
	}

	if len(c.Workflow.Tasks) == 0 {
		return fmt.Errorf("at least one task is required")
	}

	taskNames := make(map[string]bool)
	for _, task := range c.Workflow.Tasks {
		if task.Name == "" {
			return fmt.Errorf("task name is required")
		}
		if taskNames[task.Name] {
			return fmt.Errorf("duplicate task name: %s", task.Name)
		}
		taskNames[task.Name] = true
	}

	for _, task := range c.Workflow.Tasks {
		for _, dep := range task.DependsOn {
			if !taskNames[dep] {
				return fmt.Errorf("task '%s' depends on unknown task '%s'", task.Name, dep)
			}
		}
	}

	if err := c.detectCycles(); err != nil {
		return err
	}

	nodeNames := make(map[string]bool)
	for _, node := range c.Nodes {
		if node.Name == "" {
			return fmt.Errorf("node name is required")
		}
		nodeNames[node.Name] = true
	}

	for _, task := range c.Workflow.Tasks {
		if task.Node != "" && !nodeNames[task.Node] {
			return fmt.Errorf("task '%s' references unknown node '%s'", task.Name, task.Node)
		}
		if task.Executor != "local" && task.Executor != "ssh" {
			return fmt.Errorf("task '%s' has invalid executor: %s (must be 'local' or 'ssh')", task.Name, task.Executor)
		}
		if task.Executor == "ssh" && task.Node == "" {
			return fmt.Errorf("task '%s' uses ssh executor but no node specified", task.Name)
		}
		if task.Command == "" && task.Script == "" {
			return fmt.Errorf("task '%s' must have either command or script", task.Name)
		}
	}

	return nil
}

func (c *Config) ResolveDurations() error {
	for i := range c.Workflow.Tasks {
		task := &c.Workflow.Tasks[i]

		if task.Timeout != "" {
			dur, err := time.ParseDuration(task.Timeout)
			if err != nil {
				return fmt.Errorf("invalid timeout for task '%s': %w", task.Name, err)
			}
			task.TimeoutDur = dur
		}

		if task.RetryPolicy.Delay != "" {
			dur, err := time.ParseDuration(task.RetryPolicy.Delay)
			if err != nil {
				return fmt.Errorf("invalid retry delay for task '%s': %w", task.Name, err)
			}
			task.RetryPolicy.DelayDur = dur
		}
	}
	return nil
}

func (c *Config) GetNode(name string) *Node {
	for i := range c.Nodes {
		if c.Nodes[i].Name == name {
			return &c.Nodes[i]
		}
	}
	return nil
}

func (c *Config) detectCycles() error {
	adj := make(map[string][]string)
	for _, task := range c.Workflow.Tasks {
		adj[task.Name] = task.DependsOn
	}

	visited := make(map[string]bool)
	inStack := make(map[string]bool)

	var findCycle func(name string, path []string) ([]string, bool)
	findCycle = func(name string, path []string) ([]string, bool) {
		visited[name] = true
		inStack[name] = true
		path = append(path, name)

		for _, dep := range adj[name] {
			if inStack[dep] {
				start := -1
				for i, n := range path {
					if n == dep {
						start = i
						break
					}
				}
				return path[start:], true
			}
			if !visited[dep] {
				if cycle, found := findCycle(dep, path); found {
					return cycle, true
				}
			}
		}

		inStack[name] = false
		return nil, false
	}

	for _, task := range c.Workflow.Tasks {
		if !visited[task.Name] {
			if cycle, found := findCycle(task.Name, nil); found {
				return fmt.Errorf("circular dependency detected: %v", cycle)
			}
		}
	}

	return nil
}
