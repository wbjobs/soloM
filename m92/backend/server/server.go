package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"ebpf-syscall-monitor/ebpf"
	"ebpf-syscall-monitor/rules"
	"ebpf-syscall-monitor/storage"
	"ebpf-syscall-monitor/types"
)

const (
	defaultEventBufferSize = 100000
	maxStatsProcesses      = 500
	maxFlameNodes          = 200
	maxHeatmapProcesses    = 50
	cleanupInterval        = 10 * time.Second
	processExpireTime      = 30 * time.Second
	batchSize              = 100
	maxHistorySeconds      = 300
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  64 * 1024,
	WriteBufferSize: 64 * 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type sseClient struct {
	conn    http.ResponseWriter
	flusher http.Flusher
	ctx     context.Context
}

type MonitorServer struct {
	bpfCtx       *ebpf.BpfContext
	store        *storage.SQLiteStore
	ruleEngine   *rules.RuleEngine
	clients      map[*websocket.Conn]bool
	clientsMu    sync.Mutex
	sseClients   map[*sseClient]bool
	sseMu        sync.Mutex
	eventChan    chan *types.SyscallEvent
	stats        map[uint32]*types.SyscallStats
	statsMu      sync.RWMutex
	useMock      bool
	processList  []string
	syscallList  []string
	sensitiveFiles []string

	eventsReceived  atomic.Int64
	eventsDropped   atomic.Int64
	eventsProcessed atomic.Int64
	ringbufDropped  atomic.Int64
	alertsTriggered atomic.Int64

	stopChan chan struct{}
	wg       sync.WaitGroup
}

func NewMonitorServer(useMock bool, dbPath string) (*MonitorServer, error) {
	var store *storage.SQLiteStore
	var err error

	if dbPath != "" {
		store, err = storage.NewSQLiteStore(dbPath, maxHistorySeconds)
		if err != nil {
			log.Printf("Warning: Failed to open SQLite, running without persistence: %v", err)
		}
	}

	s := &MonitorServer{
		clients:     make(map[*websocket.Conn]bool),
		sseClients:  make(map[*sseClient]bool),
		eventChan:   make(chan *types.SyscallEvent, defaultEventBufferSize),
		stats:       make(map[uint32]*types.SyscallStats),
		useMock:     useMock,
		store:       store,
		ruleEngine:  rules.NewRuleEngine(1000),
		processList: []string{"bash", "nginx", "node", "python3", "java", "mysql", "redis-server", "docker", "kubectl", "systemd", "sshd", "chrome", "firefox", "code", "go"},
		syscallList: []string{"openat", "execve"},
		sensitiveFiles: []string{
			"/etc/shadow",
			"/etc/passwd",
			"/etc/sudoers",
		},
		stopChan: make(chan struct{}),
	}

	return s, nil
}

func (s *MonitorServer) Start() error {
	if !s.useMock {
		bpfCtx, err := ebpf.LoadBPF()
		if err != nil {
			log.Printf("Warning: Failed to load BPF, falling back to mock mode: %v", err)
			s.useMock = true
		} else {
			s.bpfCtx = bpfCtx
			defer s.bpfCtx.Close()
			s.wg.Add(1)
			go s.readBPFLoopOptimized()
		}
	}

	if s.useMock {
		log.Println("Running in MOCK mode - generating simulated syscall data")
		s.wg.Add(1)
		go s.mockDataLoop()
	}

	for i := 0; i < 2; i++ {
		s.wg.Add(1)
		go s.processEventsWorker()
	}

	s.wg.Add(1)
	go s.cleanupLoop()

	s.wg.Add(1)
	go s.broadcastStats()

	s.wg.Add(1)
	go s.logStats()

	s.wg.Add(1)
	go s.alertBroadcastLoop()

	http.HandleFunc("/ws", s.handleWebSocket)
	http.HandleFunc("/sse/alerts", s.handleSSEAlerts)
	http.HandleFunc("/api/health", s.handleHealth)
	http.HandleFunc("/api/stats", s.handleStats)
	http.HandleFunc("/api/history", s.handleHistory)
	http.HandleFunc("/api/history/timeseries", s.handleTimeSeries)

	log.Println("Server starting on :8080")
	err := http.ListenAndServe(":8080", nil)

	close(s.stopChan)
	s.wg.Wait()

	if s.store != nil {
		s.store.Close()
	}
	s.ruleEngine.Close()

	return err
}

func (s *MonitorServer) readBPFLoopOptimized() {
	defer s.wg.Done()

	for {
		select {
		case <-s.stopChan:
			return
		default:
		}

		events, dropped, err := s.bpfCtx.ReadBatch(batchSize)
		if err != nil {
			log.Printf("Error reading BPF batch: %v", err)
			time.Sleep(10 * time.Millisecond)
			continue
		}

		s.ringbufDropped.Add(int64(dropped))

		for _, event := range events {
			select {
			case s.eventChan <- event:
				s.eventsReceived.Add(1)
			default:
				s.eventsDropped.Add(1)
			}
		}
	}
}

func (s *MonitorServer) mockDataLoop() {
	defer s.wg.Done()

	mockFiles := []string{
		"/etc/passwd", "/var/log/nginx/access.log", "/home/user/config.json",
		"/usr/bin/python3", "/bin/bash", "/usr/local/bin/docker",
		"/etc/hosts", "/var/lib/mysql/data/", "/proc/cpuinfo",
		"/dev/null", "/tmp/cache.tmp", "/opt/app/config.yaml",
		"/etc/shadow", "/etc/sudoers",
	}
	mockArgv := []string{
		"", "-l", "--config", "/etc/nginx.conf", "-p 8080",
		"--daemon", "-f", "/var/log/app.log", "-u root",
		"/usr/bin/sudo", "/bin/su",
	}

	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()

	batch := make([]*types.SyscallEvent, 0, batchSize)

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
		}

		for i := 0; i < 20; i++ {
			process := s.processList[rand.Intn(len(s.processList))]
			syscall := s.syscallList[rand.Intn(len(s.syscallList))]
			filename := mockFiles[rand.Intn(len(mockFiles))]
			argv := mockArgv[rand.Intn(len(mockArgv))]
			pid := uint32(1000 + rand.Intn(50000))

			event := &types.SyscallEvent{
				PID:         pid,
				TGID:        pid,
				Timestamp:   uint64(time.Now().UnixNano()),
				Comm:        process,
				SyscallID:   map[string]uint32{"openat": 257, "execve": 59}[syscall],
				SyscallName: syscall,
				Filename:    filename,
				Argv:        argv,
			}

			batch = append(batch, event)

			if len(batch) >= batchSize {
				for _, ev := range batch {
					select {
					case s.eventChan <- ev:
						s.eventsReceived.Add(1)
					default:
						s.eventsDropped.Add(1)
					}
				}
				batch = batch[:0]
			}
		}

		if len(batch) > 0 {
			for _, ev := range batch {
				select {
				case s.eventChan <- ev:
					s.eventsReceived.Add(1)
				default:
					s.eventsDropped.Add(1)
				}
			}
			batch = batch[:0]
		}
	}
}

