#!/bin/bash
set -e

export GOPROXY=https://goproxy.cn,direct

echo "下载依赖..."
go mod download

echo "编译..."
go build -o server-monitor .

echo "编译成功! 可执行文件: server-monitor"
echo "运行: ./server-monitor"
