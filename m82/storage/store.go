package storage

import (
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"sync"

	"github.com/hashicorp/raft"
	"github.com/syndtr/goleveldb/leveldb"
)

type KVStore struct {
	mu      sync.RWMutex
	db      *leveldb.DB
	raftDir string
	raft    *raft.Raft
}

type Command struct {
	Op    string `json:"op"`
	Key   string `json:"key"`
	Value string `json:"value"`
}

func NewKVStore(dataDir, raftDir string) (*KVStore, error) {
	dbPath := filepath.Join(dataDir, "leveldb")
	db, err := leveldb.OpenFile(dbPath, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to open leveldb: %v", err)
	}

	return &KVStore{
		db:      db,
		raftDir: raftDir,
	}, nil
}

func (s *KVStore) Get(key string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	value, err := s.db.Get([]byte(key), nil)
	if err == leveldb.ErrNotFound {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return string(value), nil
}

func (s *KVStore) Apply(l *raft.Log) interface{} {
	var cmd Command
	if err := json.Unmarshal(l.Data, &cmd); err != nil {
		return fmt.Errorf("failed to unmarshal command: %v", err)
	}

	switch cmd.Op {
	case "put":
		return s.applyPut(cmd.Key, cmd.Value)
	case "delete":
		return s.applyDelete(cmd.Key)
	default:
		return fmt.Errorf("unknown command op: %s", cmd.Op)
	}
}

func (s *KVStore) applyPut(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.db.Put([]byte(key), []byte(value), nil)
}

func (s *KVStore) applyDelete(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.db.Delete([]byte(key), nil)
}

func (s *KVStore) Snapshot() (raft.FSMSnapshot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return &fsmSnapshot{store: s}, nil
}

func (s *KVStore) Restore(rc io.ReadCloser) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	defer rc.Close()

	iter := s.db.NewIterator(nil, nil)
	defer iter.Release()

	batch := new(leveldb.Batch)
	for iter.Next() {
		batch.Delete(iter.Key())
	}
	if err := s.db.Write(batch, nil); err != nil {
		return err
	}

	decoder := json.NewDecoder(rc)
	for {
		var entry struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		}
		if err := decoder.Decode(&entry); err == io.EOF {
			break
		} else if err != nil {
			return err
		}
		if err := s.db.Put([]byte(entry.Key), []byte(entry.Value), nil); err != nil {
			return err
		}
	}
	return nil
}

func (s *KVStore) Close() error {
	if s.raft != nil {
		future := s.raft.Shutdown()
		if err := future.Error(); err != nil {
			return err
		}
	}
	return s.db.Close()
}

func (s *KVStore) SetRaft(r *raft.Raft) {
	s.raft = r
}

func (s *KVStore) Raft() *raft.Raft {
	return s.raft
}

type fsmSnapshot struct {
	store *KVStore
}

func (f *fsmSnapshot) Persist(sink raft.SnapshotSink) error {
	iter := f.store.db.NewIterator(nil, nil)
	defer iter.Release()

	encoder := json.NewEncoder(sink)
	for iter.Next() {
		entry := struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		}{
			Key:   string(iter.Key()),
			Value: string(iter.Value()),
		}
		if err := encoder.Encode(entry); err != nil {
			sink.Cancel()
			return err
		}
	}
	return sink.Close()
}

func (f *fsmSnapshot) Release() {}

func (s *KVStore) Put(key, value string) error {
	if s.raft == nil {
		return fmt.Errorf("raft not initialized")
	}

	cmd := Command{
		Op:    "put",
		Key:   key,
		Value: value,
	}
	data, err := json.Marshal(cmd)
	if err != nil {
		return err
	}

	future := s.raft.Apply(data, 0)
	return future.Error()
}

func (s *KVStore) Delete(key string) error {
	if s.raft == nil {
		return fmt.Errorf("raft not initialized")
	}

	cmd := Command{
		Op:  "delete",
		Key: key,
	}
	data, err := json.Marshal(cmd)
	if err != nil {
		return err
	}

	future := s.raft.Apply(data, 0)
	return future.Error()
}
