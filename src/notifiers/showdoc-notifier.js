const axios = require('axios');

class ShowDocNotifier {
    constructor(config) {
        this.config = config;
        this.enabled = config.get('showdoc.enabled');
        
        // 解析接收者配置
        this.recipients = this.parseRecipients(config);
        this.maxConcurrent = config.get('showdoc.maxConcurrent') || 3;
        
        this.messageTemplate = config.get('showdoc.messageTemplate');
        this.retryAttempts = config.get('showdoc.retryAttempts') || 3;
        this.retryDelay = config.get('showdoc.retryDelay') || 1000;
        
        this.httpClient = axios.create({
            timeout: 10000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Binance-Announcement-Bot/1.0'
            }
        });
    }

    parseRecipients(config) {
        // 优先从环境变量读取
        const recipientsEnv = process.env.SHOWDOC_RECIPIENTS;
        if (recipientsEnv) {
            try {
                return JSON.parse(recipientsEnv);
            } catch (error) {
                console.error('SHOWDOC_RECIPIENTS格式错误，应为JSON格式:', error.message);
                return {};
            }
        }
        
        // 回退到配置文件
        const recipientsConfig = config.get('showdoc.recipients');
        if (recipientsConfig && typeof recipientsConfig === 'object') {
            return recipientsConfig;
        }
        
        // 向后兼容：检查旧的pushUrl配置
        const oldPushUrl = config.get('showdoc.pushUrl') || process.env.SHOWDOC_PUSH_URL;
        if (oldPushUrl) {
            console.warn('⚠️ 使用了旧的SHOWDOC_PUSH_URL配置，建议更新为SHOWDOC_RECIPIENTS');
            return { '默认用户': oldPushUrl };
        }
        
        return {};
    }

    async sendMessage(announcement) {
        if (!this.enabled) {
            return { success: false, error: 'ShowDoc通知未启用', channel: 'showdoc' };
        }

        const recipients = Object.entries(this.recipients);
        if (recipients.length === 0) {
            return { success: false, error: '未配置ShowDoc接收者', channel: 'showdoc' };
        }

        try {
            const results = await this.sendToMultipleRecipients(announcement, recipients);
            const successCount = results.filter(r => r.success).length;
            
            return {
                success: successCount > 0,
                channel: 'showdoc',
                results: results,
                successCount: successCount,
                totalCount: results.length
            };

        } catch (error) {
            console.error('ShowDoc多用户发送失败:', error.message);
            return { success: false, error: error.message, channel: 'showdoc' };
        }
    }

    async sendToMultipleRecipients(announcement, recipients) {
        const results = [];
        
        // 分批处理，每批最多maxConcurrent个
        for (let i = 0; i < recipients.length; i += this.maxConcurrent) {
            const batch = recipients.slice(i, i + this.maxConcurrent);
            
            const batchPromises = batch.map(([name, url]) => 
                this.sendToSingleRecipient(announcement, name, url)
            );
            
            const batchResults = await Promise.allSettled(batchPromises);
            
            // 处理这一批的结果
            for (const result of batchResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                } else {
                    results.push({
                        recipient: '未知用户',
                        success: false,
                        error: result.reason?.message || '未知错误'
                    });
                }
            }
        }
        
        return results;
    }

    async sendToSingleRecipient(announcement, recipientName, pushUrl) {
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const message = this.formatMessage(announcement);
                
                const postData = new URLSearchParams();
                postData.append('title', announcement.title || '币安公告');
                postData.append('content', message);

                const response = await this.httpClient.post(pushUrl, postData);

                // 按照ShowDoc API官方规范解析响应
                try {
                    const responseData = response.data;
                    
                    if (responseData && responseData.error_code === 0) {
                        return { 
                            recipient: recipientName, 
                            success: true,
                            url: pushUrl 
                        };
                    } else {
                        const errorMessage = responseData?.error_message || `错误码: ${responseData?.error_code || 'unknown'}`;
                        
                        if (attempt < this.retryAttempts) {
                            await this.delay(this.retryDelay * attempt);
                            continue;
                        }
                        
                        return { 
                            recipient: recipientName, 
                            success: false, 
                            error: errorMessage,
                            url: pushUrl 
                        };
                    }
                } catch (parseError) {
                    // 回退到HTTP状态码检查
                    if (response.status === 200) {
                        return { 
                            recipient: recipientName, 
                            success: true,
                            url: pushUrl 
                        };
                    } else {
                        const errorMessage = `HTTP ${response.status}`;
                        
                        if (attempt < this.retryAttempts) {
                            await this.delay(this.retryDelay * attempt);
                            continue;
                        }
                        
                        return { 
                            recipient: recipientName, 
                            success: false, 
                            error: errorMessage,
                            url: pushUrl 
                        };
                    }
                }

            } catch (error) {
                if (attempt < this.retryAttempts) {
                    await this.delay(this.retryDelay * attempt);
                    continue;
                }
                
                return { 
                    recipient: recipientName, 
                    success: false, 
                    error: error.message,
                    url: pushUrl 
                };
            }
        }
    }

    async sendWithRetry(announcement) {
        // 直接调用sendMessage，因为重试逻辑已经在sendToSingleRecipient中实现
        return await this.sendMessage(announcement);
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
        let message = this.messageTemplate;
        
        // 使用翻译后的内容，如果没有则回退到原文
        const title = announcement.translatedTitle || announcement.title || '';
        const body = announcement.translatedBody || announcement.body || '';
        
        message = message.replace('{title}', title);
        message = message.replace('{body}', this.truncateText(body, 500));
        message = message.replace('{catalogName}', announcement.catalogName || '');
        
        // 添加时间戳
        const publishTime = new Date(announcement.publishDate).toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai' 
        });
        message += `\n\n发布时间: ${publishTime}`;
        
        // 限制消息长度
        if (message.length > 1000) {
            message = message.substring(0, 997) + '...';
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
        
        let message = '';
        
        // 中文标题和内容
        if (translatedTitle || translatedBody) {
            message += '【币安公告-中文】\n';
            message += `${translatedTitle || title}\n\n`;
            message += `${this.truncateText(translatedBody || body, 400)}\n\n`;
        }
        
        // 英文原文
        message += '【原文】\n';
        message += `${title}\n\n`;
        message += `${this.truncateText(body, 400)}`;
        
        // 添加分类和时间信息
        if (announcement.catalogName) {
            message += `\n\n分类: ${announcement.catalogName}`;
        }
        
        const publishTime = new Date(announcement.publishDate).toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai' 
        });
        message += `\n发布时间: ${publishTime}`;
        
        // 限制总长度
        if (message.length > 1500) {
            message = message.substring(0, 1497) + '...';
        }
        
        return message;
    }

    /**
     * 格式化仅原文模式
     */
    formatOriginalOnly(announcement) {
        let message = this.messageTemplate;
        
        // 替换模板变量
        message = message.replace('{title}', announcement.title || '');
        message = message.replace('{body}', this.truncateText(announcement.body || '', 500));
        message = message.replace('{catalogName}', announcement.catalogName || '');
        
        // 添加时间戳
        const publishTime = new Date(announcement.publishDate).toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai' 
        });
        message += `\n\n发布时间: ${publishTime}`;
        
        // 限制消息长度
        if (message.length > 1000) {
            message = message.substring(0, 997) + '...';
        }
        
        return message;
    }

    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    async testConnection() {
        if (!this.enabled) {
            return { success: false, error: 'ShowDoc通知未启用' };
        }

        const recipients = Object.entries(this.recipients);
        if (recipients.length === 0) {
            return { success: false, error: '未配置ShowDoc接收者' };
        }

        try {
            const testMessage = {
                title: '系统测试',
                body: '这是一条测试消息，用于验证ShowDoc推送功能是否正常工作。',
                catalogName: 'Test',
                publishDate: Date.now()
            };

            const results = await this.sendToMultipleRecipients(testMessage, recipients);
            const successCount = results.filter(r => r.success).length;
            
            return {
                success: successCount > 0,
                results: results,
                successCount: successCount,
                totalCount: results.length
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStatus() {
        const recipients = Object.entries(this.recipients);
        return {
            enabled: this.enabled,
            configured: recipients.length > 0,
            recipientCount: recipients.length,
            recipients: Object.keys(this.recipients),
            maxConcurrent: this.maxConcurrent,
            lastTest: null
        };
    }
}

module.exports = ShowDocNotifier;