@echo off
echo Starting Raft KV Cluster...

echo Starting node1...
start "node1" cmd /c "go run ./cmd/node --id node1 --http :8001 --raft :9001 --data ./data/node1 --bootstrap"

timeout /t 3 /nobreak >nul

echo Starting node2...
start "node2" cmd /c "go run ./cmd/node --id node2 --http :8002 --raft :9002 --data ./data/node2"

echo Starting node3...
start "node3" cmd /c "go run ./cmd/node --id node3 --http :8003 --raft :9003 --data ./data/node3"

timeout /t 3 /nobreak >nul

echo Joining nodes to cluster...
curl -X POST -H "Content-Type: application/json" -d "{\"node_id\":\"node2\",\"raft_addr\":\"localhost:9002\",\"http_addr\":\"localhost:8002\"}" http://localhost:8001/join
curl -X POST -H "Content-Type: application/json" -d "{\"node_id\":\"node3\",\"raft_addr\":\"localhost:9003\",\"http_addr\":\"localhost:8003\"}" http://localhost:8001/join

echo Starting gateway...
start "gateway" cmd /c "go run ./cmd/gateway --addr :7000 --nodes ./config/nodes.json"

echo Cluster started!
echo Gateway: http://localhost:7000
echo Node1: http://localhost:8001
echo Node2: http://localhost:8002
echo Node3: http://localhost:8003
pause
