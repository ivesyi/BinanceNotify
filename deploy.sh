#!/bin/bash

# 币安公告机器人 - 简单Docker部署脚本

set -e

echo "🚀 开始部署币安公告机器人..."

# 检查是否存在 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  .env 文件不存在，正在从模板创建..."
    cp .env.example .env
    echo "✅ 已创建 .env 文件，请编辑填入实际配置值"
    echo "🔧 编辑完成后重新运行此脚本"
    exit 1
fi

# 创建必要的目录
echo "📁 创建必要的目录..."
mkdir -p logs data

# 构建和启动容器
echo "🔧 构建Docker镜像..."
docker-compose build

echo "🚀 启动服务..."
docker-compose up -d

# 检查服务状态
echo "⏳ 等待服务启动..."
sleep 10

echo "📊 检查服务状态..."
docker-compose ps

echo "🏥 检查健康状态..."
# 等待服务完全启动
timeout=60
while [ $timeout -gt 0 ]; do
    if curl -s -f http://localhost:5010/health > /dev/null 2>&1; then
        echo "✅ 服务运行正常!"
        break
    fi
    sleep 2
    timeout=$((timeout-2))
    echo "⏳ 等待服务启动... ($timeout 秒)"
done

if [ $timeout -le 0 ]; then
    echo "❌ 服务启动超时，请检查日志"
    docker-compose logs bn-bot
    exit 1
fi

echo ""
echo "🎉 部署完成!"
echo ""
echo "📈 监控地址:"
echo "   - 服务状态: http://localhost:5010/health"
echo "   - 系统状态: http://localhost:5010/status"
echo "   - 统计信息: http://localhost:5010/stats"
echo ""
echo "🔧 常用命令:"
echo "   - 查看日志: docker-compose logs -f bn-bot"
echo "   - 重启服务: docker-compose restart bn-bot"
echo "   - 停止服务: docker-compose down"
echo "   - 测试通知: curl -X POST http://localhost:5010/test"
echo ""