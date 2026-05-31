package main

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/nats-io/nats.go"
	"gopkg.in/yaml.v3"
)

type Config struct {
	NATS struct {
		URL     string `yaml:"url"`
		Subject string `yaml:"subject"`
	} `yaml:"nats"`
	LogShipper struct {
		WatchDir        string `yaml:"watch_dir"`
		FilePattern     string `yaml:"file_pattern"`
		ScanInterval    int    `yaml:"scan_interval"`
		HealthCheckInt  int    `yaml:"health_check_interval"`
		ReopenMaxRetry  int    `yaml:"reopen_max_retry"`
	} `yaml:"log_shipper"`
}

type FileTracker struct {
	filename     string
	file         *os.File
	reader       *bufio.Reader
	fileIdentity string
	size         int64
	lastReadTime time.Time
	retryCount   int
	mu           sync.Mutex
	stopChan     chan struct{}
	stopped      bool
}

type LogShipper struct {
	config     *Config
	nc         *nats.Conn
	watcher    *fsnotify.Watcher
	trackers   map[string]*FileTracker
	trackersMu sync.Mutex
	hostname   string
}

type LogMessage struct {
	Timestamp string `json:"timestamp"`
	Hostname  string `json:"hostname"`
	Filename  string `json:"filename"`
	Message   string `json:"message"`
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	if config.LogShipper.HealthCheckInt == 0 {
		config.LogShipper.HealthCheckInt = 5
	}
	if config.LogShipper.ReopenMaxRetry == 0 {
		config.LogShipper.ReopenMaxRetry = 5
	}
	if config.LogShipper.ScanInterval == 0 {
		config.LogShipper.ScanInterval = 1
	}

	return &config, nil
}

func getFileIdentity(file *os.File) (string, error) {
	info, err := file.Stat()
	if err != nil {
		return "", err
	}
	return generateFileIdentity(info), nil
}

func getPathIdentity(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	return generateFileIdentity(info), nil
}

func generateFileIdentity(info os.FileInfo) string {
	return fmt.Sprintf("%d-%d-%s",
		info.Size(),
		info.ModTime().UnixNano(),
		info.Name(),
	)
}

func NewLogShipper(config *Config) (*LogShipper, error) {
	nc, err := nats.Connect(config.NATS.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NATS: %v", err)
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		nc.Close()
		return nil, fmt.Errorf("failed to create watcher: %v", err)
	}

	hostname, _ := os.Hostname()

	return &LogShipper{
		config:   config,
		nc:       nc,
		watcher:  watcher,
		trackers: make(map[string]*FileTracker),
		hostname: hostname,
	}, nil
}

func (ls *LogShipper) Close() {
	ls.trackersMu.Lock()
	for _, tracker := range ls.trackers {
		tracker.Stop()
	}
	ls.trackersMu.Unlock()
	ls.watcher.Close()
	ls.nc.Close()
}

func (ft *FileTracker) Stop() {
	ft.mu.Lock()
	defer ft.mu.Unlock()
	if !ft.stopped {
		ft.stopped = true
		close(ft.stopChan)
		if ft.file != nil {
			ft.file.Close()
			ft.file = nil
		}
	}
}

func (ft *FileTracker) isStopped() bool {
	ft.mu.Lock()
	defer ft.mu.Unlock()
	return ft.stopped
}

func (ft *FileTracker) openFile() error {
	ft.mu.Lock()
	defer ft.mu.Unlock()

	if ft.file != nil {
		ft.file.Close()
		ft.file = nil
	}

	file, err := os.Open(ft.filename)
	if err != nil {
		return err
	}

	identity, err := getFileIdentity(file)
	if err != nil {
		file.Close()
		return err
	}

	info, err := file.Stat()
	if err != nil {
		file.Close()
		return err
	}

	ft.file = file
	ft.reader = bufio.NewReaderSize(file, 1024*1024)
	ft.fileIdentity = identity
	ft.size = info.Size()
	ft.lastReadTime = time.Now()
	ft.retryCount = 0

	log.Printf("Opened file %s (identity: %s, size: %d bytes)", ft.filename, identity, ft.size)
	return nil
}

func (ft *FileTracker) readLines() ([]string, error) {
	ft.mu.Lock()
	defer ft.mu.Unlock()

	if ft.file == nil {
		return nil, fmt.Errorf("file not open")
	}

	var lines []string
	for {
		line, err := ft.reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				if len(line) > 0 {
					lines = append(lines, line)
				}
				break
			}
			return lines, err
		}
		line = line[:len(line)-1]
		if len(line) > 0 && line[len(line)-1] == '\r' {
			line = line[:len(line)-1]
		}
		lines = append(lines, line)
	}

	ft.lastReadTime = time.Now()
	return lines, nil
}