func (s *MonitorServer) processEventsWorker() {
	defer s.wg.Done()

	for {
		select {
		case <-s.stopChan:
			return
		case event := <-s.eventChan:
			s.processSingleEvent(event)
			s.eventsProcessed.Add(1)
		}
	}
}

func (s *MonitorServer) processSingleEvent(event *types.SyscallEvent) {
	if s.store != nil {
		s.store.StoreEvent(event)
	}

	s.ruleEngine.ProcessEvent(event)

	s.statsMu.Lock()
	defer s.statsMu.Unlock()

	if len(s.stats) >= maxStatsProcesses {
		if _, exists := s.stats[event.PID]; !exists {
			var oldestPID uint32
			var oldestTime int64 = 1 << 62

			for pid, stats := range s.stats {
				if stats.LastEvent != nil {
					ts := int64(stats.LastEvent.Timestamp)
					if ts < oldestTime {
						oldestTime = ts
						oldestPID = pid
					}
				}
			}

			delete(s.stats, oldestPID)
		}
	}

	stats, exists := s.stats[event.PID]
	if !exists {
		stats = &types.SyscallStats{
			Process:  event.Comm,
			PID:      event.PID,
			Syscalls: make(map[string]int64, 4),
		}
		s.stats[event.PID] = stats
	}

	stats.Syscalls[event.SyscallName]++
	stats.Total++
	stats.LastEvent = event
}

