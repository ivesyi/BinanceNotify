const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ConfigManager {
    constructor() {
        this.config = {};
        this.loadConfig();
    }

    loadConfig() {
        // 从环境变量加载
        this.config = {
            // 币安配置
            binance: {
                apiKey: process.env.BINANCE_API_KEY,
                apiSecret: process.env.BINANCE_API_SECRET,
                wsUrl: 'wss://api.binance.com/sapi/wss',
                topic: 'com_announcement_en',
                recvWindow: 5000,
                reconnectInterval: 5000,
                maxReconnectAttempts: 5,
                connectionLifetime: 24 * 60 * 60 * 1000 - 60000 // 24小时减1分钟
            },

            // Telegram配置
            telegram: {
                botToken: process.env.TELEGRAM_BOT_TOKEN,
                chatId: process.env.TELEGRAM_CHAT_ID,
                enabled: process.env.TELEGRAM_ENABLED === 'true',
                messageTemplate: '🔔 *币安公告*\n\n*{title}*\n\n{body}',
                retryAttempts: 3,
                retryDelay: 1000
            },

            // ShowDoc推送配置
            showdoc: {
                pushUrl: process.env.SHOWDOC_PUSH_URL,
                enabled: process.env.SHOWDOC_ENABLED === 'true',
                recipients: this.parseRecipients(process.env.SHOWDOC_RECIPIENTS),
                maxConcurrent: parseInt(process.env.SHOWDOC_MAX_CONCURRENT) || 3,
                messageTemplate: '【币安公告】{title}: {body}',
                retryAttempts: 3,
                retryDelay: 1000
            },

            // Twitter 推送配置
            twitter: {
                enabled: process.env.TWITTER_ENABLED === 'true',
                appKey: process.env.TWITTER_APP_KEY,
                appSecret: process.env.TWITTER_APP_SECRET,
                accessToken: process.env.TWITTER_ACCESS_TOKEN,
                accessSecret: process.env.TWITTER_ACCESS_SECRET,
                messageTemplate: '【币安公告速报】\n标题：{title}\n分类：{catalogName}\n打金系数：{goldScore}/100\n{goldTips}\n发布时间：{publishTime}',
                minGoldScore: parseInt(process.env.TWITTER_MIN_GOLD_SCORE) || 60,
                retryAttempts: parseInt(process.env.TWITTER_RETRY_ATTEMPTS) || 3,
                retryDelay: parseInt(process.env.TWITTER_RETRY_DELAY) || 1000
            },

            // 数据库配置
            database: {
                path: process.env.DATABASE_PATH || process.env.DB_PATH || path.join(__dirname, '../../data/announcements.db'),
                maxConnections: 10,
                busyTimeout: 5000,
                retentionDays: parseInt(process.env.DB_RETENTION_DAYS) || 30,
                type: 'sqlite'
            },

            // 系统配置
            system: {
                logLevel: process.env.LOG_LEVEL || 'info',
                logPath: process.env.LOG_PATH || path.join(__dirname, '../../logs'),
                dataPath: process.env.DATA_PATH || path.join(__dirname, '../../data'),
                healthCheckInterval: 30000,
                rateLimitWindow: 60000,
                rateLimitMax: 100
            },

            // 过滤器配置
            filters: {
                enabledCategories: this.parseArray(process.env.FILTER_CATEGORIES),
                enabledKeywords: this.parseArray(process.env.FILTER_KEYWORDS),
                excludeKeywords: this.parseArray(process.env.EXCLUDE_KEYWORDS),
                excludeCategories: this.parseArray(process.env.EXCLUDE_CATEGORIES),
                minTitleLength: parseInt(process.env.MIN_TITLE_LENGTH) || 5,
                maxBodyLength: parseInt(process.env.MAX_BODY_LENGTH) || 5000
            },

            // 监控配置
            monitoring: {
                enabled: process.env.MONITORING_ENABLED === 'true',
                metricsPort: parseInt(process.env.METRICS_PORT) || 9090,
                alertWebhook: process.env.ALERT_WEBHOOK,
                healthEndpoint: '/health',
                metricsEndpoint: '/metrics'
            },

            // AI翻译配置
            ai: {
                enabled: process.env.AI_TRANSLATION_ENABLED === 'true',
                provider: process.env.AI_PROVIDER || 'anthropic',
                apiKey: process.env.ANTHROPIC_API_KEY,
                customConfig: {
                    baseURL: process.env.AI_BASE_URL,
                    apiKey: process.env.AI_API_KEY,
                    headers: this.parseHeaders(process.env.AI_CUSTOM_HEADERS)
                },
                model: process.env.AI_MODEL || 'claude-3-haiku-20240307',
                translationMode: process.env.AI_TRANSLATION_MODE || 'both',
                timeout: parseInt(process.env.AI_TIMEOUT) || 15000,
                retryAttempts: parseInt(process.env.AI_RETRY_ATTEMPTS) || 2,
                maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 1000
            }
        };

        this.validateConfig();
    }

    parseRecipients(value) {
        if (!value) return {};
        try {
            return JSON.parse(value);
        } catch (error) {
            console.warn('SHOWDOC_RECIPIENTS格式错误，应为JSON格式:', error.message);
            return {};
        }
    }

    parseArray(value) {
        if (!value) return [];
        return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
    }

    parseHeaders(value) {
        if (!value) return {};
        try {
            return JSON.parse(value);
        } catch (error) {
            console.warn('AI_CUSTOM_HEADERS格式错误，应为JSON格式:', error.message);
            return {};
        }
    }

    validateConfig() {
        const required = {
            'BINANCE_API_KEY': this.config.binance.apiKey,
            'BINANCE_API_SECRET': this.config.binance.apiSecret
        };

        for (const [key, value] of Object.entries(required)) {
            if (!value) {
                throw new Error(`Missing required environment variable: ${key}`);
            }
        }

        // 验证通知渠道至少启用一个
        const notificationEnabled = this.config.telegram.enabled || 
                                  this.config.showdoc.enabled ||
                                  this.config.twitter.enabled;
        
        if (!notificationEnabled) {
            console.warn('⚠️  Warning: No notification channels enabled!');
        }

        // 验证Telegram配置
        if (this.config.telegram.enabled) {
            if (!this.config.telegram.botToken || !this.config.telegram.chatId) {
                throw new Error('Telegram enabled but missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
            }
        }

        // 验证ShowDoc配置
        if (this.config.showdoc.enabled) {
            const hasOldConfig = this.config.showdoc.pushUrl;
            const hasNewConfig = this.config.showdoc.recipients && Object.keys(this.config.showdoc.recipients).length > 0;
            
            if (!hasOldConfig && !hasNewConfig) {
                throw new Error('ShowDoc enabled but missing SHOWDOC_PUSH_URL or SHOWDOC_RECIPIENTS');
            }
        }

        // 验证Twitter配置
        if (this.config.twitter.enabled) {
            const t = this.config.twitter;
            const missing = [];
            if (!t.appKey) missing.push('TWITTER_APP_KEY');
            if (!t.appSecret) missing.push('TWITTER_APP_SECRET');
            if (!t.accessToken) missing.push('TWITTER_ACCESS_TOKEN');
            if (!t.accessSecret) missing.push('TWITTER_ACCESS_SECRET');
            if (missing.length > 0) {
                throw new Error(`Twitter enabled but missing credentials: ${missing.join(', ')}`);
            }
        }

        // 验证AI翻译配置
        if (this.config.ai.enabled) {
            if (this.config.ai.provider === 'anthropic') {
                if (!this.config.ai.apiKey) {
                    throw new Error('AI translation enabled with Anthropic provider but missing ANTHROPIC_API_KEY');
                }
            } else if (this.config.ai.provider === 'custom-anthropic' || this.config.ai.provider === 'openai-compatible') {
                if (!this.config.ai.customConfig.baseURL) {
                    throw new Error('AI translation enabled with custom provider but missing AI_BASE_URL');
                }
                if (!this.config.ai.customConfig.apiKey) {
                    throw new Error('AI translation enabled with custom provider but missing AI_API_KEY');
                }
            } else {
                throw new Error(`Invalid AI_PROVIDER: ${this.config.ai.provider}. Valid values: anthropic, custom-anthropic, openai-compatible`);
            }
            
            const validModes = ['both', 'translated', 'original'];
            if (!validModes.includes(this.config.ai.translationMode)) {
                throw new Error(`Invalid AI_TRANSLATION_MODE: ${this.config.ai.translationMode}. Valid values: ${validModes.join(', ')}`);
            }
        }
    }

    get(path) {
        return path.split('.').reduce((obj, key) => obj && obj[key], this.config);
    }

    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((obj, key) => {
            if (!(key in obj)) obj[key] = {};
            return obj[key];
        }, this.config);
        target[lastKey] = value;
    }

    getSafeConfig() {
        const safeConfig = JSON.parse(JSON.stringify(this.config));
        
        // 脱敏敏感信息
        if (safeConfig.binance.apiKey) {
            safeConfig.binance.apiKey = this.maskSecret(safeConfig.binance.apiKey);
        }
        if (safeConfig.binance.apiSecret) {
            safeConfig.binance.apiSecret = '***MASKED***';
        }
        if (safeConfig.telegram.botToken) {
            safeConfig.telegram.botToken = this.maskSecret(safeConfig.telegram.botToken);
        }
        if (safeConfig.ai.apiKey) {
            safeConfig.ai.apiKey = this.maskSecret(safeConfig.ai.apiKey);
        }
        if (safeConfig.ai.customConfig.apiKey) {
            safeConfig.ai.customConfig.apiKey = this.maskSecret(safeConfig.ai.customConfig.apiKey);
        }

        return safeConfig;
    }

    maskSecret(secret) {
        if (!secret || secret.length < 8) return '***MASKED***';
        return secret.substring(0, 4) + '***' + secret.substring(secret.length - 4);
    }

    // 加密配置存储
    encryptConfig(config, password) {
        const algorithm = 'aes-256-gcm';
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(algorithm, password);
        
        let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    // 解密配置
    decryptConfig(encryptedData, password) {
        const algorithm = 'aes-256-gcm';
        const decipher = crypto.createDecipher(algorithm, password);
        
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
        
        let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return JSON.parse(decrypted);
    }

    // 热重载配置
    reloadConfig() {
        try {
            this.loadConfig();
            console.log('✅ Configuration reloaded successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to reload configuration:', error.message);
            return false;
        }
    }

    // 获取数据库配置
    getDatabaseConfig() {
        return this.config.database;
    }

    // 获取通知配置
    getNotificationConfig() {
        return {
            telegram: this.config.telegram,
            showdoc: this.config.showdoc,
            twitter: this.config.twitter
        };
    }

    // 获取过滤器配置
    getFilterConfig() {
        return this.config.filters;
    }

    // 获取AI翻译配置
    getAIConfig() {
        return this.config.ai;
    }
}

module.exports = new ConfigManager();