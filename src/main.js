#!/usr/bin/env node

require('dotenv').config();

const http = require('http');
const ConfigManager = require('./core/config-manager');
const WebSocketManager = require('./core/websocket-manager');
const MessageRouter = require('./core/message-router');
const DatabaseService = require('./services/database-service');
const Logger = require('./utils/logger');

class BinanceAnnouncementBot {
    constructor() {
        this.logger = new Logger();
        this.config = ConfigManager;
        this.messageRouter = null;
        this.websocketManager = null;
        this.databaseService = null;
        this.httpServer = null;
        this.isRunning = false;
        this.startTime = Date.now();
        
        // 统计信息
        this.stats = {
            messagesReceived: 0,
            messagesProcessed: 0,
            notificationsSent: 0,
            errors: 0,
            lastActivity: null
        };
    }

    async start() {
        try {
            this.logger.info('🚀 启动币安公告转发系统...');
            
            // 初始化组件
            await this.initializeComponents();
            
            // 启动WebSocket连接
            await this.websocketManager.connect();
            
            // 启动HTTP监控服务
            this.startHttpServer();
            
            // 设置优雅关闭
            this.setupGracefulShutdown();
            
            this.isRunning = true;
            this.logger.info('✅ 系统启动完成');
            
        } catch (error) {
            this.logger.error('❌ 系统启动失败:', error);
            process.exit(1);
        }
    }

    async initializeComponents() {
        // 初始化数据库
        this.databaseService = new DatabaseService();
        
        // 初始化消息路由器
        this.messageRouter = new MessageRouter(this.config, this.databaseService);
        await this.messageRouter.initialize();
        
        // 增强消息路由器以支持统计
        const originalRouteMessage = this.messageRouter.routeMessage.bind(this.messageRouter);
        this.messageRouter.routeMessage = async (announcement) => {
            this.stats.messagesReceived++;
            this.stats.lastActivity = new Date();
            
            try {
                const result = await originalRouteMessage(announcement);
                if (result.success) {
                    this.stats.messagesProcessed++;
                    this.stats.notificationsSent++;
                }
                return result;
            } catch (error) {
                this.stats.errors++;
                throw error;
            }
        };
        
        // 初始化WebSocket管理器
        this.websocketManager = new WebSocketManager(this.config, this.messageRouter);
        
        this.logger.info('✅ 组件初始化完成');
    }

    startHttpServer() {
        const port = process.env.HTTP_PORT || 5010;
        
        this.httpServer = http.createServer((req, res) => {
            const url = new URL(req.url, `http://localhost:${port}`);
            const pathname = url.pathname;
            const query = url.searchParams;
            
            // 处理不同的路由
            if (pathname === '/health') {
                res.setHeader('Content-Type', 'application/json');
                res.writeHead(200);
                res.end(JSON.stringify({
                    status: 'ok',
                    uptime: Date.now() - this.startTime,
                    websocket: this.websocketManager?.isConnected || false,
                    timestamp: new Date().toISOString()
                }));
            } else if (pathname === '/status') {
                res.setHeader('Content-Type', 'application/json');
                res.writeHead(200);
                
                // 获取AI翻译服务状态
                const aiTranslationStatus = this.messageRouter?.translationService 
                    ? this.messageRouter.translationService.getStatus()
                    : { enabled: false, provider: 'none' };
                
                res.end(JSON.stringify({
                    system: 'binance-announcement-bot',
                    version: '1.0.0',
                    uptime: this.formatUptime(Date.now() - this.startTime),
                    websocket_connected: this.websocketManager?.isConnected || false,
                    ai_translation: aiTranslationStatus,
                    stats: this.stats,
                    config: this.config.getSafeConfig()
                }));
            } else if (pathname === '/test' && req.method === 'POST') {
                this.testNotifications(res);
            } else if (pathname === '/announcements') {
                this.handleAnnouncementsAPI(req, res, query);
            } else if (pathname === '/announcements/stats') {
                this.handleAnnouncementsStats(res);
            } else if (pathname === '/dashboard') {
                this.serveDashboard(res);
            } else if (pathname === '/dashboard.css') {
                this.serveDashboardCSS(res);
            } else if (pathname === '/') {
                // 重定向到dashboard
                res.writeHead(302, { 'Location': '/dashboard' });
                res.end();
            } else {
                res.setHeader('Content-Type', 'application/json');
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not Found' }));
            }
        });
        
        this.httpServer.listen(port, () => {
            this.logger.info(`📊 HTTP监控服务启动: http://localhost:${port}`);
        });
    }