func (s *MonitorServer) cleanupLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(cleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.cleanupExpired()
		}
	}
}

func (s *MonitorServer) cleanupExpired() {
	s.statsMu.Lock()
	defer s.statsMu.Unlock()

	now := time.Now().UnixNano()
	expireNano := int64(processExpireTime)

	for pid, stats := range s.stats {
		if stats.LastEvent != nil {
			if now-int64(stats.LastEvent.Timestamp) > expireNano {
				delete(s.stats, pid)
			}
		}
	}
}

func (s *MonitorServer) alertBroadcastLoop() {
	defer s.wg.Done()

	alertChan := s.ruleEngine.AlertChannel()

	for {
		select {
		case <-s.stopChan:
			return
		case alert, ok := <-alertChan:
			if !ok {
				return
			}
			s.alertsTriggered.Add(1)
			s.broadcastAlert(alert)
		}
	}
}

func (s *MonitorServer) broadcastAlert(alert *types.Alert) {
	data, err := json.Marshal(alert)
	if err != nil {
		log.Printf("Error marshaling alert: %v", err)
		return
	}

	sseMsg := fmt.Sprintf("event: alert\ndata: %s\n\n", string(data))

	s.sseMu.Lock()
	defer s.sseMu.Unlock()

	for client := range s.sseClients {
		select {
		case <-client.ctx.Done():
			delete(s.sseClients, client)
			continue
		default:
		}

		_, err := client.conn.Write([]byte(sseMsg))
		if err != nil {
			delete(s.sseClients, client)
			continue
		}
		client.flusher.Flush()
	}
}

func (s *MonitorServer) broadcastStats() {
	defer s.wg.Done()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
		}

		flameData := s.buildFlameGraphLimited()
		heatData := s.buildHeatmapLimited()

		message := map[string]interface{}{
			"type":      "update",
			"timestamp": time.Now().Unix(),
			"flame":     flameData,
			"heatmap":   heatData,
			"metrics": map[string]int64{
				"received":    s.eventsReceived.Load(),
				"processed":   s.eventsProcessed.Load(),
				"dropped":     s.eventsDropped.Load(),
				"ringbufLost": s.ringbufDropped.Load(),
				"alerts":      s.alertsTriggered.Load(),
			},
		}

		data, err := json.Marshal(message)
		if err != nil {
			log.Printf("Error marshaling stats: %v", err)
			continue
		}

		s.clientsMu.Lock()
		for client := range s.clients {
			select {
			case <-s.stopChan:
				s.clientsMu.Unlock()
				return
			default:
			}

			err := client.WriteMessage(websocket.TextMessage, data)
			if err != nil {
				log.Printf("WebSocket write error: %v", err)
				client.Close()
				delete(s.clients, client)
			}
		}
		s.clientsMu.Unlock()
	}
}

