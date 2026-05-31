package scheduler

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"flowcli/pkg/dsl"
)

type TaskStatus string

const (
	StatusPending   TaskStatus = "pending"
	StatusRunning   TaskStatus = "running"
	StatusCompleted TaskStatus = "completed"
	StatusFailed    TaskStatus = "failed"
	StatusSkipped   TaskStatus = "skipped"
	StatusPaused    TaskStatus = "paused"
	StatusCancelled TaskStatus = "cancelled"
)

type TaskResult struct {
	TaskName    string
	Status      TaskStatus
	Stdout      string
	Stderr      string
	Error       error
	StartTime   time.Time
	EndTime     time.Time
	Attempts    int
}

type ExecResult struct {
	Stdout string
	Stderr string
}

type Executor interface {
	Execute(ctx context.Context, task *dsl.Task, node *dsl.Node) (*ExecResult, error)
}

type LogEntry struct {
	Timestamp time.Time
	Level     string
	Message   string
	TaskName  string
}

type SchedulerUpdate struct {
	Type      string
	TaskName  string
	Status    TaskStatus
	Result    *TaskResult
	LogEntry  *LogEntry
	Timestamp time.Time
}

type Scheduler struct {
	config        *dsl.Config
	executor      Executor
	taskStatus    map[string]TaskStatus
	taskResult    map[string]*TaskResult
	mu            sync.RWMutex
	wg            sync.WaitGroup
	maxWorkers    int
	updateChan    chan SchedulerUpdate
	pauseChan     chan struct{}
	resumeChan    chan struct{}
	cancelCtx     context.Context
	cancelFunc    context.CancelFunc
	isPaused      bool
	isCancelled   bool
	isRunning     bool
	chanClosed    bool
	taskContexts  map[string]context.CancelFunc
}

func NewScheduler(config *dsl.Config, executor Executor, maxWorkers int) *Scheduler {
	if maxWorkers <= 0 {
		maxWorkers = 4
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &Scheduler{
		config:       config,
		executor:     executor,
		taskStatus:   make(map[string]TaskStatus),
		taskResult:   make(map[string]*TaskResult),
		maxWorkers:   maxWorkers,
		updateChan:   make(chan SchedulerUpdate, 100),
		pauseChan:    make(chan struct{}),
		resumeChan:   make(chan struct{}),
		cancelCtx:    ctx,
		cancelFunc:   cancel,
		taskContexts: make(map[string]context.CancelFunc),
	}
}

func (s *Scheduler) GetUpdateChan() <-chan SchedulerUpdate {
	return s.updateChan
}

func (s *Scheduler) Pause() {
	s.mu.Lock()
	if !s.isPaused && !s.isCancelled {
		s.isPaused = true
		close(s.pauseChan)
		s.pauseChan = make(chan struct{})
		s.sendUpdate(SchedulerUpdate{
			Type:      "pause",
			Timestamp: time.Now(),
		})
		s.log("workflow paused", "")
	}
	s.mu.Unlock()
}

func (s *Scheduler) Resume() {
	s.mu.Lock()
	if s.isPaused && !s.isCancelled {
		s.isPaused = false
		close(s.resumeChan)
		s.resumeChan = make(chan struct{})
		s.sendUpdate(SchedulerUpdate{
			Type:      "resume",
			Timestamp: time.Now(),
		})
		s.log("workflow resumed", "")
	}
	s.mu.Unlock()
}

func (s *Scheduler) Cancel() {
	s.mu.Lock()
	if !s.isCancelled {
		s.isCancelled = true
		s.cancelFunc()
		for _, cancel := range s.taskContexts {
			cancel()
		}
		s.sendUpdate(SchedulerUpdate{
			Type:      "cancel",
			Timestamp: time.Now(),
		})
		s.log("workflow cancelled", "")
	}
	s.mu.Unlock()
}

func (s *Scheduler) IsPaused() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isPaused
}

func (s *Scheduler) IsCancelled() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isCancelled
}

func (s *Scheduler) sendUpdate(update SchedulerUpdate) {
	s.mu.RLock()
	closed := s.chanClosed
	s.mu.RUnlock()
	if closed {
		return
	}
	select {
	case s.updateChan <- update:
	default:
	}
}

