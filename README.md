# 🚀 币安公告转发系统 - 完整指南

简单高效的币安公告实时监控和多渠道转发系统，支持Telegram、ShowDoc推送等通知方式，集成AI翻译功能自动将英文公告翻译为中文。

有技术实力的小伙伴可以自己部署，不懂技术的小伙伴可以直接电报订阅（https://t.me/snwebnb），掌握一手币安公告。
<table>
  <tr>
    <td><img src="https://github.com/user-attachments/assets/b8870b4f-22d6-44af-a5e1-c369df43e449" width="200"></td>
    <td><img src="https://github.com/user-attachments/assets/616ab902-ad73-4960-9015-13fb839ef96a" width="200"></td>
    <td><img src="https://github.com/user-attachments/assets/0991b385-d1e7-41d7-8988-e0f19228b49d" width="200"></td>
  </tr>
</table>
<img width="2494" height="1802" alt="image" src="https://github.com/user-attachments/assets/a361b539-1ced-41c4-ba08-a81fa80627dc" />



## 📋 目录

- [核心特性](#核心特性)
- [系统架构](#系统架构)
- [快速部署](#快速部署)
- [配置指南](#配置指南)
- [监控管理](#监控管理)
- [运维操作](#运维操作)
- [故障排除](#故障排除)
- [安全指南](#安全指南)
- [性能优化](#性能优化)

## ✨ 核心特性

- 🔗 **可靠连接**：24小时自动重连，心跳保持机制
- 🤖 **AI智能翻译**：基于Vercel AI SDK，自动将英文公告翻译为中文，支持双语显示
- 📱 **多渠道推送**：Telegram Bot + ShowDoc推送，支持多用户推送和原文+译文双语格式
- 🔄 **智能重连**：WebSocket连接管理，自动处理24小时周期限制
- 🎯 **消息过滤**：支持分类、关键词等多维度过滤
- 📊 **Web管理界面**：实时仪表板，公告管理，转发状态监控，AI翻译状态监控
- 🐳 **容器化部署**：简单的单机Docker部署，完全支持AI翻译功能
- 🛡️ **安全可靠**：API密钥加密存储，完善的错误处理，AI翻译容错机制

## 🏗️ 系统架构

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   币安WebSocket  │───▶│   消息路由器      │───▶│  Telegram Bot   │
│   连接管理器     │    │                 │    └─────────────────┘
└─────────────────┘    │  - 消息过滤      │    ┌─────────────────┐
                       │  - 去重处理      │───▶│  ShowDoc推送   │
┌─────────────────┐    │  - 重试机制      │    │ (多用户支持)     │
│   配置管理器     │    │  - AI翻译集成    │    └─────────────────┘
└─────────────────┘    └────────┬─────────┘    ┌─────────────────┐
                                │              │  AI翻译服务     │
┌─────────────────┐    ┌────────▼─────────┐    │ (Vercel AI SDK) │
│   日志系统      │    │   HTTP监控       │    └─────────────────┘
└─────────────────┘    │ (+AI翻译状态监控) │
                       └──────────────────┘
```

### 核心组件说明

#### 1. WebSocket Manager
- **功能**：管理与币安的WebSocket连接
- **关键特性**：24小时定期重连、指数退避重试、心跳保持（30秒间隔）、连接状态监控

#### 2. Message Router
- **功能**：消息路由和分发，集成AI翻译处理
- **特性**：多通道并行发送、消息去重、过滤规则引擎、失败重试、AI翻译异步集成

#### 3. AI翻译服务
- **框架**：基于Vercel AI SDK
- **支持提供商**：Anthropic官方API、OpenAI兼容第三方API、Anthropic兼容第三方API
- **核心特性**：专业金融术语翻译、容错机制、性能监控、成本控制

#### 4. 通知器组件
- **Telegram Notifier**：支持Markdown格式，双语显示（🇨🇳 中文译文 + 🇬🇧 英文原文）
- **ShowDoc Notifier**：支持多用户推送、官方API规范、双语格式推送

## 🚀 快速部署

### 系统要求
- Docker & Docker Compose
- 至少512MB内存
- 网络连接（访问币安API和通知服务）

### 一键部署

```bash
# 1. 克隆项目
git clone <repository-url>
cd bn_bot

# 2. 复制环境配置
cp .env.example .env

# 3. 编辑配置文件
vim .env

# 4. 一键部署
./deploy.sh
```

### 云端部署

#### ClawCloud Run 部署
> 详细 Fly.io 云平台部署指南请见 [CLAWCLOUD-DEPLOY.md](CLAWCLOUD-DEPLOY.md)

**部署特性**：
- 💰 **成本可控**：每月$5免费额度，基础配置约$3-4/月，满足本项目应用场景
- 🌐 **全球可达**：自动SSL证书，支持自定义域名


#### Fly.io 部署

> 详细 Fly.io 云平台部署指南请见 [FLY-DEPLOY.md](FLY-DEPLOY.md)

**部署特性：**
- 🔒 密钥安全，支持 Fly.io Secrets
- 💾 3GB 持久化存储卷
- 🌏 全球节点，低延迟访问
- 💰 免费额度友好，适合个人/小团队

### Docker部署

```bash
# 启动服务
docker-compose up -d

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f bn-bot

# 停止服务
docker-compose down
```

### NPM运行

```bash
# 安装依赖
npm install

# 生产模式启动
npm start

# 开发模式启动
npm run dev
```

## 📋 配置指南

### 必需配置

编辑 `.env` 文件：

```env
# 币安API配置（必填）
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_API_SECRET=your_binance_api_secret_here

# 系统配置
NODE_ENV=production
PORT=5010
LOG_LEVEL=info
```

### 币安API配置

1. 访问 [币安API管理](https://www.binance.com/cn/my/settings/api-management)
2. 创建新的API密钥
3. 权限设置：只需要"现货和杠杆交易：读取"权限
4. 建议设置IP白名单

### Telegram通知配置（可选）

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

**配置步骤**：
1. 与 [@BotFather](https://t.me/BotFather) 创建机器人
2. 获取Bot Token
3. 获取Chat ID：
   ```bash
   # 发送消息给机器人后访问：
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```

### ShowDoc推送配置（可选）

支持**单用户**和**多用户**两种推送模式：

#### 方式一：多用户推送（推荐）
```env
SHOWDOC_ENABLED=true
# JSON格式配置多个接收者
SHOWDOC_RECIPIENTS={"用户A":"https://push.showdoc.com.cn/server/api/push/token1","用户B":"https://push.showdoc.com.cn/server/api/push/token2"}
# 最大并发推送数量，防止过载
SHOWDOC_MAX_CONCURRENT=3
```

#### 方式二：单用户推送（向后兼容）
```env
SHOWDOC_ENABLED=true
SHOWDOC_PUSH_URL=https://push.showdoc.com.cn/server/api/push/your_token
```

### AI翻译配置（可选）

```env
# 启用AI翻译功能
AI_TRANSLATION_ENABLED=true

# API提供商类型: anthropic | custom-anthropic | openai-compatible
AI_PROVIDER=openai-compatible

# Anthropic API密钥 (直接使用Anthropic API时)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# 第三方API配置
AI_BASE_URL=https://your-api-endpoint.com/v1
AI_API_KEY=your_ai_api_key
AI_CUSTOM_HEADERS={}

# AI模型选择
AI_MODEL=your_ai_model

# 翻译模式: both(原文+译文), translated(仅译文), original(仅原文)
AI_TRANSLATION_MODE=both

# 性能参数
AI_TIMEOUT=15000
AI_RETRY_ATTEMPTS=2
AI_MAX_TOKENS=1000
```

**AI提供商选择**：
- `anthropic`: 直接使用Anthropic官方API
- `openai-compatible`: 使用OpenAI兼容的第三方API
- `custom-anthropic`: 使用Anthropic兼容的第三方API

**翻译模式说明**：
- `both`: 同时显示原文和译文（推荐）
- `translated`: 仅显示中文译文
- `original`: 仅显示英文原文（禁用翻译）

### 消息过滤配置（可选）

```env
# 启用的分类ID或名称（逗号分隔）
FILTER_CATEGORIES=

# 启用的关键词（逗号分隔）
FILTER_KEYWORDS=

# 排除的关键词（逗号分隔）
EXCLUDE_KEYWORDS=
```

## 📊 监控管理

### Web管理界面

系统提供了完整的Web管理界面：

```bash
# 访问管理界面
http://localhost:5010/dashboard
```

**界面功能**：
- 📈 **实时统计**：总公告数、已处理数、通知成功率、24小时新增
- 🤖 **AI翻译监控**：翻译服务状态、成功率、响应时间、字符统计
- 📋 **公告列表**：实时显示最新公告，支持双语显示和分页浏览
- 🔄 **转发状态**：显示每个通知渠道的发送状态（成功/失败）
- 💡 **状态指示**：实时显示系统连接状态、WebSocket状态、AI翻译状态
- 📱 **响应式设计**：支持手机和桌面设备访问

### HTTP监控端点

```bash
# 健康检查
curl http://localhost:5010/health

# 系统状态（包含AI翻译状态）
curl http://localhost:5010/status

# 统计信息
curl http://localhost:5010/stats

# 公告数据API（支持分页）
curl http://localhost:5010/announcements?page=1&limit=20

# 仪表板统计API
curl http://localhost:5010/announcements/stats

# 配置信息（脱敏）
curl http://localhost:5010/config

# 手动测试通知
curl -X POST http://localhost:5010/test
```

### 常用命令

```bash
# Docker管理
docker-compose logs -f bn-bot  # 查看日志
docker-compose restart bn-bot  # 重启服务
docker-compose down           # 停止服务
docker stats bn-bot           # 查看资源使用

# 维护命令
npm run logs:clean           # 清理日志
npm run setup                # 创建必要目录

# AI翻译测试
node test-third-party-api.js # 测试AI翻译功能
```

## 🔧 运维操作

### 日常维护检查清单
- [ ] 检查WebSocket连接状态
- [ ] 检查AI翻译服务状态和成功率
- [ ] 访问Web管理界面检查系统状态
- [ ] 查看公告接收和转发统计
- [ ] 验证双语消息格式正确性
- [ ] 查看错误日志
- [ ] 监控资源使用情况
- [ ] 验证通知渠道正常
- [ ] 检查数据库大小
- [ ] 测试AI翻译功能

### 每日检查脚本

```bash
#!/bin/bash
# daily_check.sh

echo "=== 币安公告系统日常检查 $(date) ==="

# 1. 检查服务状态
echo "1. 服务状态检查"
curl -s http://localhost:5010/health | jq '.healthy'

# 2. 检查WebSocket连接
echo "2. WebSocket状态"
curl -s http://localhost:5010/status | jq '.websocket_connected'

# 3. 检查AI翻译服务状态
echo "3. AI翻译服务状态"
curl -s http://localhost:5010/status | jq '.ai_translation | {enabled: .enabled, provider: .provider, successRate: .stats.successRate}'

# 4. 检查Web管理界面
echo "4. Web管理界面检查"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5010/dashboard)
if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✅ 管理界面正常访问"
else
    echo "❌ 管理界面访问异常: HTTP $HTTP_CODE"
fi

# 5. 检查24小时统计
echo "5. 24小时统计"
curl -s http://localhost:5010/announcements/stats | jq '{
  totalAnnouncements: .data.totalAnnouncements,
  processedAnnouncements: .data.processedAnnouncements,
  notifications: .data.notifications,
  recent24h: .data.recent24h
}'

# 6. 检查磁盘使用
echo "6. 磁盘使用情况"
du -sh logs/ data/

# 7. 检查内存使用
echo "7. 内存使用"
docker stats bn-bot --no-stream --format "table {{.MemUsage}}\t{{.CPUPerc}}"

echo "=== 检查完成 ==="
```

### 备份和恢复

#### 自动备份脚本
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backup/bn_bot/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "开始备份到 $BACKUP_DIR"

# 备份数据库
cp data/announcements.db "$BACKUP_DIR/"

# 备份配置
cp .env "$BACKUP_DIR/"
cp -r config/ "$BACKUP_DIR/"

# 备份日志（最近7天）
find logs/ -name "*.log" -mtime -7 -exec cp {} "$BACKUP_DIR/" \;

# 创建压缩包
tar -czf "$BACKUP_DIR.tar.gz" -C "$(dirname "$BACKUP_DIR")" "$(basename "$BACKUP_DIR")"

# 清理临时目录
rm -rf "$BACKUP_DIR"

# 保留最近30天的备份
find /backup/bn_bot/ -name "*.tar.gz" -mtime +30 -delete

echo "备份完成: $BACKUP_DIR.tar.gz"
```

#### 恢复流程
```bash
#!/bin/bash
# restore.sh

BACKUP_FILE="$1"

if [ -z "$BACKUP_FILE" ]; then
    echo "用法: $0 <backup_file.tar.gz>"
    exit 1
fi

echo "开始恢复备份: $BACKUP_FILE"

# 停止服务
docker-compose down

# 备份当前数据
cp -r data/ data_backup_$(date +%Y%m%d_%H%M%S)

# 解压备份
TEMP_DIR=$(mktemp -d)
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# 恢复数据
cp "$TEMP_DIR"/*/announcements.db data/
cp "$TEMP_DIR"/*/.env .

# 清理临时文件
rm -rf "$TEMP_DIR"

# 重启服务
docker-compose up -d

echo "恢复完成"
```

## 🛠️ 故障排除

### WebSocket连接问题

```bash
# 1. 检查连接状态
curl http://localhost:5010/status | jq '.websocket'

# 2. 查看连接日志
grep -i "websocket" logs/combined.log | tail -20

# 3. 检查API密钥状态
curl -H "X-MBX-APIKEY: $BINANCE_API_KEY" \
     "https://api.binance.com/api/v3/account" | jq '.permissions'

# 4. 测试网络连通性
curl -I https://api.binance.com/

# 5. 手动重连测试
curl -X POST http://localhost:5010/test
```

### 通知发送问题

```bash
# 1. 测试Telegram
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# 2. 测试ShowDoc（单用户）
curl -X POST "$SHOWDOC_PUSH_URL" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "title=测试&content=系统测试消息"

# 3. 查看失败日志
grep -i "notification.*failed" logs/error.log | tail -10
```

### AI翻译问题排查

```bash
# 1. 检查AI翻译服务状态
curl http://localhost:5010/status | jq '.ai_translation'

# 2. 测试AI翻译功能
node test-third-party-api.js

# 3. 检查AI API连通性
if [ "$AI_PROVIDER" == "openai-compatible" ]; then
    curl -X POST "$AI_BASE_URL/chat/completions" \
         -H "Authorization: Bearer $AI_API_KEY" \
         -H "Content-Type: application/json" \
         -d '{"model":"'"$AI_MODEL"'","messages":[{"role":"user","content":"test"}],"max_tokens":10}' \
         --connect-timeout 10
fi

# 4. 查看翻译错误日志
grep -i "ai.*translat.*fail\|translat.*error" logs/combined.log | tail -10

# 5. 检查模型配置
echo "当前模型: $AI_MODEL"
if [[ "$AI_MODEL" =~ "claude" ]]; then
    echo "✅ 使用Claude模型（推荐）"
else
    echo "⚠️ 建议使用Claude模型以获得更好的金融术语翻译"
fi
```

### 容器问题排查

```bash
# 1. 检查容器状态
docker-compose ps

# 2. 查看容器日志
docker-compose logs --tail=100 bn-bot

# 3. 检查端口占用
netstat -tlnp | grep 5010

# 4. 查看资源使用
docker stats bn-bot

# 5. 进入容器调试
docker-compose exec bn-bot sh

# 6. 重启服务
docker-compose restart bn-bot
```

### 调试模式

```bash
# 启用调试日志
LOG_LEVEL=debug docker-compose up

# 查看详细日志
docker-compose logs --tail=100 bn-bot
```

## 🔐 安全指南

### API密钥安全

币安API密钥和AI翻译API密钥是您的重要数字资产，请务必：

#### ✅ 应该做的事情

1. **使用环境变量**
   - 将所有API密钥存储在 `.env` 文件中
   - 包括币安API密钥和AI翻译服务密钥
   - 确保 `.env` 文件在 `.gitignore` 中
   - 不要在代码中硬编码任何密钥

2. **最小权限原则**
   - 创建专门用于此项目的API密钥
   - 币安API：只启用必要的权限（建议只启用"读取"权限）
   - AI翻译API：选择信誉良好的服务提供商
   - 不要启用"提现"或"交易"权限

3. **IP白名单**
   - 在币安API设置中限制IP地址
   - 只允许您的服务器IP访问

4. **定期轮换**
   - 定期更换所有API密钥
   - 发现异常时立即撤销密钥
   - 监控API使用情况和费用

#### ❌ 不应该做的事情

1. **永远不要**
   - 在GitHub或其他版本控制中提交任何密钥
   - 在聊天工具或邮件中发送密钥
   - 在生产环境中使用具有全部权限的密钥
   - 与他人分享您的API密钥
   - 在不安全的第三方服务中使用密钥

2. **避免**
   - 在日志中记录完整的密钥
   - 在错误消息中暴露密钥
   - 使用弱密码保护密钥文件
   - 将翻译内容发送到不可信的第三方服务

### 环境变量安全

```bash
# 设置文件权限
chmod 600 .env

# 确保不提交到版本控制
echo ".env" >> .gitignore

# 验证安全设置
git status # 不应该显示.env文件
```

### 容器安全

- 👤 使用非root用户运行
- 📦 定期更新基础镜像
- 🔒 限制容器权限和资源
- 📊 监控资源使用情况

### 网络安全

```bash
# 配置防火墙（仅允许必要端口）
ufw allow 22/tcp      # SSH
ufw allow 5010/tcp    # 监控端口（限制来源IP）
ufw deny incoming
ufw enable
```

### 安全检查清单

- [ ] `.env` 文件已创建且包含正确的密钥
- [ ] `.env` 文件在 `.gitignore` 中
- [ ] 币安API密钥权限设置为最小必要权限
- [ ] AI翻译API密钥已正确配置
- [ ] 已设置IP白名单（如果可能）
- [ ] 代码中没有硬编码任何密钥信息
- [ ] 了解如果密钥泄露时的应急处理流程
- [ ] 定期监控API使用情况和费用

### 应急处理

如果怀疑任何密钥泄露：

1. **立即操作**
   - 登录币安账户，撤销可疑的API密钥
   - 撤销AI翻译服务的API密钥
   - 检查账户异常活动和费用支出

2. **后续操作**
   - 生成新的API密钥
   - 更新 `.env` 文件
   - 审查代码和日志
   - 检查是否有异常的API调用记录

## 📈 性能优化

### 系统性能监控

```bash
# 查看容器资源使用
docker stats bn-bot

# 查看系统资源
free -h
df -h

# 检查数据库性能
sqlite3 data/announcements.db "SELECT COUNT(*) FROM announcements;"
```

### Docker资源优化

服务已配置合理的资源限制：

```yaml
# 在docker-compose.yml中
deploy:
  resources:
    limits:
      memory: 256M
      cpus: '0.25'
    reservations:
      memory: 128M
      cpus: '0.1'
```

### Node.js调优

```bash
# 内存优化
NODE_OPTIONS="--max-old-space-size=512 --gc-interval=100"

# 事件循环监控
NODE_OPTIONS="--trace-warnings"
```

### 数据库优化

```sql
-- SQLite优化设置
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
PRAGMA temp_store = memory;

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_announcements_catalog_publish 
ON announcements(catalog_id, publish_date);
```

### AI翻译性能优化

- 设置合理的超时时间（`AI_TIMEOUT=15000`）
- 控制并发翻译请求数量
- 启用长文本截断以控制成本
- 监控翻译成功率和响应时间

### 日志管理

```bash
# 日志文件位置
./logs/
├── application.log      # 应用日志
└── error.log           # 错误日志

# 清理日志
npm run logs:clean

# 清理旧日志（7天以上）
find logs/ -name "*.log" -mtime +7 -delete
```

### 数据维护

```bash
# 备份数据
tar -czf backup-$(date +%Y%m%d).tar.gz logs/ data/

# 数据库清理（30天以上数据）
sqlite3 data/announcements.db "DELETE FROM announcements WHERE created_at < datetime('now', '-30 days');"
```

---

**⚠️ 重要提醒**：请妥善保管您的API密钥，确保不要将敏感信息提交到公开仓库。使用.env文件管理配置，并将其添加到.gitignore中。

**📞 技术支持**：
- 📖 查看项目文档和配置
- 🐛 GitHub Issues提交问题
- 💬 查看系统日志排查问题