func (ft *FileTracker) checkAndReopen() (bool, error) {
	ft.mu.Lock()
	currentIdentity := ft.fileIdentity
	ft.mu.Unlock()

	actualIdentity, err := getPathIdentity(ft.filename)
	if err != nil {
		if os.IsNotExist(err) {
			return false, fmt.Errorf("file does not exist")
		}
		return false, err
	}

	if actualIdentity != currentIdentity {
		log.Printf("File %s identity changed (old: %s, new: %s), reopening...",
			ft.filename, currentIdentity, actualIdentity)

		if err := ft.openFile(); err != nil {
			return false, err
		}
		return true, nil
	}

	return false, nil
}

func (ls *LogShipper) publishMessage(filename, message string) error {
	msg := fmt.Sprintf("%s|%s|%s|%s",
		time.Now().Format(time.RFC3339),
		ls.hostname,
		filepath.Base(filename),
		message,
	)
	return ls.nc.Publish(ls.config.NATS.Subject, []byte(msg))
}

func (ls *LogShipper) trackFile(filename string) {
	ls.trackersMu.Lock()
	if _, exists := ls.trackers[filename]; exists {
		ls.trackersMu.Unlock()
		return
	}

	tracker := &FileTracker{
		filename: filename,
		stopChan: make(chan struct{}),
	}
	ls.trackers[filename] = tracker
	ls.trackersMu.Unlock()

	log.Printf("Started tracking file: %s", filename)

	if err := tracker.openFile(); err != nil {
		log.Printf("Initial open failed for %s: %v, will retry...", filename, err)
	}

	go ls.processFile(filename, tracker)
}

func (ls *LogShipper) processFile(filename string, tracker *FileTracker) {
	ticker := time.NewTicker(time.Duration(ls.config.LogShipper.ScanInterval) * time.Second)
	defer ticker.Stop()

	for {
		if tracker.isStopped() {
			log.Printf("Stopped processing file: %s", filename)
			return
		}

		select {
		case <-tracker.stopChan:
			return
		case <-ticker.C:
			ls.scanAndProcess(filename, tracker)
		}
	}
}

func (ls *LogShipper) scanAndProcess(filename string, tracker *FileTracker) {
	if tracker.file == nil {
		tracker.retryCount++
		if tracker.retryCount > ls.config.LogShipper.ReopenMaxRetry {
			log.Printf("Max retries exceeded for %s, removing tracker", filename)
			ls.removeTracker(filename)
			return
		}

		log.Printf("Attempting to reopen %s (retry %d/%d)",
			filename, tracker.retryCount, ls.config.LogShipper.ReopenMaxRetry)

		if err := tracker.openFile(); err != nil {
			log.Printf("Reopen failed for %s: %v", filename, err)
			return
		}
		log.Printf("Successfully reopened file: %s", filename)
	}

	reopened, err := tracker.checkAndReopen()
	if err != nil {
		log.Printf("Health check failed for %s: %v", filename, err)
		tracker.mu.Lock()
		if tracker.file != nil {
			tracker.file.Close()
			tracker.file = nil
		}
		tracker.mu.Unlock()
		return
	}
	if reopened {
		log.Printf("File %s was reopened due to inode change (logrotate detected)", filename)
	}

	lines, err := tracker.readLines()
	if err != nil {
		log.Printf("Error reading from %s: %v", filename, err)
		tracker.mu.Lock()
		if tracker.file != nil {
			tracker.file.Close()
			tracker.file = nil
		}
		tracker.mu.Unlock()
		return
	}

	for _, line := range lines {
		if err := ls.publishMessage(filename, line); err != nil {
			log.Printf("Failed to publish message from %s: %v", filename, err)
		}
	}
}

func (ls *LogShipper) removeTracker(filename string) {
	ls.trackersMu.Lock()
	if tracker, exists := ls.trackers[filename]; exists {
		tracker.Stop()
		delete(ls.trackers, filename)
	}
	ls.trackersMu.Unlock()
	log.Printf("Removed tracker for file: %s", filename)
}

func (ls *LogShipper) scanExistingFiles() error {
	pattern := filepath.Join(ls.config.LogShipper.WatchDir, ls.config.LogShipper.FilePattern)
	files, err := filepath.Glob(pattern)
	if err != nil {
		return err
	}

	for _, file := range files {
		ls.trackFile(file)
	}

	log.Printf("Scanned %d existing log files", len(files))
	return nil
}

