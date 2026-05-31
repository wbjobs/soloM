package storage

import (
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/hashicorp/raft"
	raftboltdb "github.com/hashicorp/raft-boltdb"
)

type LeaderChangeHandler func(leaderID string)

type RaftNode struct {
	raft           *raft.Raft
	store          *KVStore
	nodeID         string
	raftAddr       string
	httpAddr       string
	peerHTTPAddrs  map[string]string
	mu             sync.RWMutex
	leaderCh       <-chan bool
	onLeaderChange LeaderChangeHandler
}

func NewRaftNode(nodeID, dataDir, raftAddr, httpAddr string, store *KVStore, bootstrap bool) (*RaftNode, error) {
	raftDir := filepath.Join(dataDir, "raft")
	if err := os.MkdirAll(raftDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create raft dir: %v", err)
	}

	config := raft.DefaultConfig()
	config.LocalID = raft.ServerID(nodeID)
	config.SnapshotThreshold = 1024
	config.SnapshotInterval = 30 * time.Second
	config.HeartbeatTimeout = 1000 * time.Millisecond
	config.ElectionTimeout = 1000 * time.Millisecond
	config.LeaderLeaseTimeout = 500 * time.Millisecond
	config.CommitTimeout = 50 * time.Millisecond

	addr, err := net.ResolveTCPAddr("tcp", raftAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve raft address: %v", err)
	}

	transport, err := raft.NewTCPTransport(raftAddr, addr, 3, 10*time.Second, os.Stderr)
	if err != nil {
		return nil, fmt.Errorf("failed to create transport: %v", err)
	}

	logStore, err := raftboltdb.NewBoltStore(filepath.Join(raftDir, "logs.dat"))
	if err != nil {
		return nil, fmt.Errorf("failed to create log store: %v", err)
	}

	stableStore, err := raftboltdb.NewBoltStore(filepath.Join(raftDir, "stable.dat"))
	if err != nil {
		return nil, fmt.Errorf("failed to create stable store: %v", err)
	}

	snapshotStore, err := raft.NewFileSnapshotStore(raftDir, 2, os.Stderr)
	if err != nil {
		return nil, fmt.Errorf("failed to create snapshot store: %v", err)
	}

	ra, err := raft.NewRaft(config, store, logStore, stableStore, snapshotStore, transport)
	if err != nil {
		return nil, fmt.Errorf("failed to create raft: %v", err)
	}

	store.SetRaft(ra)

	if bootstrap {
		configuration := raft.Configuration{
			Servers: []raft.Server{
				{
					ID:      raft.ServerID(nodeID),
					Address: transport.LocalAddr(),
				},
			},
		}
		ra.BootstrapCluster(configuration)
	}

	n := &RaftNode{
		raft:          ra,
		store:         store,
		nodeID:        nodeID,
		raftAddr:      raftAddr,
		httpAddr:      httpAddr,
		peerHTTPAddrs: make(map[string]string),
		leaderCh:      ra.LeaderCh(),
	}

	return n, nil
}

func (n *RaftNode) SetOnLeaderChange(handler LeaderChangeHandler) {
	n.onLeaderChange = handler
}

func (n *RaftNode) WatchLeaderChanges() {
	go func() {
		for isLeader := range n.leaderCh {
			leaderAddr, leaderID := n.raft.LeaderWithID()
			leaderIDStr := string(leaderID)
			leaderAddrStr := string(leaderAddr)

			if isLeader {
				log.Printf("[RAFT] Node %s became leader", n.nodeID)
			} else {
				log.Printf("[RAFT] Node %s lost leadership, new leader: %s (%s)", n.nodeID, leaderIDStr, leaderAddrStr)
			}

			if n.onLeaderChange != nil {
				n.onLeaderChange(leaderIDStr)
			}
		}
	}()
}

func (n *RaftNode) RegisterPeerHTTPAddr(nodeID, httpAddr string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.peerHTTPAddrs[nodeID] = httpAddr
}

func (n *RaftNode) GetLeaderHTTPAddr() string {
	leaderAddr, leaderID := n.raft.LeaderWithID()
	leaderIDStr := string(leaderID)
	leaderAddrStr := string(leaderAddr)

	if leaderIDStr == "" {
		return ""
	}

	n.mu.RLock()
	defer n.mu.RUnlock()

	if leaderIDStr == n.nodeID {
		return n.httpAddr
	}

	if addr, ok := n.peerHTTPAddrs[leaderIDStr]; ok {
		return addr
	}

	host, _, err := net.SplitHostPort(leaderAddrStr)
	if err != nil {
		return ""
	}
	_, port, err := net.SplitHostPort(n.httpAddr)
	if err != nil {
		return ""
	}

	return host + ":" + port
}

func (n *RaftNode) GetClusterConfig() ([]raft.Server, error) {
	configFuture := n.raft.GetConfiguration()
	if err := configFuture.Error(); err != nil {
		return nil, err
	}
	return configFuture.Configuration().Servers, nil
}

func (n *RaftNode) GetAppliedIndex() uint64 {
	return n.raft.AppliedIndex()
}

func (n *RaftNode) GetCommitIndex() uint64 {
	return n.raft.CommitIndex()
}

func (n *RaftNode) GetLastLogIndex() uint64 {
	return n.raft.LastIndex()
}

func (n *RaftNode) GetState() raft.RaftState {
	return n.raft.State()
}

func (n *RaftNode) Join(nodeID, raftAddr string) error {
	configFuture := n.raft.GetConfiguration()
	if err := configFuture.Error(); err != nil {
		return err
	}

	for _, srv := range configFuture.Configuration().Servers {
		if srv.ID == raft.ServerID(nodeID) || srv.Address == raft.ServerAddress(raftAddr) {
			if srv.Address == raft.ServerAddress(raftAddr) && srv.ID == raft.ServerID(nodeID) {
				return nil
			}
			future := n.raft.RemoveServer(srv.ID, 0, 0)
			if err := future.Error(); err != nil {
				return fmt.Errorf("error removing existing node %s: %v", nodeID, err)
			}
		}
	}

	f := n.raft.AddVoter(raft.ServerID(nodeID), raft.ServerAddress(raftAddr), 0, 0)
	if err := f.Error(); err != nil {
		return err
	}
	return nil
}

func (n *RaftNode) Leave(nodeID string) error {
	f := n.raft.RemoveServer(raft.ServerID(nodeID), 0, 0)
	return f.Error()
}

func (n *RaftNode) IsLeader() bool {
	return n.raft.State() == raft.Leader
}

func (n *RaftNode) LeaderID() string {
	_, id := n.raft.LeaderWithID()
	return string(id)
}

func (n *RaftNode) LeaderAddr() string {
	addr, _ := n.raft.LeaderWithID()
	return string(addr)
}

func (n *RaftNode) NodeID() string {
	return n.nodeID
}

func (n *RaftNode) HTTPAddr() string {
	return n.httpAddr
}

func (n *RaftNode) Raft() *raft.Raft {
	return n.raft
}

func (n *RaftNode) Store() *KVStore {
	return n.store
}

func (n *RaftNode) Close() error {
	future := n.raft.Shutdown()
	if err := future.Error(); err != nil {
		return err
	}
	return n.store.Close()
}
