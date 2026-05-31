package gateway

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
)

type HttpServer struct {
	gateway *Gateway
	addr    string
}

func NewHttpServer(gateway *Gateway, addr string) *HttpServer {
	return &HttpServer{
		gateway: gateway,
		addr:    addr,
	}
}

func (s *HttpServer) Start() error {
	mux := http.NewServeMux()

	mux.HandleFunc("/kv/", s.handleKV)
	mux.HandleFunc("/nodes", s.handleNodes)
	mux.HandleFunc("/nodes/status", s.handleNodeStatus)
	mux.HandleFunc("/health", s.handleHealth)

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
		value, err := s.gateway.Get(key)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(value))

	case http.MethodPut:
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer r.Body.Close()

		if err := s.gateway.Put(key, string(body)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)

	case http.MethodDelete:
		if err := s.gateway.Delete(key); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *HttpServer) handleNodes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		nodes := s.gateway.GetNodes()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(nodes)

	case http.MethodPost:
		var req struct {
			NodeID string `json:"node_id"`
			Addr   string `json:"addr"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if req.NodeID == "" || req.Addr == "" {
			http.Error(w, "node_id and addr are required", http.StatusBadRequest)
			return
		}
		s.gateway.AddNode(req.NodeID, req.Addr)
		w.WriteHeader(http.StatusOK)

	case http.MethodDelete:
		var req struct {
			NodeID string `json:"node_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if req.NodeID == "" {
			http.Error(w, "node_id is required", http.StatusBadRequest)
			return
		}
		s.gateway.RemoveNode(req.NodeID)
		w.WriteHeader(http.StatusOK)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *HttpServer) handleNodeStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	status := s.gateway.GetNodeStatus()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func (s *HttpServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}