    async testNotifications(res) {
        try {
            const testMessage = {
                catalogId: 161,
                catalogName: "Test",
                title: "系统测试通知",
                body: "这是一条测试消息，用于验证通知系统是否正常工作。",
                publishDate: Date.now()
            };
            
            await this.messageRouter.routeMessage(testMessage);
            
            res.writeHead(200);
            res.end(JSON.stringify({ 
                success: true, 
                message: '测试通知已发送' 
            }));
        } catch (error) {
            res.writeHead(500);
            res.end(JSON.stringify({ 
                success: false, 
                error: error.message 
            }));
        }
    }

    // === 公告管理API处理方法 ===

    async handleAnnouncementsAPI(req, res, query) {
        try {
            res.setHeader('Content-Type', 'application/json');
            
            const page = parseInt(query.get('page')) || 1;
            const limit = Math.min(parseInt(query.get('limit')) || 20, 100); // 最大100条
            const offset = (page - 1) * limit;
            
            const result = await this.databaseService.getAnnouncementsWithNotifications(limit, offset);
            
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                data: {
                    announcements: result.announcements,
                    pagination: {
                        page,
                        limit,
                        total: result.total,
                        totalPages: Math.ceil(result.total / limit)
                    }
                }
            }));
            
        } catch (error) {
            this.logger.error('处理公告API请求失败:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ 
                success: false, 
                error: error.message 
            }));
        }
    }

    async handleAnnouncementsStats(res) {
        try {
            res.setHeader('Content-Type', 'application/json');
            
            const stats = await this.databaseService.getDashboardStats();
            
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                data: stats
            }));
            
        } catch (error) {
            this.logger.error('处理统计API请求失败:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ 
                success: false, 
                error: error.message 
            }));
        }
    }

    serveDashboard(res) {
        try {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.writeHead(200);
            
            const html = this.getDashboardHTML();
            res.end(html);
            
        } catch (error) {
            this.logger.error('提供Dashboard页面失败:', error);
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    }

    serveDashboardCSS(res) {
        try {
            res.setHeader('Content-Type', 'text/css; charset=utf-8');
            res.writeHead(200);
            
            const css = this.getDashboardCSS();
            res.end(css);
            
        } catch (error) {
            this.logger.error('提供Dashboard CSS失败:', error);
            res.writeHead(500);
            res.end('/* CSS Error */');
        }
    }

    getDashboardHTML() {
        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>币安公告管理系统</title>
    <link rel="stylesheet" href="/dashboard.css">
    <style>
        /* 内联基础样式以防CSS加载失败 */
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .loading { text-align: center; padding: 40px; }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>📢 币安公告管理系统</h1>
            <div class="header-actions">
                <button onclick="refreshData()" class="btn btn-primary">🔄 刷新</button>
                <span class="status-indicator" id="status">●</span>
            </div>
        </header>

        <div class="stats-grid" id="stats">
            <div class="loading">正在加载统计信息...</div>
        </div>

        <div class="main-content">
            <div class="table-header">
                <h2>📋 公告列表</h2>
                <div class="pagination" id="pagination"></div>
            </div>
            
            <div class="announcements-table" id="announcements">
                <div class="loading">正在加载公告数据...</div>
            </div>
        </div>
    </div>

    <script>
        let currentPage = 1;
        const pageSize = 20;

        // 初始化页面
        async function init() {
            await loadStats();
            await loadAnnouncements();
            startStatusCheck();
        }

        // 加载统计信息
        async function loadStats() {
            try {
                const response = await fetch('/announcements/stats');
                const result = await response.json();
                
                if (result.success) {
                    renderStats(result.data);
                }
            } catch (error) {
                console.error('加载统计失败:', error);
            }
        }

        // 加载公告列表
        async function loadAnnouncements(page = 1) {
            try {
                const response = await fetch(\`/announcements?page=\${page}&limit=\${pageSize}\`);
                const result = await response.json();
                
                if (result.success) {
                    renderAnnouncements(result.data.announcements);
                    renderPagination(result.data.pagination);
                    currentPage = page;
                }
            } catch (error) {
                console.error('加载公告失败:', error);
                document.getElementById('announcements').innerHTML = '<div class="error">加载失败</div>';
            }
        }

        // 渲染统计信息
        function renderStats(stats) {
            const html = \`
                <div class="stat-card">
                    <div class="stat-value">\${stats.totalAnnouncements || 0}</div>
                    <div class="stat-label">总公告数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">\${stats.processedAnnouncements || 0}</div>
                    <div class="stat-label">已处理</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">\${stats.notifications?.successful || 0}</div>
                    <div class="stat-label">成功通知</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">\${stats.recent24h || 0}</div>
                    <div class="stat-label">24h新增</div>
                </div>
            \`;
            document.getElementById('stats').innerHTML = html;
        }

        // 渲染公告列表
        function renderAnnouncements(announcements) {
            if (!announcements || announcements.length === 0) {
                document.getElementById('announcements').innerHTML = '<div class="empty">暂无公告数据</div>';
                return;
            }

            const html = \`
                <table class="table">
                    <thead>
                        <tr>
                            <th>标题</th>
                            <th>分类</th>
                            <th>发布时间</th>
                            <th>接收时间</th>
                            <th>转发状态</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${announcements.map(announcement => \`
                            <tr>
                                <td class="title-cell">
                                    <div class="title" title="\${announcement.title}">\${announcement.title}</div>
                                </td>
                                <td>\${announcement.catalog_name || '-'}</td>
                                <td>\${announcement.publish_date_formatted}</td>
                                <td>\${announcement.received_at_formatted}</td>
                                <td>\${renderNotificationStatus(announcement.notifications)}</td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
            document.getElementById('announcements').innerHTML = html;
        }

        // 渲染通知状态
        function renderNotificationStatus(notifications) {
            if (!notifications || notifications.length === 0) {
                return '<span class="status-badge status-pending">未处理</span>';
            }
            
            // 按通道分组通知
            const channelGroups = {};
            notifications.forEach(notif => {
                const channelKey = notif.channel;
                if (!channelGroups[channelKey]) {
                    channelGroups[channelKey] = [];
                }
                channelGroups[channelKey].push(notif);
            });
            
            return Object.entries(channelGroups).map(([channel, notifs]) => {
                const successCount = notifs.filter(n => n.success).length;
                const totalCount = notifs.length;
                const hasFailures = successCount < totalCount;
                
                // 构建详细信息提示
                const details = notifs.map(notif => {
                    const status = notif.success ? '✅' : '❌';
                    const recipientInfo = notif.recipient_name ? \`\${notif.recipient_name}\` : '默认';
                    const errorInfo = notif.success ? '' : \` (\${notif.error_message || '失败'})\`;
                    return \`\${status} \${recipientInfo}\${errorInfo}\`;
                }).join('\\n');
                
                const statusClass = hasFailures ? 'status-error' : 'status-success';
                const statusText = hasFailures ? '⚠️' : '✅';
                const channelText = totalCount > 1 ? \`\${channel}(\${successCount}/\${totalCount})\` : channel;
                
                return \`<span class="status-badge \${statusClass}" title="\${channel} 详情:\\n\${details}">\${statusText} \${channelText}</span>\`;
            }).join(' ');
        }

        // 渲染分页
        function renderPagination(pagination) {
            if (pagination.totalPages <= 1) {
                document.getElementById('pagination').innerHTML = '';
                return;
            }

            let html = '';
            
            // 上一页
            if (pagination.page > 1) {
                html += \`<button onclick="loadAnnouncements(\${pagination.page - 1})" class="btn btn-sm">上一页</button>\`;
            }

            // 页码
            html += \`<span class="page-info">第 \${pagination.page} 页，共 \${pagination.totalPages} 页</span>\`;

            // 下一页
            if (pagination.page < pagination.totalPages) {
                html += \`<button onclick="loadAnnouncements(\${pagination.page + 1})" class="btn btn-sm">下一页</button>\`;
            }

            document.getElementById('pagination').innerHTML = html;
        }

        // 刷新数据
        async function refreshData() {
            await loadStats();
            await loadAnnouncements(currentPage);
        }

        // 状态检查
        async function startStatusCheck() {
            setInterval(async () => {
                try {
                    const response = await fetch('/health');
                    const result = await response.json();
                    const indicator = document.getElementById('status');
                    
                    if (result.status === 'ok' && result.websocket) {
                        indicator.style.color = '#22c55e';
                        indicator.title = '系统正常运行';
                    } else {
                        indicator.style.color = '#f59e0b';
                        indicator.title = 'WebSocket连接异常';
                    }
                } catch (error) {
                    document.getElementById('status').style.color = '#ef4444';
                    document.getElementById('status').title = '系统连接失败';
                }
            }, 30000);
        }

        // 页面加载完成后初始化
        document.addEventListener('DOMContentLoaded', init);
    </script>
</body>
</html>`;
    }

    getDashboardCSS() {
        return `/* 币安公告管理系统样式 */
* {
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    margin: 0;
    padding: 0;
    background-color: #f8fafc;
    color: #1f2937;
    line-height: 1.6;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

/* 头部 */
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.header h1 {
    margin: 0;
    color: #1f2937;
    font-size: 1.8rem;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 15px;
}

.status-indicator {
    font-size: 1.2rem;
    color: #22c55e;
    cursor: help;
}

/* 统计卡片 */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.stat-card {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    text-align: center;
}

.stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #3b82f6;
    margin-bottom: 5px;
}

.stat-label {
    color: #6b7280;
    font-size: 0.9rem;
}

/* 主要内容 */
.main-content {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
}

.table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #e5e7eb;
}

.table-header h2 {
    margin: 0;
    color: #1f2937;
}

/* 表格 */
.table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
}

.table th,
.table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
}

.table th {
    background-color: #f9fafb;
    font-weight: 600;
    color: #374151;
}

.table tbody tr:hover {
    background-color: #f9fafb;
}

.title-cell {
    max-width: 300px;
}

.title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
}

/* 状态标签 */
.status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    margin-right: 4px;
}

.status-success {
    background-color: #dcfce7;
    color: #166534;
}

.status-error {
    background-color: #fee2e2;
    color: #991b1b;
}

.status-pending {
    background-color: #fef3c7;
    color: #92400e;
}

/* 按钮 */
.btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.9rem;
    text-decoration: none;
    display: inline-block;
    transition: all 0.2s;
}

.btn-primary {
    background-color: #3b82f6;
    color: white;
}

.btn-primary:hover {
    background-color: #2563eb;
}

.btn-sm {
    padding: 6px 12px;
    font-size: 0.8rem;
}

/* 分页 */
.pagination {
    display: flex;
    align-items: center;
    gap: 10px;
}

.page-info {
    color: #6b7280;
    font-size: 0.9rem;
}

/* 状态消息 */
.loading, .empty, .error {
    text-align: center;
    padding: 40px;
    color: #6b7280;
}

.error {
    color: #ef4444;
}

/* 响应式设计 */
@media (max-width: 768px) {
    .container {
        padding: 10px;
    }
    
    .header {
        flex-direction: column;
        gap: 15px;
        text-align: center;
    }
    
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .table-header {
        flex-direction: column;
        gap: 15px;
        align-items: stretch;
    }
    
    .table {
        font-size: 0.8rem;
    }
    
    .table th,
    .table td {
        padding: 8px 6px;
    }
    
    .title-cell {
        max-width: 200px;
    }
    
    .pagination {
        justify-content: center;
        flex-wrap: wrap;
    }
}`;
    }

    formatUptime(uptime) {
        const seconds = Math.floor((uptime / 1000) % 60);
        const minutes = Math.floor((uptime / (1000 * 60)) % 60);
        const hours = Math.floor((uptime / (1000 * 60 * 60)) % 24);
        const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
        
        return `${days}天 ${hours}小时 ${minutes}分钟 ${seconds}秒`;
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            this.logger.info(`🛑 接收到${signal}信号，开始优雅关闭...`);
            
            try {
                this.isRunning = false;
                
                if (this.websocketManager) {
                    await this.websocketManager.disconnect();
                }
                
                if (this.databaseService) {
                    await this.databaseService.close();
                }
                
                if (this.httpServer) {
                    this.httpServer.close();
                }
                
                this.logger.info('✅ 系统已优雅关闭');
                process.exit(0);
            } catch (error) {
                this.logger.error('❌ 关闭过程中出现错误:', error);
                process.exit(1);
            }
        };
        
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('uncaughtException', (error) => {
            this.logger.error('❌ 未捕获的异常:', error);
            shutdown('uncaughtException');
        });
        process.on('unhandledRejection', (reason) => {
            this.logger.error('❌ 未处理的Promise拒绝:', reason);
            shutdown('unhandledRejection');
        });
    }
}

// 主函数
async function main() {
    const bot = new BinanceAnnouncementBot();
    await bot.start();
}

// 如果直接运行此文件，则启动系统
if (require.main === module) {
    main();
}

module.exports = BinanceAnnouncementBot;