#!/bin/bash
set -e

echo "🔧 Initializing database and data directories..."

# 确保数据目录存在并设置正确权限
if [ ! -d "/app/data" ]; then
    echo "❌ Volume not mounted: /app/data directory not found"
    exit 1
fi

echo "✅ Volume mounted successfully at /app/data"

# 创建必要的子目录
mkdir -p /app/data/logs
mkdir -p /app/data/backups

# 设置权限（确保 bnbot 用户可以读写）
chown -R bnbot:bnbot /app/data
chmod 755 /app/data
chmod 755 /app/data/logs
chmod 755 /app/data/backups

# 检查数据库文件
if [ ! -f "/app/data/announcements.db" ]; then
    echo "📝 Creating new SQLite database..."
    touch /app/data/announcements.db
    chown bnbot:bnbot /app/data/announcements.db
    chmod 644 /app/data/announcements.db
else
    echo "✅ Database file exists: /app/data/announcements.db"
fi

# 显示存储使用情况
echo "💾 Storage usage:"
df -h /app/data

echo "✅ Database initialization completed successfully"
echo "🚀 Starting application..."

# 启动应用
exec "$@"