.PHONY: all build-backend build-frontend run-backend run-frontend run-mock clean generate-bpf help

.DEFAULT_GOAL := help

## 帮助信息
help:
	@echo "eBPF 系统调用可视化监控仪表盘"
	@echo ""
	@echo "可用命令:"
	@echo "  make generate-bpf    - 编译 eBPF 程序 (需 Linux + clang)"
	@echo "  make build-backend   - 构建 Go 后端"
	@echo "  make build-frontend  - 构建 Vue 前端"
	@echo "  make run-backend     - 运行后端 (真实 eBPF 模式, 需 root)"
	@echo "  make run-mock        - 运行后端 (Mock 模式)"
	@echo "  make run-frontend    - 运行前端开发服务器"
	@echo "  make dev             - 同时运行后端 (Mock) 和前端"
	@echo "  make clean           - 清理构建产物"

## 编译 eBPF 程序
generate-bpf:
	@echo "=== 编译 eBPF 程序 ==="
	cd backend/ebpf && go generate ./...
	@echo "eBPF 程序编译完成"

## 构建 Go 后端
build-backend:
	@echo "=== 构建 Go 后端 ==="
	cd backend && go mod download && go build -o ../dist/ebpf-monitor .
	@echo "后端构建完成: dist/ebpf-monitor"

## 构建 Vue 前端
build-frontend:
	@echo "=== 构建 Vue 前端 ==="
	cd frontend && npm install && npm run build
	@echo "前端构建完成: frontend/dist"

## 运行后端 (真实 eBPF 模式)
run-backend:
	@echo "=== 运行后端 (真实 eBPF 模式) ==="
	@echo "注意: 需要 root 权限"
	cd backend && go run .

## 运行后端 (Mock 模式)
run-mock:
	@echo "=== 运行后端 (Mock 模式) ==="
	cd backend && go run . --mock

## 运行前端开发服务器
run-frontend:
	@echo "=== 运行前端开发服务器 ==="
	cd frontend && npm install && npm run dev

## 同时运行后端 (Mock) 和前端
dev: run-mock run-frontend

## 清理构建产物
clean:
	@echo "=== 清理构建产物 ==="
	rm -rf dist/
	rm -rf frontend/dist/
	rm -rf frontend/node_modules/
	rm -f backend/ebpf/bpf_*.go
	rm -f backend/ebpf/bpf_*.o
	@echo "清理完成"
