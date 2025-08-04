# 🚀 ClawCloud Run 部署指南

> 币安公告转发系统 - 云原生部署方案

## 📋 部署概述

本指南将帮助您将币安公告转发系统部署到 ClawCloud Run 平台。该系统支持：
- 🔗 24小时WebSocket连接管理
- 🤖 AI智能翻译（英文→中文）
- 📱 多渠道通知（Telegram + ShowDoc）
- 📊 Web管理界面
- 🛡️ 企业级安全配置

## 🎯 部署前准备

### 1. ClawCloud Run 账户要求
- ✅ GitHub账户（需180天以上历史）
- ✅ 无需信用卡
- ✅ 每月$5免费额度

### 2. Docker镜像
已准备好的镜像：`ghcr.io/username/binance-announcement-bot:latest`

> 💡 使用GitHub Container Registry，更稳定可靠
> ⚠️ 请将`username`替换为实际的GitHub用户名

### 3. 必需的API密钥
- 币安API密钥和秘钥（仅需读取权限）
- Telegram Bot Token（可选）
- ShowDoc推送URL（可选）
- AI翻译API密钥（可选）

## ⚠️ 安全提醒

### 🔐 API密钥安全
- **绝不在代码或日志中暴露API密钥**
- **使用环境变量管理所有敏感信息**
- **定期轮换币安和AI翻译API密钥**
- **设置币安API IP白名单限制访问**
- **监控API使用情况，发现异常立即更换密钥**
- **选择可信的AI翻译服务提供商**

### 🛡️ 部署安全
- 应用将暴露在公网，确保没有敏感操作端点
- Web管理界面建议在生产环境增加身份验证
- 定期检查ClawCloud Run访问日志和安全更新
- 定期备份重要数据和配置

## 🚀 一键部署步骤

### 第一步：访问ClawCloud Run
1. 访问 [run.claw.cloud](https://run.claw.cloud)
2. 使用GitHub账户登录
3. 点击 "App Launchpad" → "Create App"

### 第二步：应用配置
```
应用名称: binance-announcement-bot
镜像源: 公共镜像
镜像地址: ghcr.io/username/binance-announcement-bot:latest
```

> ⚠️ **重要**: 将`username`替换为实际的GitHub用户名

### 第三步：资源配置
**推荐配置**：
- 部署模式: 固定实例模式
- 实例数量: 1
- CPU: 0.25 Core
- 内存: 256MB
- 存储: 1GB（用于日志和数据库）

### 第四步：网络配置
- 暴露端口: `5010`
- 公网访问: 启用
- 自定义域名: 可选

### 第五步：环境变量配置

#### 必需配置
```env
# 币安API配置
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_API_SECRET=your_binance_api_secret_here

# 系统配置
NODE_ENV=production
PORT=5010
LOG_LEVEL=info
```

#### Telegram通知（可选）
```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

#### ShowDoc推送（可选）
支持单用户和多用户两种模式：

**多用户推送（推荐）**：
```env
SHOWDOC_ENABLED=true
SHOWDOC_RECIPIENTS={"用户A":"https://push.showdoc.com.cn/server/api/push/token1","用户B":"https://push.showdoc.com.cn/server/api/push/token2"}
SHOWDOC_MAX_CONCURRENT=3
```

**单用户推送**：
```env
SHOWDOC_ENABLED=true
SHOWDOC_PUSH_URL=https://push.showdoc.com.cn/server/api/push/your_token
```

#### AI翻译（可选）
```env
AI_TRANSLATION_ENABLED=true
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://your-api-endpoint.com/v1
AI_API_KEY=your_ai_api_key
AI_MODEL=your_ai_model
AI_TRANSLATION_MODE=both
AI_TIMEOUT=15000
AI_RETRY_ATTEMPTS=2
AI_MAX_TOKENS=1000
```

#### 消息过滤（可选）
```env
FILTER_CATEGORIES=
FILTER_KEYWORDS=
EXCLUDE_KEYWORDS=
```

### 第六步：存储配置
配置持久化存储卷：
- 路径: `/app/logs` → 挂载为持久卷
- 路径: `/app/data` → 挂载为持久卷

### 第七步：完成部署
1. 检查所有配置
2. 点击"部署应用"
3. 等待部署完成（约2-3分钟）

## 🔍 部署验证

### 1. 健康检查
访问：`https://your-app.clawcloudrun.com/health`

期望返回：
```json
{
  "status": "ok",
  "uptime": 12345,
  "websocket": true,
  "timestamp": "2025-07-31T..."
}
```

### 2. 系统状态
访问：`https://your-app.clawcloudrun.com/status`

确认：
- ✅ WebSocket连接正常
- ✅ AI翻译服务状态
- ✅ 通知渠道配置

### 3. Web管理界面
访问：`https://your-app.clawcloudrun.com/dashboard`

功能验证：
- 📊 实时统计显示
- 📋 公告列表加载
- 🔄 转发状态监控
- 🤖 AI翻译状态

### 4. 测试通知
```bash
curl -X POST https://your-app.clawcloudrun.com/test
```

## 📊 监控和维护

### 实时监控
- **系统状态**: `/status` 端点
- **健康检查**: `/health` 端点  
- **统计信息**: `/stats` 端点
- **管理界面**: `/dashboard` 页面

### 日志查看
在ClawCloud Run控制台中：
1. 进入应用详情
2. 查看"日志"标签
3. 实时监控应用运行状态

### 资源监控
- CPU使用率
- 内存占用
- 网络流量
- 存储使用

## 💰 成本预估

**基础配置成本**：
- CPU 0.25C + 内存 256MB
- 预估每月: $3-4
- 免费额度: $5/月
- **结论**: 完全在免费范围内

## 🔧 高级配置

### 自动扩缩容
切换到弹性模式：
- 最小实例: 1
- 最大实例: 3
- CPU阈值: 70%
- 内存阈值: 80%

### 自定义域名
1. 在DNS中配置CNAME
2. 在ClawCloud Run中绑定域名
3. 自动配置SSL证书

### 备份策略
定期备份重要数据：
- SQLite数据库文件
- 应用日志
- 配置备份

## ⚠️ 重要注意事项

### 安全配置
1. **API密钥安全**
   - 所有密钥通过环境变量配置
   - 定期轮换API密钥
   - 监控异常API调用

2. **网络安全**
   - 仅暴露必要端口(5010)
   - 考虑配置访问控制
   - 定期检查安全更新

3. **数据安全**
   - 配置数据备份
   - 监控存储使用情况
   - 定期清理旧日志

### 故障排除
1. **WebSocket连接失败**
   - 检查币安API密钥权限
   - 验证网络连通性
   - 查看应用日志

2. **通知发送失败**
   - 验证Telegram/ShowDoc配置
   - 检查网络访问权限
   - 确认API Token有效性

3. **AI翻译失败**
   - 检查AI API密钥
   - 验证端点可达性
   - 查看翻译错误日志

## 📞 技术支持

- 📖 项目文档: 查看README.md
- 🐛 问题反馈: GitHub Issues
- 💬 查看日志: ClawCloud Run控制台

---

🎉 **恭喜！** 您的币安公告转发系统已成功部署到云端，享受7x24小时稳定服务！