func (s *MonitorServer) logStats() {
	defer s.wg.Done()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopChan:
			return
		case <-ticker.C:
			s.statsMu.RLock()
			numProcesses := len(s.stats)
			s.statsMu.RUnlock()

			log.Printf(
				"Metrics: received=%d, processed=%d, chan_dropped=%d, ringbuf_lost=%d, alerts=%d, processes=%d, chan_size=%d",
				s.eventsReceived.Load(),
				s.eventsProcessed.Load(),
				s.eventsDropped.Load(),
				s.ringbufDropped.Load(),
				s.alertsTriggered.Load(),
				numProcesses,
				len(s.eventChan),
			)
		}
	}
}

type processWithTotal struct {
	pid     uint32
	process string
	total   int64
}

func (s *MonitorServer) getTopProcesses(limit int) []processWithTotal {
	s.statsMu.RLock()
	defer s.statsMu.RUnlock()

	processes := make([]processWithTotal, 0, len(s.stats))
	for pid, stats := range s.stats {
		processes = append(processes, processWithTotal{
			pid:     pid,
			process: stats.Process,
			total:   stats.Total,
		})
	}

	sort.Slice(processes, func(i, j int) bool {
		return processes[i].total > processes[j].total
	})

	if len(processes) > limit {
		processes = processes[:limit]
	}

	return processes
}

func (s *MonitorServer) buildFlameGraphLimited() *types.FlameNode {
	topProcesses := s.getTopProcesses(maxFlameNodes)

	root := &types.FlameNode{
		Name:     "root",
		Children: make([]types.FlameNode, 0, len(topProcesses)),
	}

	processMap := make(map[string]*types.FlameNode)

	s.statsMu.RLock()
	for _, pt := range topProcesses {
		stats := s.stats[pt.pid]
		if stats == nil {
			continue
		}

		processNode, exists := processMap[stats.Process]
		if !exists {
			processNode = &types.FlameNode{
				Name:     stats.Process,
				Children: make([]types.FlameNode, 0, 4),
			}
			processMap[stats.Process] = processNode
		}

		pidStr := strconv.Itoa(int(pt.pid))

		pidNode := types.FlameNode{
			Name:     pidStr,
			Value:    stats.Total,
			Children: make([]types.FlameNode, 0, len(stats.Syscalls)),
		}

		for syscall, count := range stats.Syscalls {
			pidNode.Children = append(pidNode.Children, types.FlameNode{
				Name:  syscall,
				Value: count,
			})
		}

		processNode.Children = append(processNode.Children, pidNode)
		processNode.Value += stats.Total
		root.Value += stats.Total
	}
	s.statsMu.RUnlock()

	for _, node := range processMap {
		sort.Slice(node.Children, func(i, j int) bool {
			return node.Children[i].Value > node.Children[j].Value
		})
		root.Children = append(root.Children, *node)
	}

	sort.Slice(root.Children, func(i, j int) bool {
		return root.Children[i].Value > root.Children[j].Value
	})

	return root
}

func (s *MonitorServer) buildHeatmapLimited() []types.HeatmapData {
	topProcesses := s.getTopProcesses(maxHeatmapProcesses)

	data := make([]types.HeatmapData, 0, len(topProcesses)*2)

	s.statsMu.RLock()
	for _, pt := range topProcesses {
		stats := s.stats[pt.pid]
		if stats == nil {
			continue
		}

		for syscall, count := range stats.Syscalls {
			data = append(data, types.HeatmapData{
				PID:      pt.pid,
				Process:  stats.Process,
				Syscall:  syscall,
				Count:    count,
				LastSeen: stats.LastEvent.Timestamp,
			})
		}
	}
	s.statsMu.RUnlock()

	return data
}

func (s *MonitorServer) handleSSEAlerts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	client := &sseClient{
		conn:    w,
		flusher: flusher,
		ctx:     r.Context(),
	}

	s.sseMu.Lock()
	s.sseClients[client] = true
	s.sseMu.Unlock()

	log.Printf("New SSE client connected for alerts, total: %d", len(s.sseClients))

	defer func() {
		s.sseMu.Lock()
		delete(s.sseClients, client)
		s.sseMu.Unlock()
		log.Printf("SSE client disconnected, total: %d", len(s.sseClients))
	}()

	_, err := w.Write([]byte(": ping\n\n"))
	if err != nil {
		return
	}
	flusher.Flush()

	<-r.Context().Done()
}

