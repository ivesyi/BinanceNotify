const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs').promises;
const Logger = require('../utils/logger');
const configManager = require('../core/config-manager');

class DatabaseService {
    constructor() {
        this.config = configManager.getDatabaseConfig();
        this.logger = new Logger();
        this.db = null;
        this.isConnected = false;
        this.enabled = true; // 默认启用数据库

        // 初始化数据库服务
        this.logger.info('📄 正在初始化数据库服务...');
        this.initializeDatabase();
    }

    async initializeDatabase() {
        try {
            // 确保数据目录存在
            const dbDir = path.dirname(this.config.path);
            await fs.mkdir(dbDir, { recursive: true });

            // 连接到数据库（使用Promise包装以确保连接完成）
            await new Promise((resolve, reject) => {
                this.db = new sqlite3.Database(this.config.path, (err) => {
                    if (err) {
                        this.logger.error('数据库连接失败:', err);
                        this.enabled = false;
                        reject(err);
                        return;
                    }
                    
                    this.logger.info(`✅ 数据库连接成功: ${this.config.path}`);
                    this.isConnected = true;
                    resolve();
                });
            });

            // 启用外键约束
            await this.runQuery('PRAGMA foreign_keys = ON');

            // 创建表结构
            await this.createTables();

            // 设置定期清理任务
            this.scheduleCleanup();

            this.logger.info('✅ 数据库服务启动成功');

        } catch (error) {
            this.logger.error('❌ 数据库初始化失败，系统将以内存模式运行:', error);
            this.enabled = false;
        }
    }

    async createTables() {
        const queries = [
            // 公告表
            `CREATE TABLE IF NOT EXISTS announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT UNIQUE NOT NULL,
                catalog_id INTEGER,
                catalog_name TEXT,
                title TEXT NOT NULL,
                body TEXT,
                disclaimer TEXT,
                publish_date INTEGER NOT NULL,
                received_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                processed BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // 通知记录表
            `CREATE TABLE IF NOT EXISTS notification_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message_id TEXT NOT NULL,
                notifier_name TEXT NOT NULL,
                recipient_name TEXT,
                success BOOLEAN NOT NULL,
                error_message TEXT,
                response_data TEXT,
                sent_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (message_id) REFERENCES announcements (message_id)
            )`,

            // 系统状态表
            `CREATE TABLE IF NOT EXISTS system_status (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                component TEXT NOT NULL,
                status TEXT NOT NULL,
                details TEXT,
                updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // 统计信息表
            `CREATE TABLE IF NOT EXISTS statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                announcements_received INTEGER DEFAULT 0,
                announcements_processed INTEGER DEFAULT 0,
                notifications_sent INTEGER DEFAULT 0,
                notifications_failed INTEGER DEFAULT 0,
                websocket_reconnects INTEGER DEFAULT 0,
                uptime_seconds INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(date)
            )`
        ];

        for (const query of queries) {
            await this.runQuery(query);
        }

        // 创建索引
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_announcements_publish_date ON announcements (publish_date)',
            'CREATE INDEX IF NOT EXISTS idx_announcements_message_id ON announcements (message_id)',
            'CREATE INDEX IF NOT EXISTS idx_notification_logs_message_id ON notification_logs (message_id)',
            'CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON notification_logs (sent_at)',
            'CREATE INDEX IF NOT EXISTS idx_system_status_component ON system_status (component)',
            'CREATE INDEX IF NOT EXISTS idx_statistics_date ON statistics (date)'
        ];

        for (const index of indexes) {
            await this.runQuery(index);
        }

