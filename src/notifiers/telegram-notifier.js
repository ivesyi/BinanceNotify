const TelegramBot = require('node-telegram-bot-api');

class TelegramNotifier {
    constructor(config) {
        this.config = config;
        this.bot = null;
        this.enabled = config.get('telegram.enabled');
        this.botToken = config.get('telegram.botToken');
        this.chatId = config.get('telegram.chatId');
        this.messageTemplate = config.get('telegram.messageTemplate');
        this.retryAttempts = config.get('telegram.retryAttempts') || 3;
        this.retryDelay = config.get('telegram.retryDelay') || 1000;
        
        if (this.enabled) {
            this.initializeBot();
        }
    }

    initializeBot() {
        if (!this.botToken || !this.chatId) {
            throw new Error('Telegram配置不完整: 缺少BOT_TOKEN或CHAT_ID');
        }
        
        this.bot = new TelegramBot(this.botToken, { 
            polling: false,
            request: {
                agentOptions: {
                    keepAlive: true,
                    family: 4
                }
            }
        });
    }

    async sendMessage(announcement) {
        if (!this.enabled || !this.bot) {
            return { success: false, error: 'Telegram通知未启用' };
        }

        try {
            const message = this.formatMessage(announcement);
            
            await this.bot.sendMessage(this.chatId, message, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });

            return { success: true, channel: 'telegram' };
            
        } catch (error) {
            console.error('Telegram发送失败:', error.message);
            return { success: false, error: error.message, channel: 'telegram' };
        }
    }

    async sendWithRetry(announcement) {
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            const result = await this.sendMessage(announcement);
            
            if (result.success) {
                return result;
            }
            
            if (attempt < this.retryAttempts) {
                await this.delay(this.retryDelay * attempt);
            }
        }
        
        return { success: false, error: '重试次数已用尽', channel: 'telegram' };
    }

    formatMessage(announcement) {
        const aiConfig = this.config.getAIConfig();
        const translationMode = aiConfig ? aiConfig.translationMode : 'original';
        
        // 检查是否有翻译内容
        const hasTranslation = announcement.translatedTitle || announcement.translatedBody;
        
        if (hasTranslation && aiConfig && aiConfig.enabled) {
            // 根据翻译模式格式化消息
            switch (translationMode) {
                case 'translated':
                    // 仅显示译文
                    return this.formatTranslatedOnly(announcement);
                    
                case 'both':
                    // 显示原文+译文
                    return this.formatBothLanguages(announcement);
                    
                case 'original':
                default:
                    // 仅显示原文
                    return this.formatOriginalOnly(announcement);
            }
        } else {
            // 没有翻译或翻译未启用，使用原始格式
            return this.formatOriginalOnly(announcement);
        }
    }

    /**
     * 格式化仅译文模式
     */
    formatTranslatedOnly(announcement) {
        // 使用翻译后的内容，如果没有则回退到原文
        const title = announcement.translatedTitle || announcement.title || '';
        const body = announcement.translatedBody || announcement.body || '';
        const disclaimer = announcement.disclaimer || '';
        
        let message = '';
        
        // 标题部分
        message += '🚨 <b>币安官方公告</b>\n\n';
        
        // 主要内容使用blockquote包装
        message += '<blockquote>\n';
        if (title) {
            message += `<b>${this.escapeHtml(title)}</b>\n\n`;
        }
        
        if (body) {
            message += `${this.escapeHtml(this.truncateText(body, 1200))}\n`;
        }
        message += '</blockquote>\n\n';
        
        // 添加分类信息
        if (announcement.catalogName) {
            message += `📂 <b>分类:</b> <code>${this.escapeHtml(announcement.catalogName)}</code>\n`;
        }
        
        // 添加发布时间
        const publishTime = new Date(announcement.publishDate).toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        message += `🕐 <b>发布时间:</b> <code>${publishTime}</code>\n`;
        
        // 添加来源标识
        message += `\n<b>消息来源:</b> <a href="https://www.binance.com/en/support/announcement">币安官方</a>`;
        
        // 限制消息长度（Telegram限制4096字符）
        if (message.length > 4090) {
            message = message.substring(0, 4087) + '...';
        }
        
        return message;
    }

    /**
     * 格式化双语模式（原文+译文）
     */
    formatBothLanguages(announcement) {
        const title = announcement.title || '';
        const body = announcement.body || '';
        const translatedTitle = announcement.translatedTitle || '';
        const translatedBody = announcement.translatedBody || '';
        const disclaimer = announcement.disclaimer || '';
        
        let message = '';
        
        // 使用HTML格式化标题
        message += '🚨 <b>币安官方公告</b>\n\n';
        
        // 中文译文部分 - 使用更清晰的格式
        if (translatedTitle || translatedBody) {
            message += '🇨🇳 <b>中文</b>\n';
            message += '<blockquote>\n';
            
            if (translatedTitle) {
                message += `<b>${this.escapeHtml(translatedTitle)}</b>\n\n`;
            }
            if (translatedBody) {
                message += `${this.escapeHtml(this.truncateText(translatedBody, 800))}\n`;
            }
            message += '</blockquote>\n\n';
        }
        
        // 英文原文部分
        message += '🇬🇧 <b>原文</b>\n';
        message += '<blockquote>\n';
        if (title) {
            message += `<b>${this.escapeHtml(title)}</b>\n\n`;
        }
        if (body) {
            message += `${this.escapeHtml(this.truncateText(body, 800))}\n`;
        }
        message += '</blockquote>\n\n';
        
        // 添加分类信息
        if (announcement.catalogName) {
            message += `📂 <b>分类:</b> <code>${this.escapeHtml(announcement.catalogName)}</code>\n`;
        }
        
        // 添加发布时间
        const publishTime = new Date(announcement.publishDate).toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        message += `🕐 <b>发布时间:</b> <code>${publishTime}</code>\n`;
        
        // 添加来源标识
        message += `\n<b>消息来源:</b> <a href="https://www.binance.com/en/support/announcement">币安官方</a>`;
        // 限制总长度（Telegram限制4096字符）
        if (message.length > 4090) {
            message = message.substring(0, 4087) + '...';
        }
        
        return message;
    }

    /**
     * 格式化仅原文模式
     */
    formatOriginalOnly(announcement) {
        let message = this.messageTemplate;
        
        // 替换模板变量
        message = message.replace('{title}', this.escapeMarkdown(announcement.title || ''));
        message = message.replace('{body}', this.escapeMarkdown(this.truncateText(announcement.body || '', 1000)));
        message = message.replace('{disclaimer}', this.escapeMarkdown(announcement.disclaimer || ''));
        message = message.replace('{catalogName}', this.escapeMarkdown(announcement.catalogName || ''));
        
        // 添加时间戳
        const publishTime = new Date(announcement.publishDate).toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai' 
        });
        message += `\n\n📅 发布时间: ${publishTime}`;
        
        // 限制消息长度（Telegram限制4096字符）
        if (message.length > 4090) {
            message = message.substring(0, 4087) + '...';
        }
        
        return message;
    }

    escapeMarkdown(text) {
        if (!text) return '';
        return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    async testConnection() {
        if (!this.enabled) {
            return { success: false, error: 'Telegram通知未启用' };
        }

        try {
            const testMessage = {
                title: '系统测试',
                body: '这是一条测试消息，用于验证Telegram通知功能是否正常工作。',
                catalogName: 'Test',
                publishDate: Date.now()
            };

            const result = await this.sendMessage(testMessage);
            return result;
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStatus() {
        return {
            enabled: this.enabled,
            configured: !!(this.botToken && this.chatId),
            lastTest: null
        };
    }
}

module.exports = TelegramNotifier;