package rules

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"ebpf-syscall-monitor/types"
)

type Rule interface {
	Name() string
	Check(event *types.SyscallEvent) *types.Alert
}

type RuleEngine struct {
	rules        []Rule
	alertChan    chan *types.Alert
	recentAlerts map[string]int64
	alertMutex   sync.Mutex
	alertDedup   int64
}

func NewRuleEngine(alertBufferSize int) *RuleEngine {
	if alertBufferSize <= 0 {
		alertBufferSize = 100
	}

	re := &RuleEngine{
		rules:        make([]Rule, 0),
		alertChan:    make(chan *types.Alert, alertBufferSize),
		recentAlerts: make(map[string]int64),
		alertDedup:   30,
	}

	re.registerDefaultRules()
	go re.cleanupLoop()

	return re
}

func (re *RuleEngine) registerDefaultRules() {
	re.AddRule(&SensitiveFileAccessRule{
		sensitiveFiles: []string{
			"/etc/shadow",
			"/etc/passwd",
			"/etc/sudoers",
			"/etc/ssh/sshd_config",
			"/root/.ssh/id_rsa",
			"/root/.bash_history",
		},
	})

	re.AddRule(&NonRootSensitiveAccessRule{
		sensitiveFiles: []string{
			"/etc/shadow",
			"/etc/sudoers",
			"/etc/ssh/sshd_config",
		},
	})

	re.AddRule(&PrivilegeEscalationRule{})
}

func (re *RuleEngine) AddRule(rule Rule) {
	re.rules = append(re.rules, rule)
}

func (re *RuleEngine) ProcessEvent(event *types.SyscallEvent) {
	for _, rule := range re.rules {
		if alert := rule.Check(event); alert != nil {
			re.processAlert(alert)
		}
	}
}

func (re *RuleEngine) processAlert(alert *types.Alert) {
	alert.Timestamp = time.Now().Unix()

	dedupKey := fmt.Sprintf("%s:%d:%s", alert.RuleName, alert.Event.PID, alert.Event.Filename)

	re.alertMutex.Lock()
	lastAlert, exists := re.recentAlerts[dedupKey]
	if exists && time.Now().Unix()-lastAlert < re.alertDedup {
		re.alertMutex.Unlock()
		return
	}
	re.recentAlerts[dedupKey] = alert.Timestamp
	re.alertMutex.Unlock()

	select {
	case re.alertChan <- alert:
	default:
	}
}

func (re *RuleEngine) AlertChannel() <-chan *types.Alert {
	return re.alertChan
}

func (re *RuleEngine) cleanupLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		cutoff := time.Now().Unix() - re.alertDedup*2
		re.alertMutex.Lock()
		for key, ts := range re.recentAlerts {
			if ts < cutoff {
				delete(re.recentAlerts, key)
			}
		}
		re.alertMutex.Unlock()
	}
}

func (re *RuleEngine) Close() {
	close(re.alertChan)
}

type SensitiveFileAccessRule struct {
	sensitiveFiles []string
}

func (r *SensitiveFileAccessRule) Name() string {
	return "sensitive_file_access"
}

func (r *SensitiveFileAccessRule) Check(event *types.SyscallEvent) *types.Alert {
	if event.SyscallName != "openat" {
		return nil
	}

	for _, sensitive := range r.sensitiveFiles {
		if strings.HasPrefix(event.Filename, sensitive) {
			return &types.Alert{
				Level:    types.AlertLevelWarning,
				Title:    "敏感文件访问",
				Message:  fmt.Sprintf("进程 %s (PID: %d) 尝试访问敏感文件: %s", event.Comm, event.PID, event.Filename),
				RuleName: r.Name(),
				Event:    event,
			}
		}
	}

	return nil
}

type NonRootSensitiveAccessRule struct {
	sensitiveFiles []string
}

func (r *NonRootSensitiveAccessRule) Name() string {
	return "non_root_sensitive_access"
}

func (r *NonRootSensitiveAccessRule) Check(event *types.SyscallEvent) *types.Alert {
	if event.SyscallName != "openat" {
		return nil
	}

	if event.PID == 0 || event.TGID == 0 {
		return nil
	}

	isRoot := (event.PID == 0 || event.TGID == 0)

	if isRoot {
		return nil
	}

	for _, sensitive := range r.sensitiveFiles {
		if strings.HasPrefix(event.Filename, sensitive) {
			return &types.Alert{
				Level:    types.AlertLevelCritical,
				Title:    "非 Root 用户访问敏感文件",
				Message:  fmt.Sprintf("非 Root 进程 %s (PID: %d) 尝试访问受限文件: %s", event.Comm, event.PID, event.Filename),
				RuleName: r.Name(),
				Event:    event,
			}
		}
	}

	return nil
}

type PrivilegeEscalationRule struct{}

func (r *PrivilegeEscalationRule) Name() string {
	return "privilege_escalation"
}

func (r *PrivilegeEscalationRule) Check(event *types.SyscallEvent) *types.Alert {
	if event.SyscallName != "execve" {
		return nil
	}

	privilegedBinaries := []string{
		"/usr/bin/sudo",
		"/usr/bin/su",
		"/bin/su",
		"/usr/bin/pkexec",
	}

	for _, bin := range privilegedBinaries {
		if strings.HasSuffix(event.Filename, bin) || strings.Contains(event.Argv, bin) {
			return &types.Alert{
				Level:    types.AlertLevelInfo,
				Title:    "权限提升尝试",
				Message:  fmt.Sprintf("进程 %s (PID: %d) 执行权限提升命令: %s %s", event.Comm, event.PID, event.Filename, event.Argv),
				RuleName: r.Name(),
				Event:    event,
			}
		}
	}

	return nil
}