        // 数据库迁移：检查并添加缺失的列
        await this.performMigrations();
    }

    async performMigrations() {
        try {
            // 检查 notification_logs 表是否有 recipient_name 列
            const tableInfo = await this.getAllQuery("PRAGMA table_info(notification_logs)");
            const hasRecipientName = tableInfo.some(column => column.name === 'recipient_name');
            
            if (!hasRecipientName) {
                this.logger.info('🔄 执行数据库迁移: 添加 recipient_name 字段');
                await this.runQuery('ALTER TABLE notification_logs ADD COLUMN recipient_name TEXT');
                this.logger.info('✅ 数据库迁移完成');
            }
        } catch (error) {
            this.logger.error('数据库迁移失败:', error);
            throw error;
        }
    }

    async runQuery(sql, params = []) {
        if (!this.enabled) {
            return { lastID: null, changes: 0 };
        }
        
        if (!this.isConnected) {
            throw new Error('数据库未连接');
        }

        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    async getQuery(sql, params = []) {
        if (!this.enabled) {
            return null;
        }
        
        if (!this.isConnected) {
            throw new Error('数据库未连接或已禁用');
        }

        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    async getAllQuery(sql, params = []) {
        if (!this.enabled || !this.isConnected) {
            throw new Error('数据库未连接或已禁用');
        }

        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async messageExists(messageId) {
        if (!this.enabled) {
            return false; // 禁用时总是返回false，允许所有消息通过
        }

        try {
            const result = await this.getQuery(`
                SELECT COUNT(*) as count FROM announcements WHERE message_id = ?
            `, [messageId]);
            
            return result && result.count > 0;
        } catch (error) {
            this.logger.error('检查消息重复失败:', error);
            return false;
        }
    }

    async saveAnnouncement(announcement, messageId) {
        if (!this.enabled) {
            return { success: false, reason: 'disabled' };
        }

        try {
            const result = await this.runQuery(`
                INSERT OR REPLACE INTO announcements 
                (message_id, catalog_id, catalog_name, title, body, disclaimer, publish_date, received_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                messageId,
                announcement.catalogId,
                announcement.catalogName,
                announcement.title,
                announcement.body,
                announcement.disclaimer,
                announcement.publishDate,
                Date.now()
            ]);

            this.logger.info(`公告已保存到数据库: ${messageId}`);
            return { success: true, id: result.lastID };

        } catch (error) {
            this.logger.error('保存公告失败:', error);
            return { success: false, error: error.message };
        }
    }

    async markAnnouncementProcessed(messageId) {
        if (!this.enabled) {
            return { success: false, reason: 'disabled' };
        }

        try {
            const result = await this.runQuery(`
                UPDATE announcements SET processed = 1 WHERE message_id = ?
            `, [messageId]);

            this.logger.info(`公告已标记为已处理: ${messageId}`);
            return { success: true, changes: result.changes };

        } catch (error) {
            this.logger.error('标记公告已处理失败:', error);
            return { success: false, error: error.message };
        }
    }

    async logNotification(messageId, notifierName, success, errorMessage = null, responseData = null, recipientName = null) {
        if (!this.enabled) {
            return { success: false, reason: 'disabled' };
        }

        try {
            await this.runQuery(`
                INSERT INTO notification_logs 
                (message_id, notifier_name, recipient_name, success, error_message, response_data, sent_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                messageId,
                notifierName,
                recipientName,
                success,
                errorMessage,
                responseData ? JSON.stringify(responseData) : null,
                Date.now()
            ]);

            return { success: true };

        } catch (error) {
            this.logger.error('记录通知日志失败:', error);
            return { success: false, error: error.message };
        }
    }

    async updateSystemStatus(component, status, details = null) {
        if (!this.enabled) {
            return { success: false, reason: 'disabled' };
        }

        try {
            await this.runQuery(`
                INSERT OR REPLACE INTO system_status 
                (component, status, details, updated_at)
                VALUES (?, ?, ?, ?)
            `, [component, status, details ? JSON.stringify(details) : null, Date.now()]);

            return { success: true };

        } catch (error) {
            this.logger.error('更新系统状态失败:', error);
            return { success: false, error: error.message };
        }
    }

    async updateDailyStatistics(stats) {
        if (!this.enabled) {
            return { success: false, reason: 'disabled' };
        }

        try {
            const today = new Date().toISOString().split('T')[0];
            
            await this.runQuery(`
                INSERT OR REPLACE INTO statistics 
                (date, announcements_received, announcements_processed, notifications_sent, 
                 notifications_failed, websocket_reconnects, uptime_seconds)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                today,
                stats.announcementsReceived || 0,
                stats.announcementsProcessed || 0,
                stats.notificationsSent || 0,
                stats.notificationsFailed || 0,
                stats.websocketReconnects || 0,
                stats.uptimeSeconds || 0
            ]);

            return { success: true };

        } catch (error) {
            this.logger.error('更新统计信息失败:', error);
            return { success: false, error: error.message };
        }
    }

    async getRecentAnnouncements(limit = 50) {
        if (!this.enabled) {
            return [];
        }

        try {
            const rows = await this.getAllQuery(`
                SELECT * FROM announcements 
                ORDER BY publish_date DESC 
                LIMIT ?
            `, [limit]);

            return rows;

        } catch (error) {
            this.logger.error('获取最近公告失败:', error);
            return [];
        }
    }

    async getAnnouncementsByDateRange(startDate, endDate) {
        if (!this.enabled) {
            return [];
        }

        try {
            const rows = await this.getAllQuery(`
                SELECT * FROM announcements 
                WHERE publish_date BETWEEN ? AND ?
                ORDER BY publish_date DESC
            `, [startDate, endDate]);

            return rows;

        } catch (error) {
            this.logger.error('按日期范围获取公告失败:', error);
            return [];
        }
    }

    async getNotificationStats(days = 7) {
        if (!this.enabled) {
            return {};
        }

        try {
            const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            
            const stats = await this.getQuery(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN success = 1 THEN 1 END) as successful,
                    COUNT(CASE WHEN success = 0 THEN 1 END) as failed,
                    COUNT(DISTINCT notifier_name) as notifiers
                FROM notification_logs 
                WHERE sent_at >= ?
            `, [cutoffTime]);

            const byNotifier = await this.getAllQuery(`
                SELECT 
                    notifier_name,
                    COUNT(*) as total,
                    COUNT(CASE WHEN success = 1 THEN 1 END) as successful,
                    COUNT(CASE WHEN success = 0 THEN 1 END) as failed
                FROM notification_logs 
                WHERE sent_at >= ?
                GROUP BY notifier_name
            `, [cutoffTime]);

            return { overall: stats, byNotifier };

        } catch (error) {
            this.logger.error('获取通知统计失败:', error);
            return {};
        }
    }

    async getSystemHealth() {
        if (!this.enabled) {
            return { healthy: false, reason: 'disabled' };
        }

        try {
            const statuses = await this.getAllQuery(`
                SELECT component, status, details, updated_at
                FROM system_status
                ORDER BY updated_at DESC
            `);

            const dbStats = await this.getQuery(`
                SELECT 
                    (SELECT COUNT(*) FROM announcements) as total_announcements,
                    (SELECT COUNT(*) FROM notification_logs) as total_notifications,
                    (SELECT COUNT(*) FROM system_status) as status_records
            `);

            return {
                healthy: true,
                componentStatuses: statuses,
                databaseStats: dbStats,
                lastCheck: new Date()
            };

        } catch (error) {
            this.logger.error('获取系统健康状态失败:', error);
            return { healthy: false, error: error.message };
        }
    }

    async cleanupOldData() {
        if (!this.enabled) {
            return { success: false, reason: 'disabled' };
        }

        try {
            const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
            
            // 清理旧公告
            const announcementResult = await this.runQuery(`
                DELETE FROM announcements 
                WHERE received_at < ?
            `, [cutoffTime]);

            // 清理旧的通知日志
            const notificationResult = await this.runQuery(`
                DELETE FROM notification_logs 
                WHERE sent_at < ?
            `, [cutoffTime]);

            // 清理旧的系统状态（保留最新的每个组件状态）
            await this.runQuery(`
                DELETE FROM system_status 
                WHERE id NOT IN (
                    SELECT MAX(id) 
                    FROM system_status 
                    GROUP BY component
                ) AND updated_at < ?
            `, [cutoffTime]);

            this.logger.info(`数据清理完成: 删除了 ${announcementResult.changes} 条公告记录, ${notificationResult.changes} 条通知记录`);
            
            return { 
                success: true, 
                deleted: {
                    announcements: announcementResult.changes,
                    notifications: notificationResult.changes
                }
            };

        } catch (error) {
            this.logger.error('数据清理失败:', error);
            return { success: false, error: error.message };
        }
    }

    scheduleCleanup() {
        // 每天凌晨2点执行清理
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(2, 0, 0, 0);
        
        const msUntilCleanup = tomorrow.getTime() - now.getTime();
        
        setTimeout(() => {
            this.cleanupOldData();
            
            // 设置每24小时执行一次
            setInterval(() => {
                this.cleanupOldData();
            }, 24 * 60 * 60 * 1000);
            
        }, msUntilCleanup);

        this.logger.info(`数据清理任务已安排，将在 ${tomorrow.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 执行`);
    }

    async exportData(startDate, endDate, format = 'json') {
        if (!this.enabled) {
            return { success: false, reason: 'disabled' };
        }

        try {
            const announcements = await this.getAnnouncementsByDateRange(startDate, endDate);
            
            const notifications = await this.getAllQuery(`
                SELECT nl.*, a.title 
                FROM notification_logs nl
                JOIN announcements a ON nl.message_id = a.message_id
                WHERE nl.sent_at BETWEEN ? AND ?
                ORDER BY nl.sent_at DESC
            `, [startDate, endDate]);

            const data = {
                exportDate: new Date().toISOString(),
                dateRange: { startDate, endDate },
                announcements,
                notifications,
                summary: {
                    totalAnnouncements: announcements.length,
                    totalNotifications: notifications.length
                }
            };

            if (format === 'json') {
                return { success: true, data: JSON.stringify(data, null, 2) };
            } else {
                // 可以扩展支持其他格式
                return { success: false, error: '不支持的导出格式' };
            }

        } catch (error) {
            this.logger.error('数据导出失败:', error);
            return { success: false, error: error.message };
        }
    }

    getStatus() {
        return {
            enabled: this.enabled,
            connected: this.isConnected,
            path: this.config.path,
            retentionDays: this.config.retentionDays,
            type: this.config.type
        };
    }

    // === 公告管理页面专用方法 ===

    /**
     * 获取公告列表和关联的通知记录（支持分页）
     */
    async getAnnouncementsWithNotifications(limit = 20, offset = 0) {
        if (!this.enabled) {
            return { announcements: [], total: 0 };
        }

        try {
            // 获取总数
            const countResult = await this.getQuery('SELECT COUNT(*) as total FROM announcements');
            const total = countResult ? countResult.total : 0;

            // 获取公告列表
            const announcements = await this.getAllQuery(`
                SELECT 
                    a.id,
                    a.message_id,
                    a.catalog_id,
                    a.catalog_name,
                    a.title,
                    a.body,
                    a.disclaimer,
                    a.publish_date,
                    a.received_at,
                    a.processed,
                    a.created_at
                FROM announcements a
                ORDER BY a.publish_date DESC
                LIMIT ? OFFSET ?
            `, [limit, offset]);

            // 为每个公告获取通知记录
            for (let announcement of announcements) {
                const notifications = await this.getAllQuery(`
                    SELECT 
                        notifier_name as channel,
                        recipient_name,
                        success,
                        error_message,
                        sent_at
                    FROM notification_logs 
                    WHERE message_id = ?
                    ORDER BY sent_at DESC
                `, [announcement.message_id]);

                // 格式化时间
                announcement.publish_date_formatted = new Date(announcement.publish_date).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });

                announcement.received_at_formatted = new Date(announcement.received_at).toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });

                announcement.notifications = notifications;
            }

            return { announcements, total };

        } catch (error) {
            this.logger.error('获取公告和通知记录失败:', error);
            return { announcements: [], total: 0 };
        }
    }

    /**
     * 获取单个公告的详细信息
     */
    async getAnnouncementDetails(messageId) {
        if (!this.enabled) {
            return null;
        }

        try {
            const announcement = await this.getQuery(`
                SELECT * FROM announcements WHERE message_id = ?
            `, [messageId]);

            if (!announcement) {
                return null;
            }

            const notifications = await this.getAllQuery(`
                SELECT 
                    notifier_name as channel,
                    recipient_name,
                    success,
                    error_message,
                    response_data,
                    sent_at
                FROM notification_logs 
                WHERE message_id = ?
                ORDER BY sent_at DESC
            `, [messageId]);

            return { ...announcement, notifications };

        } catch (error) {
            this.logger.error('获取公告详情失败:', error);
            return null;
        }
    }

    /**
     * 获取转发统计信息
     */
    async getDashboardStats() {
        if (!this.enabled) {
            return {};
        }

        try {
            // 总公告数
            const totalResult = await this.getQuery('SELECT COUNT(*) as count FROM announcements');
            const totalAnnouncements = totalResult ? totalResult.count : 0;

            // 已处理公告数
            const processedResult = await this.getQuery('SELECT COUNT(*) as count FROM announcements WHERE processed = 1');
            const processedAnnouncements = processedResult ? processedResult.count : 0;

            // 通知统计
            const notificationResult = await this.getQuery(`
                SELECT 
                    COUNT(*) as total,
                    COUNT(CASE WHEN success = 1 THEN 1 END) as successful,
                    COUNT(CASE WHEN success = 0 THEN 1 END) as failed
                FROM notification_logs
            `);

            // 按通道统计
            const channelStats = await this.getAllQuery(`
                SELECT 
                    notifier_name as channel,
                    COUNT(*) as total,
                    COUNT(CASE WHEN success = 1 THEN 1 END) as successful,
                    COUNT(CASE WHEN success = 0 THEN 1 END) as failed
                FROM notification_logs 
                GROUP BY notifier_name
                ORDER BY total DESC
            `);

            // 最近24小时统计
            const last24h = Date.now() - (24 * 60 * 60 * 1000);
            const recent24hResult = await this.getQuery(`
                SELECT COUNT(*) as count FROM announcements WHERE received_at >= ?
            `, [last24h]);

            return {
                totalAnnouncements,
                processedAnnouncements,
                unprocessedAnnouncements: totalAnnouncements - processedAnnouncements,
                notifications: notificationResult || { total: 0, successful: 0, failed: 0 },
                channelStats,
                recent24h: recent24hResult ? recent24hResult.count : 0
            };

        } catch (error) {
            this.logger.error('获取仪表板统计失败:', error);
            return {};
        }
    }

    async close() {
        if (this.db && this.isConnected) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        this.logger.error('关闭数据库连接失败:', err);
                    } else {
                        this.logger.info('数据库连接已关闭');
                    }
                    this.isConnected = false;
                    resolve();
                });
            });
        }
    }
}

module.exports = DatabaseService;