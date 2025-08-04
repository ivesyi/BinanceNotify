# Fly.io 部署指南

## 项目概述

币安公告WebSocket实时监听和转发系统已成功部署到Fly.io云平台。本文档详细记录了部署过程、配置要点和管理方法。

## 🚀 快速开始

### 前置要求
- 安装Docker和Fly CLI
- 准备币安API密钥（只需读取权限）
- 准备通知渠道配置（Telegram/ShowDoc等）

### 一键部署
```bash
# 1. 安装Fly CLI
curl -L https://fly.io/install.sh | sh

# 2. 登录Fly.io
flyctl auth login

# 3. 创建应用和部署
flyctl launch
flyctl deploy
```

## ⚠️ 安全提醒

### 🔐 密钥安全
- **绝不在代码中硬编码API密钥**
- **使用Fly.io Secrets管理所有敏感信息**
- **定期轮换API密钥**
- **设置币安API IP白名单限制访问**
- **监控API使用情况，发现异常立即更换密钥**

### 🛡️ 访问控制
- 部署应用URL为公开访问，确保不暴露敏感操作端点
- Web管理界面建议增加身份验证（生产环境）
- 定期检查Fly.io访问日志

## 部署信息

- **应用名称**: `bn-bot`
- **访问地址**: https://bn-bot.fly.dev
- **部署区域**: Sydney (syd)
- **部署时间**: 2025-08-01

## 核心功能验证 ✅

### 1. 应用状态
- **运行状态**: ✅ 正常运行
- **WebSocket连接**: ✅ 已连接币安API
- **心跳机制**: ✅ 每30秒PING/PONG正常

### 2. 服务端点
- **健康检查**: https://bn-bot.fly.dev/health
- **系统状态**: https://bn-bot.fly.dev/status  
- **Web管理界面**: https://bn-bot.fly.dev/dashboard
- **统计信息**: https://bn-bot.fly.dev/stats

### 3. 功能模块
- **AI翻译服务**: ✅ 已启用
- **ShowDoc通知**: ✅ 已配置
- **数据持久化**: ✅ 3GB Volume挂载到 `/app/data`
- **24小时重连**: ✅ 自动重连机制已设置

## 技术架构

### 容器配置
```dockerfile
FROM node:18-alpine
USER bnbot (非root用户)
EXPOSE 5010
CMD ["node", "src/main.js"]
```

### 资源配置
- **内存**: 256MB (免费tier)
- **CPU**: 1 shared core
- **存储**: 3GB 持久化卷
- **网络**: 自动HTTPS

### 环境变量
```toml
[env]
NODE_ENV = "production"
PORT = "5010"
DATABASE_PATH = "/app/data/announcements.db"
LOG_LEVEL = "info"
```

## 部署命令

### 基础命令
```bash
# 安装Fly CLI
curl -L https://fly.io/install.sh | sh

# 登录
flyctl auth login

# 部署应用
flyctl deploy

# 查看状态
flyctl status

# 查看日志
flyctl logs
```

### 管理命令
```bash
# 启动/停止机器
flyctl machine start [MACHINE_ID]
flyctl machine stop [MACHINE_ID]

# 重启应用
flyctl machine restart [MACHINE_ID]

# 查看卷信息
flyctl volumes list

# 扩容卷 (如需要)
flyctl volumes extend [VOLUME_ID] --size-gb 5
```

## 配置详情

### fly.toml 配置文件
```toml
app = 'bn-bot'
primary_region = 'syd'

[http_service]
  internal_port = 5010
  force_https = true
  auto_stop_machines = 'off'  # 保持长连接
  auto_start_machines = true
  min_machines_running = 1

[mounts]
  source = "bn_bot_data"
  destination = "/app/data"

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1
```

### 密钥配置
所有敏感信息通过Fly.io Secrets管理，**绝不在代码中硬编码**：

```bash
# 币安API配置
flyctl secrets set BINANCE_API_KEY=your_binance_api_key
flyctl secrets set BINANCE_API_SECRET=your_binance_secret

# AI翻译配置  
flyctl secrets set AI_TRANSLATION_ENABLED=true
flyctl secrets set AI_API_KEY=your_ai_api_key
flyctl secrets set AI_BASE_URL=your_api_endpoint

# 通知渠道配置
flyctl secrets set SHOWDOC_ENABLED=true
flyctl secrets set SHOWDOC_RECIPIENTS='{"name":"https://push.showdoc.com.cn/..."}'
```

> ⚠️ **安全提示**: 替换示例中的占位符为实际值，确保API密钥具有最小必要权限

## 监控和日志

### 应用监控
```bash
# 实时日志
flyctl logs

# 应用状态
flyctl status

# 机器详情
flyctl machine list
```

### HTTP监控端点
```bash
# 健康检查
curl https://bn-bot.fly.dev/health

# 系统状态
curl https://bn-bot.fly.dev/status

# 统计信息  
curl https://bn-bot.fly.dev/stats
```

### Web管理界面
访问 https://bn-bot.fly.dev/dashboard 查看：
- 📊 实时统计面板
- 🤖 AI翻译监控
- 📋 公告列表管理
- 🔄 转发状态监控

## 故障排除

### 常见问题

1. **应用无法启动**
   ```bash
   flyctl logs  # 查看错误日志
   flyctl machine restart [MACHINE_ID]
   ```

2. **WebSocket连接失败**
   - 检查币安API密钥是否正确
   - 确认网络连接正常
   - 查看实时日志排查

3. **AI翻译不工作**
   - 检查AI_API_KEY是否配置
   - 确认第三方API端点可访问
   - 查看错误日志

4. **数据库问题**
   - 确认Volume正常挂载到 `/app/data`
   - 检查磁盘空间是否充足

### 重新部署
如需重新部署：
```bash
# 强制重新构建
flyctl deploy --no-cache

# 重置机器
flyctl machine destroy [MACHINE_ID]
flyctl deploy
```

## 成本信息

### Fly.io 免费额度
- **机器运行时间**: 2,340小时/月 (约3台24/7运行)
- **出站带宽**: 100GB/月
- **持久卷**: 3GB免费
- **当前使用**: 1台机器 + 3GB卷 (在免费额度内)

### 预计成本
- **基础服务**: $0/月 (免费额度内)
- **超出部分**: 按使用量计费
- **存储扩容**: $0.15/GB/月

## 维护建议

### 定期任务
1. **日志清理**: 系统自动30天清理
2. **数据备份**: 考虑定期备份Volume数据
3. **依赖更新**: 定期更新Node.js依赖
4. **监控检查**: 定期查看系统状态和错误率

### 扩容计划
如需扩容：
1. **增加机器**: `flyctl scale count 2`
2. **升级内存**: 修改fly.toml中的memory配置
3. **扩展存储**: `flyctl volumes extend --size-gb 10`

## 📊 部署总结

✅ **部署成功**: 系统已在Fly.io成功运行  
🌐 **访问地址**: https://bn-bot.fly.dev  
💰 **运行成本**: 免费额度内 ($0/月)  
🔄 **运行状态**: 24小时自动监听和转发  

应用现已准备好监听币安公告、AI智能翻译并自动推送到配置的通知渠道。

---

**文档版本**: v1.0 | **更新时间**: 2025-08-01