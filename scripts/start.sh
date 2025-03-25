#!/bin/bash

# 存储进程ID的目录
mkdir -p .pids

# 启动 SearXNG
echo "Starting SearXNG..."
docker-compose up -d
echo $! > .pids/searxng.pid

# 等待 SearXNG 完全启动
echo "Waiting for SearXNG to start..."
until $(curl --output /dev/null --silent --head --fail http://localhost:8080); do
    printf '.'
    sleep 1
done
echo "SearXNG is up!"

# 启动 Electron 应用
echo "Starting Electron app..."
npm run dev &
echo $! > .pids/electron.pid

# 捕获 SIGINT 和 SIGTERM 信号
cleanup() {
    echo "Stopping all services..."
    
    # 停止 Electron 应用
    if [ -f .pids/electron.pid ]; then
        kill $(cat .pids/electron.pid)
        rm .pids/electron.pid
    fi
    
    # 停止 SearXNG
    docker-compose down
    
    # 清理 .pids 目录
    rm -rf .pids
    
    exit 0
}

trap cleanup SIGINT SIGTERM

# 保持脚本运行
wait 