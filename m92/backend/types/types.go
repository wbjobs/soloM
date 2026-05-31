package types

type SyscallEvent struct {
	PID         uint32 `json:"pid"`
	TGID        uint32 `json:"tgid"`
	Timestamp   uint64 `json:"timestamp"`
	Comm        string `json:"comm"`
	SyscallID   uint32 `json:"syscallId"`
	SyscallName string `json:"syscallName"`
	Filename    string `json:"filename"`
	Argv        string `json:"argv"`
}

type FlameNode struct {
	Name     string      `json:"name"`
	Value    int64       `json:"value"`
	Children []FlameNode `json:"children,omitempty"`
}

type HeatmapData struct {
	PID      uint32 `json:"pid"`
	Process  string `json:"process"`
	Syscall  string `json:"syscall"`
	Count    int64  `json:"count"`
	LastSeen uint64 `json:"lastSeen"`
}

type SyscallStats struct {
	Process   string           `json:"process"`
	PID       uint32           `json:"pid"`
	Syscalls  map[string]int64 `json:"syscalls"`
	Total     int64            `json:"total"`
	LastEvent *SyscallEvent    `json:"lastEvent"`
}

type TimeSeriesPoint struct {
	Timestamp int64  `json:"timestamp"`
	Syscall   string `json:"syscall"`
	Count     int64  `json:"count"`
}

type AlertLevel string

const (
	AlertLevelInfo    AlertLevel = "info"
	AlertLevelWarning AlertLevel = "warning"
	AlertLevelError   AlertLevel = "error"
	AlertLevelCritical AlertLevel = "critical"
)

type Alert struct {
	ID        string      `json:"id"`
	Level     AlertLevel  `json:"level"`
	Title     string      `json:"title"`
	Message   string      `json:"message"`
	RuleName  string      `json:"ruleName"`
	Event     *SyscallEvent `json:"event,omitempty"`
	Timestamp int64       `json:"timestamp"`
}

type RuleMatch struct {
	Matched bool
	Alert   *Alert
}
