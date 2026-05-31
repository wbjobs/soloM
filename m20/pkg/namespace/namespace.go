package namespace

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type ContainerInfo struct {
	PID           uint32
	CgroupID      string
	MountNamespace string
	PidNamespace   string
	NetNamespace   string
	Comm          string
}

func GetNamespaceForPID(pid uint32) (*ContainerInfo, error) {
	info := &ContainerInfo{PID: pid}

	mountNS, err := readlink(fmt.Sprintf("/proc/%d/ns/mnt", pid))
	if err == nil {
		info.MountNamespace = mountNS
	}

	pidNS, err := readlink(fmt.Sprintf("/proc/%d/ns/pid", pid))
	if err == nil {
		info.PidNamespace = pidNS
	}

	netNS, err := readlink(fmt.Sprintf("/proc/%d/ns/net", pid))
	if err == nil {
		info.NetNamespace = netNS
	}

	cgroup, err := readCgroup(pid)
	if err == nil {
		info.CgroupID = cgroup
	}

	return info, nil
}

func readlink(path string) (string, error) {
	dst, err := os.Readlink(path)
	if err != nil {
		return "", err
	}
	return extractNSID(dst), nil
}

func extractNSID(nsLink string) string {
	parts := strings.Split(nsLink, "[")
	if len(parts) < 2 {
		return nsLink
	}
	id := strings.TrimRight(parts[1], "]")
	return id
}

func readCgroup(pid uint32) (string, error) {
	data, err := os.ReadFile(fmt.Sprintf("/proc/%d/cgroup", pid))
	if err != nil {
		return "", err
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.Contains(line, "docker") || strings.Contains(line, "kubepods") || strings.Contains(line, "containerd") {
			fields := strings.SplitN(line, ":", 3)
			if len(fields) >= 3 {
				return fields[2], nil
			}
		}
	}
	return "", fmt.Errorf("no container cgroup found for pid %d", pid)
}

type PidNamespaceCache struct {
	cache map[uint32]*ContainerInfo
}

func NewPidNamespaceCache() *PidNamespaceCache {
	return &PidNamespaceCache{
		cache: make(map[uint32]*ContainerInfo),
	}
}

func (c *PidNamespaceCache) Get(pid uint32) *ContainerInfo {
	if info, ok := c.cache[pid]; ok {
		return info
	}
	info, err := GetNamespaceForPID(pid)
	if err != nil {
		return &ContainerInfo{PID: pid}
	}
	c.cache[pid] = info
	return info
}

func (c *PidNamespaceCache) PruneDeadPIDs() {
	for pid := range c.cache {
		if !IsPidAlive(pid) {
			delete(c.cache, pid)
		}
	}
}

func IsPidAlive(pid uint32) bool {
	_, err := os.Stat(fmt.Sprintf("/proc/%d", pid))
	return err == nil
}

func WalkProc() ([]uint32, error) {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil, err
	}
	var pids []uint32
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		pid, err := strconv.ParseUint(entry.Name(), 10, 32)
		if err != nil {
			continue
		}
		cmdline, err := os.ReadFile(filepath.Join("/proc", entry.Name(), "comm"))
		if err != nil {
			continue
		}
		if strings.TrimSpace(string(cmdline)) == "" {
			continue
		}
		pids = append(pids, uint32(pid))
	}
	return pids, nil
}