func (s *Scheduler) log(message, taskName string) {
	entry := &LogEntry{
		Timestamp: time.Now(),
		Level:     "INFO",
		Message:   message,
		TaskName:  taskName,
	}
	s.sendUpdate(SchedulerUpdate{
		Type:      "log",
		TaskName:  taskName,
		LogEntry:  entry,
		Timestamp: entry.Timestamp,
	})
	log.Printf("[%s] %s", taskName, message)
}

func (s *Scheduler) Run() error {
	s.log(fmt.Sprintf("Starting workflow: %s", s.config.Workflow.Name), "")
	
	for _, task := range s.config.Workflow.Tasks {
		s.taskStatus[task.Name] = StatusPending
		s.sendUpdate(SchedulerUpdate{
			Type:      "status",
			TaskName:  task.Name,
			Status:    StatusPending,
			Timestamp: time.Now(),
		})
	}

	taskChan := make(chan *dsl.Task, s.maxWorkers)

	for i := 0; i < s.maxWorkers; i++ {
		go s.worker(taskChan)
	}

	s.wg.Add(len(s.config.Workflow.Tasks))

	go s.dispatchTasks(taskChan)

	doneChan := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(doneChan)
	}()

	select {
	case <-doneChan:
	case <-s.cancelCtx.Done():
		s.mu.Lock()
		for name, status := range s.taskStatus {
			if status == StatusRunning || status == StatusPending {
				s.taskStatus[name] = StatusCancelled
				s.sendUpdate(SchedulerUpdate{
					Type:      "status",
					TaskName:  name,
					Status:    StatusCancelled,
					Timestamp: time.Now(),
				})
			}
		}
		s.mu.Unlock()
	}

	close(taskChan)
	s.mu.Lock()
	s.chanClosed = true
	s.mu.Unlock()
	close(s.updateChan)

	return s.checkResults()
}

func (s *Scheduler) worker(taskChan <-chan *dsl.Task) {
	for task := range taskChan {
		if s.IsCancelled() {
			s.wg.Done()
			continue
		}

		s.waitIfPaused()

		if s.IsCancelled() {
			s.wg.Done()
			continue
		}

		s.executeTask(task)
		s.wg.Done()
	}
}

func (s *Scheduler) waitIfPaused() {
	s.mu.RLock()
	paused := s.isPaused
	resumeCh := s.resumeChan
	s.mu.RUnlock()

	if !paused {
		return
	}

	select {
	case <-resumeCh:
	case <-s.cancelCtx.Done():
	}
}