func (ls *LogShipper) watchDirectory() error {
	if err := ls.watcher.Add(ls.config.LogShipper.WatchDir); err != nil {
		return err
	}

	log.Printf("Watching directory: %s", ls.config.LogShipper.WatchDir)

	go func() {
		for {
			select {
			case event, ok := <-ls.watcher.Events:
				if !ok {
					return
				}
				ls.handleFSNotifyEvent(event)
			case err, ok := <-ls.watcher.Errors:
				if !ok {
					return
				}
				log.Printf("Watcher error: %v", err)
			}
		}
	}()

	return nil
}

func (ls *LogShipper) handleFSNotifyEvent(event fsnotify.Event) {
	matched, err := filepath.Match(ls.config.LogShipper.FilePattern, filepath.Base(event.Name))
	if err != nil {
		return
	}

	if !matched {
		return
	}

	switch {
	case event.Op&fsnotify.Create == fsnotify.Create:
		log.Printf("New log file created: %s", event.Name)
		ls.trackFile(event.Name)

	case event.Op&fsnotify.Remove == fsnotify.Remove:
		log.Printf("Log file removed: %s", event.Name)
		ls.removeTracker(event.Name)

	case event.Op&fsnotify.Rename == fsnotify.Rename:
		log.Printf("Log file renamed: %s (likely logrotate)", event.Name)
		time.AfterFunc(500*time.Millisecond, func() {
			if _, err := os.Stat(event.Name); err == nil {
				log.Printf("New file exists after rename, reopening: %s", event.Name)
				ls.trackersMu.Lock()
				if tracker, exists := ls.trackers[event.Name]; exists {
					tracker.mu.Lock()
					if tracker.file != nil {
						tracker.file.Close()
						tracker.file = nil
					}
					tracker.mu.Unlock()
				}
				ls.trackersMu.Unlock()
				ls.trackFile(event.Name)
			}
		})

	case event.Op&fsnotify.Write == fsnotify.Write:
	}
}

func (ls *LogShipper) healthCheckLoop() {
	interval := time.Duration(ls.config.LogShipper.HealthCheckInt) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ls.runHealthCheck()
		}
	}
}

func (ls *LogShipper) runHealthCheck() {
	ls.trackersMu.Lock()
	trackers := make(map[string]*FileTracker)
	for k, v := range ls.trackers {
		trackers[k] = v
	}
	ls.trackersMu.Unlock()

	for filename, tracker := range trackers {
		if tracker.isStopped() {
			continue
		}

		if tracker.file == nil {
			continue
		}

		actualIdentity, err := getPathIdentity(filename)
		if err != nil {
			if os.IsNotExist(err) {
				log.Printf("File %s no longer exists, marking for reopen", filename)
				tracker.mu.Lock()
				if tracker.file != nil {
					tracker.file.Close()
					tracker.file = nil
				}
				tracker.mu.Unlock()
			}
			continue
		}

		tracker.mu.Lock()
		currentIdentity := tracker.fileIdentity
		tracker.mu.Unlock()

		if actualIdentity != currentIdentity {
			log.Printf("Health check: identity changed for %s (old: %s, new: %s)",
				filename, currentIdentity, actualIdentity)
			tracker.mu.Lock()
			if tracker.file != nil {
				tracker.file.Close()
				tracker.file = nil
			}
			tracker.mu.Unlock()
		}
	}
}

func main() {
	configPath := "../config/config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	config, err := loadConfig(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	shipper, err := NewLogShipper(config)
	if err != nil {
		log.Fatalf("Failed to create log shipper: %v", err)
	}
	defer shipper.Close()

	log.Println("Log Shipper starting...")
	log.Printf("NATS URL: %s", config.NATS.URL)
	log.Printf("NATS Subject: %s", config.NATS.Subject)
	log.Printf("Watch directory: %s", config.LogShipper.WatchDir)
	log.Printf("File pattern: %s", config.LogShipper.FilePattern)
	log.Printf("Health check interval: %ds", config.LogShipper.HealthCheckInt)
	log.Printf("Max reopen retries: %d", config.LogShipper.ReopenMaxRetry)
	log.Println("Features enabled: tail -F style file handle reconnect, inode tracking, logrotate detection")

	if err := shipper.scanExistingFiles(); err != nil {
		log.Fatalf("Failed to scan existing files: %v", err)
	}

	if err := shipper.watchDirectory(); err != nil {
		log.Fatalf("Failed to watch directory: %v", err)
	}

	go shipper.healthCheckLoop()

	log.Println("Log Shipper started successfully")

	select {}
}
