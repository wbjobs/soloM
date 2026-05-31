package storage

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type HttpServer struct {
	node       *RaftNode
	addr       string
	httpClient *http.Client
}

func NewHttpServer(node *RaftNode, addr string) *HttpServer {
	return &HttpServer{
		node:       node,
		addr:       addr,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

func (s *HttpServer) Start() error {
	mux := http.NewServeMux()

	mux.HandleFunc("/kv/", s.handleKV)
	mux.HandleFunc("/join", s.handleJoin)
	mux.HandleFunc("/leave", s.handleLeave)
	mux.HandleFunc("/status", s.handleStatus)

	return http.ListenAndServe(s.addr, mux)
}

func (s *HttpServer) handleKV(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimPrefix(r.URL.Path, "/kv/")
	if key == "" {
		http.Error(w, "key is required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		value, err := s.node.Store().Get(key)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(value))

	case http.MethodPut:
		s.handleWrite(w, r, key, "put")

	case http.MethodDelete:
		s.handleWrite(w, r, key, "delete")

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *HttpServer) handleWrite(w http.ResponseWriter, r *http.Request, key, op string) {
	if s.node.IsLeader() {
		switch op {
		case "put":
			body, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			defer r.Body.Close()

			if err := s.node.Store().Put(key, string(body)); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)

		case "delete":
			if err := s.node.Store().Delete(key); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
		}
		return
	}

	leaderHTTPAddr := s.node.GetLeaderHTTPAddr()
	if leaderHTTPAddr == "" {
		http.Error(w, "no leader available", http.StatusServiceUnavailable)
		return
	}

	s.forwardToLeader(w, r, leaderHTTPAddr, key, op)
}

func (s *HttpServer) forwardToLeader(w http.ResponseWriter, r *http.Request, leaderAddr, key, op string) {
	targetURL := fmt.Sprintf("http://%s/kv/%s", leaderAddr, key)

	var req *http.Request
	var err error

	switch op {
	case "put":
		body, readErr := io.ReadAll(r.Body)
		if readErr != nil {
			http.Error(w, readErr.Error(), http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		req, err = http.NewRequest(http.MethodPut, targetURL, bytes.NewBuffer(body))
	case "delete":
		req, err = http.NewRequest(http.MethodDelete, targetURL, nil)
	default:
		http.Error(w, "unknown operation", http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to forward to leader: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)
}

type JoinRequest struct {
	NodeID   string `json:"node_id"`
	RaftAddr string `json:"raft_addr"`
	HTTPAddr string `json:"http_addr"`
}

func (s *HttpServer) handleJoin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !s.node.IsLeader() {
		leaderHTTPAddr := s.node.GetLeaderHTTPAddr()
		if leaderHTTPAddr == "" {
			http.Error(w, "no leader available", http.StatusServiceUnavailable)
			return
		}
		s.forwardJoinToLeader(w, r, leaderHTTPAddr)
		return
	}

	var req JoinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.NodeID == "" || req.RaftAddr == "" {
		http.Error(w, "node_id and raft_addr are required", http.StatusBadRequest)
		return
	}

	if err := s.node.Join(req.NodeID, req.RaftAddr); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if req.HTTPAddr != "" {
		s.node.RegisterPeerHTTPAddr(req.NodeID, req.HTTPAddr)
	}

	w.WriteHeader(http.StatusOK)
}

func (s *HttpServer) forwardJoinToLeader(w http.ResponseWriter, r *http.Request, leaderAddr string) {
	targetURL := fmt.Sprintf("http://%s/join", leaderAddr)

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	req, err := http.NewRequest(http.MethodPost, targetURL, bytes.NewBuffer(body))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to forward join to leader: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)
}

type LeaveRequest struct {
	NodeID string `json:"node_id"`
}

func (s *HttpServer) handleLeave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !s.node.IsLeader() {
		leaderHTTPAddr := s.node.GetLeaderHTTPAddr()
		if leaderHTTPAddr == "" {
			http.Error(w, "no leader available", http.StatusServiceUnavailable)
			return
		}
		s.forwardLeaveToLeader(w, r, leaderHTTPAddr)
		return
	}

	var req LeaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.node.Leave(req.NodeID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (s *HttpServer) forwardLeaveToLeader(w http.ResponseWriter, r *http.Request, leaderAddr string) {
	targetURL := fmt.Sprintf("http://%s/leave", leaderAddr)

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	req, err := http.NewRequest(http.MethodPost, targetURL, bytes.NewBuffer(body))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to forward leave to leader: %v", err), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	w.WriteHeader(resp.StatusCode)
	w.Write(respBody)
}

type StatusResponse struct {
	NodeID      string   `json:"node_id"`
	RaftAddr    string   `json:"raft_addr"`
	HTTPAddr    string   `json:"http_addr"`
	State       string   `json:"state"`
	IsLeader    bool     `json:"is_leader"`
	LeaderID    string   `json:"leader_id"`
	LeaderAddr  string   `json:"leader_addr"`
	LeaderHTTP  string   `json:"leader_http_addr"`
	Peers       []string `json:"peers"`
	AppliedIndex  uint64 `json:"applied_index"`
	CommitIndex   uint64 `json:"commit_index"`
	LastLogIndex  uint64 `json:"last_log_index"`
}

func (s *HttpServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	leaderHTTP := s.node.GetLeaderHTTPAddr()

	peers := []string{}
	clusterConfig, err := s.node.GetClusterConfig()
	if err == nil {
		for _, srv := range clusterConfig {
			peers = append(peers, string(srv.ID))
		}
	}

	stateStr := "follower"
	switch s.node.GetState() {
	case 0:
		stateStr = "follower"
	case 1:
		stateStr = "candidate"
	case 2:
		stateStr = "leader"
	}

	resp := StatusResponse{
		NodeID:       s.node.NodeID(),
		RaftAddr:     s.node.LeaderAddr(),
		HTTPAddr:     s.node.HTTPAddr(),
		State:        stateStr,
		IsLeader:     s.node.IsLeader(),
		LeaderID:     s.node.LeaderID(),
		LeaderAddr:   s.node.LeaderAddr(),
		LeaderHTTP:   leaderHTTP,
		Peers:        peers,
		AppliedIndex: s.node.GetAppliedIndex(),
		CommitIndex:  s.node.GetCommitIndex(),
		LastLogIndex: s.node.GetLastLogIndex(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