func (s *MonitorServer) handleHistory(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		http.Error(w, "History storage not available", http.StatusServiceUnavailable)
		return
	}

	query := r.URL.Query()
	startStr := query.Get("start")
	endStr := query.Get("end")

	var startNano, endNano int64
	now := time.Now().UnixNano()

	if startStr == "" {
		startNano = now - 5*60*1e9
	} else {
		startSec, err := strconv.ParseInt(startStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid start time", http.StatusBadRequest)
			return
		}
		startNano = startSec * 1e9
	}

	if endStr == "" {
		endNano = now
	} else {
		endSec, err := strconv.ParseInt(endStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid end time", http.StatusBadRequest)
			return
		}
		endNano = endSec * 1e9
	}

	if endNano-startNano > 10*60*1e9 {
		endNano = startNano + 10*60*1e9
	}

	events, err := s.store.QueryEvents(r.Context(), startNano, endNano)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"start":    startNano / 1e9,
		"end":      endNano / 1e9,
		"count":    len(events),
		"events":   events,
	})
}

func (s *MonitorServer) handleTimeSeries(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		http.Error(w, "History storage not available", http.StatusServiceUnavailable)
		return
	}

	query := r.URL.Query()
	startStr := query.Get("start")
	endStr := query.Get("end")
	resolutionStr := query.Get("resolution")

	var startNano, endNano int64
	now := time.Now().UnixNano()

	if startStr == "" {
		startNano = now - 5*60*1e9
	} else {
		startSec, err := strconv.ParseInt(startStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid start time", http.StatusBadRequest)
			return
		}
		startNano = startSec * 1e9
	}

	if endStr == "" {
		endNano = now
	} else {
		endSec, err := strconv.ParseInt(endStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid end time", http.StatusBadRequest)
			return
		}
		endNano = endSec * 1e9
	}

	resolution := 1
	if resolutionStr != "" {
		r, err := strconv.Atoi(resolutionStr)
		if err == nil && r > 0 {
			resolution = r
		}
	}

	points, err := s.store.QueryStats(r.Context(), startNano, endNano, resolution)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"start":      startNano / 1e9,
		"end":        endNano / 1e9,
		"resolution": resolution,
		"points":     points,
	})
}

func (s *MonitorServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	s.clientsMu.Lock()
	s.clients[conn] = true
	s.clientsMu.Unlock()

	log.Printf("New WebSocket client connected, total: %d", len(s.clients))

	defer func() {
		s.clientsMu.Lock()
		delete(s.clients, conn)
		s.clientsMu.Unlock()
		conn.Close()
		log.Printf("WebSocket client disconnected, total: %d", len(s.clients))
	}()

	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		select {
		case <-s.stopChan:
			return
		default:
		}

		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (s *MonitorServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	s.statsMu.RLock()
	numProcesses := len(s.stats)
	s.statsMu.RUnlock()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"mockMode":  s.useMock,
		"clients":   len(s.clients),
		"processes": numProcesses,
		"hasStore":  s.store != nil,
		"metrics": map[string]int64{
			"received":    s.eventsReceived.Load(),
			"processed":   s.eventsProcessed.Load(),
			"dropped":     s.eventsDropped.Load(),
			"ringbufLost": s.ringbufDropped.Load(),
			"alerts":      s.alertsTriggered.Load(),
			"chanSize":    int64(len(s.eventChan)),
			"chanCap":     int64(cap(s.eventChan)),
		},
	})
}

func (s *MonitorServer) handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	s.statsMu.RLock()
	defer s.statsMu.RUnlock()
	json.NewEncoder(w).Encode(s.stats)
}
