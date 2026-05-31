package main

import (
	"fmt"
	"os"
	"path/filepath"
	"text/tabwriter"

	"flowcli/pkg/dsl"
	"flowcli/pkg/executor"
	"flowcli/pkg/scheduler"
	"flowcli/pkg/tui"

	"github.com/spf13/cobra"
)

var (
	workflowFile string
	maxWorkers   int
	verbose      bool
	useTUI       bool
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "flowcli",
		Short: "FlowCLI - DSL-based workflow orchestration tool",
		Long:  "FlowCLI is a command-line workflow orchestration tool that executes tasks defined in YAML DSL files with support for local multi-threaded and remote SSH execution.",
	}

	rootCmd.PersistentFlags().StringVarP(&workflowFile, "file", "f", "", "Workflow YAML file (required)")
	rootCmd.PersistentFlags().IntVarP(&maxWorkers, "workers", "w", 4, "Maximum number of concurrent workers")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose output")
	rootCmd.PersistentFlags().BoolVar(&useTUI, "tui", false, "Enable interactive terminal UI")

	runCmd := &cobra.Command{
		Use:   "run",
		Short: "Run a workflow",
		Long:  "Execute the workflow defined in the YAML file",
		RunE:  runWorkflow,
	}

	validateCmd := &cobra.Command{
		Use:   "validate",
		Short: "Validate a workflow file",
		Long:  "Validate the workflow YAML file syntax and configuration",
		RunE:  validateWorkflow,
	}

	listCmd := &cobra.Command{
		Use:   "list",
		Short: "List tasks in workflow",
		Long:  "Display all tasks and their dependencies",
		RunE:  listTasks,
	}

	rootCmd.AddCommand(runCmd, validateCmd, listCmd)

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runWorkflow(cmd *cobra.Command, args []string) error {
	if workflowFile == "" {
		return fmt.Errorf("workflow file is required (use -f flag)")
	}

	config, err := dsl.ParseWorkflowFile(workflowFile)
	if err != nil {
		return fmt.Errorf("failed to parse workflow: %w", err)
	}

	exec := executor.NewHybridExecutor()
	sched := scheduler.NewScheduler(config, exec, maxWorkers)

	if useTUI {
		sched, err = tui.Run(config, sched)
		if err != nil {
			printResults(sched.GetResults())
			return err
		}
		printResults(sched.GetResults())
		return sched.CheckResults()
	}

	if err := sched.Run(); err != nil {
		printResults(sched.GetResults())
		return err
	}

	printResults(sched.GetResults())
	return nil
}

func validateWorkflow(cmd *cobra.Command, args []string) error {
	if workflowFile == "" {
		return fmt.Errorf("workflow file is required (use -f flag)")
	}

	_, err := dsl.ParseWorkflowFile(workflowFile)
	if err != nil {
		return fmt.Errorf("validation failed: %w", err)
	}

	fmt.Printf("✓ Workflow file '%s' is valid\n", filepath.Base(workflowFile))
	return nil
}

func listTasks(cmd *cobra.Command, args []string) error {
	if workflowFile == "" {
		return fmt.Errorf("workflow file is required (use -f flag)")
	}

	config, err := dsl.ParseWorkflowFile(workflowFile)
	if err != nil {
		return fmt.Errorf("failed to parse workflow: %w", err)
	}

	fmt.Printf("Workflow: %s (%s)\n", config.Workflow.Name, config.Workflow.Version)
	if config.Workflow.Description != "" {
		fmt.Printf("Description: %s\n", config.Workflow.Description)
	}
	fmt.Println()

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
	fmt.Fprintln(w, "TASK\tEXECUTOR\tNODE\tDEPENDENCIES")
	fmt.Fprintln(w, "----\t--------\t----\t------------")

	for _, task := range config.Workflow.Tasks {
		deps := "none"
		if len(task.DependsOn) > 0 {
			deps = fmt.Sprintf("%v", task.DependsOn)
		}
		node := "-"
		if task.Node != "" {
			node = task.Node
		}
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\n", task.Name, task.Executor, node, deps)
	}

	w.Flush()

	if len(config.Nodes) > 0 {
		fmt.Println()
		fmt.Println("Nodes:")
		for _, node := range config.Nodes {
			fmt.Printf("  - %s (%s@%s:%d)\n", node.Name, node.User, node.Host, node.Port)
		}
	}

	return nil
}

func printResults(results map[string]*scheduler.TaskResult) {
	fmt.Println()
	fmt.Println("=== Task Results ===")
	fmt.Println()

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 3, ' ', 0)
	fmt.Fprintln(w, "TASK\tSTATUS\tATTEMPTS\tDURATION")
	fmt.Fprintln(w, "----\t------\t--------\t--------")

	for _, result := range results {
		duration := result.EndTime.Sub(result.StartTime)
		fmt.Fprintf(w, "%s\t%s\t%d\t%v\n", result.TaskName, result.Status, result.Attempts, duration)
	}

	w.Flush()
	fmt.Println()

	if verbose {
		for _, result := range results {
			if result.Stdout != "" {
				fmt.Printf("--- %s Stdout ---\n%s\n\n", result.TaskName, result.Stdout)
			}
			if result.Stderr != "" {
				fmt.Printf("--- %s Stderr ---\n%s\n\n", result.TaskName, result.Stderr)
			}
			if result.Error != nil {
				fmt.Printf("--- %s Error ---\n%v\n\n", result.TaskName, result.Error)
			}
		}
	}
}