func (s *Scheduler) dispatchTasks(taskChan chan<- *dsl.Task) {
	dispatched := make(map[string]bool)
	totalTasks := len(s.config.Workflow.Tasks)

	for len(dispatched) < totalTasks && !s.IsCancelled() {
		s.waitIfPaused()
		if s.IsCancelled() {
			return
		}

		for i := range s.config.Workflow.Tasks {
			task := &s.config.Workflow.Tasks[i]
			if dispatched[task.Name] {
				continue
			}

			if s.dependenciesMet(task) {
				s.mu.Lock()
				s.taskStatus[task.Name] = StatusRunning
				dispatched[task.Name] = true
				s.mu.Unlock()

				s.sendUpdate(SchedulerUpdate{
					Type:      "status",
					TaskName:  task.Name,
					Status:    StatusRunning,
					Timestamp: time.Now(),
				})
				s.log(fmt.Sprintf("Executing task: %s", task.Name), task.Name)

				select {
				case taskChan <- task:
				case <-s.cancelCtx.Done():
					return
				}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func (s *Scheduler) dependenciesMet(task *dsl.Task) bool {
	for _, depName := range task.DependsOn {
		status := s.getStatus(depName)
		if status != StatusCompleted {
			return false
		}
	}
	return true
}

func (s *Scheduler) executeTask(task *dsl.Task) {
	result := &TaskResult{
		TaskName:  task.Name,
		StartTime: time.Now(),
		Status:    StatusRunning,
	}

	maxAttempts := 1
	if task.RetryPolicy.MaxAttempts > 0 {
		maxAttempts = task.RetryPolicy.MaxAttempts
	}

	var execResult *ExecResult
	var err error

	for attempt := 1; attempt <= maxAttempts && !s.IsCancelled(); attempt++ {
		s.waitIfPaused()
		if s.IsCancelled() {
			break
		}

		result.Attempts = attempt

		ctx, cancel := context.WithCancel(s.cancelCtx)
		s.mu.Lock()
		s.taskContexts[task.Name] = cancel
		s.mu.Unlock()

		if task.TimeoutDur > 0 {
			var timeoutCancel context.CancelFunc
			ctx, timeoutCancel = context.WithTimeout(ctx, task.TimeoutDur)
			defer timeoutCancel()
		}

		var node *dsl.Node
		if task.Node != "" {
			node = s.config.GetNode(task.Node)
		}

		execResult, err = s.executor.Execute(ctx, task, node)

		s.mu.Lock()
		delete(s.taskContexts, task.Name)
		s.mu.Unlock()
		cancel()

		if err == nil {
			break
		}

		if s.IsCancelled() {
			break
		}

		errMsg := err.Error()
		if execResult != nil {
			parts := []string{}
			if execResult.Stderr != "" {
				parts = append(parts, execResult.Stderr)
			}
			parts = append(parts, err.Error())
			errMsg = strings.Join(parts, " : ")
		}
		s.log(fmt.Sprintf("Task %s failed (attempt %d/%d): %v", task.Name, attempt, maxAttempts, errMsg), task.Name)

		if attempt < maxAttempts && task.RetryPolicy.DelayDur > 0 && !s.IsCancelled() {
			select {
			case <-time.After(task.RetryPolicy.DelayDur):
			case <-s.cancelCtx.Done():
			}
		}
	}

	result.EndTime = time.Now()
	if execResult != nil {
		result.Stdout = execResult.Stdout
		result.Stderr = execResult.Stderr
	}
	result.Error = err

	if s.IsCancelled() {
		result.Status = StatusCancelled
	} else if err != nil {
		result.Status = StatusFailed
		s.log(fmt.Sprintf("Task %s failed after %d attempts: %v", task.Name, result.Attempts, err), task.Name)
		s.markDependentsSkipped(task.Name)
	} else {
		result.Status = StatusCompleted
		s.log(fmt.Sprintf("Task %s completed successfully in %v", task.Name, result.EndTime.Sub(result.StartTime)), task.Name)
	}

	s.setResult(task.Name, result)
	s.setStatus(task.Name, result.Status)
	s.sendUpdate(SchedulerUpdate{
		Type:      "result",
		TaskName:  task.Name,
		Status:    result.Status,
		Result:    result,
		Timestamp: time.Now(),
	})
}

func (s *Scheduler) markDependentsSkipped(taskName string) {
	for _, task := range s.config.Workflow.Tasks {
		for _, dep := range task.DependsOn {
			if dep == taskName {
				status := s.getStatus(task.Name)
				if status == StatusPending || status == StatusRunning {
					s.setStatus(task.Name, StatusSkipped)
					s.sendUpdate(SchedulerUpdate{
						Type:      "status",
						TaskName:  task.Name,
						Status:    StatusSkipped,
						Timestamp: time.Now(),
					})
					s.log(fmt.Sprintf("Task %s skipped due to dependency failure: %s", task.Name, taskName), task.Name)
					s.markDependentsSkipped(task.Name)
				}
			}
		}
	}
}

func (s *Scheduler) checkResults() error {
	if s.IsCancelled() {
		return fmt.Errorf("workflow cancelled")
	}

	var failedTasks []string

	for name, result := range s.taskResult {
		if result.Status == StatusFailed {
			failedTasks = append(failedTasks, name)
		}
	}

	if len(failedTasks) > 0 {
		return fmt.Errorf("%d tasks failed: %v", len(failedTasks), failedTasks)
	}

	s.log("Workflow completed successfully", "")
	return nil
}

func (s *Scheduler) setStatus(taskName string, status TaskStatus) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.taskStatus[taskName] = status
}

func (s *Scheduler) getStatus(taskName string) TaskStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.taskStatus[taskName]
}

func (s *Scheduler) setResult(taskName string, result *TaskResult) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.taskResult[taskName] = result
}

func (s *Scheduler) GetResults() map[string]*TaskResult {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.taskResult
}

func (s *Scheduler) GetTaskStatus(taskName string) TaskStatus {
	return s.getStatus(taskName)
}

func (s *Scheduler) GetAllStatuses() map[string]TaskStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	statuses := make(map[string]TaskStatus)
	for k, v := range s.taskStatus {
		statuses[k] = v
	}
	return statuses
}

func (s *Scheduler) CheckResults() error {
	return s.checkResults()
}
