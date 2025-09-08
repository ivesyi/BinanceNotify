const TelegramNotifier = require('../notifiers/telegram-notifier');
const ShowDocNotifier = require('../notifiers/showdoc-notifier');
const TwitterNotifier = require('../notifiers/twitter-notifier');
const TranslationService = require('../services/translation-service');
const GoldScoringService = require('../services/gold-scoring-service');
const crypto = require('crypto');

class MessageRouter {
    constructor(config, dbService) {
        this.config = config;
        this.dbService = dbService;
        this.notifiers = {};
        this.translationService = new TranslationService(config);
        this.goldScoringService = new GoldScoringService(config);
        this.stats = {
            messagesReceived: 0,
            messagesProcessed: 0,
            notificationsSent: 0,
            errors: 0
        };
    }

    async initialize() {
        // 初始化通知器
        if (this.config.get('telegram.enabled')) {
            this.notifiers.telegram = new TelegramNotifier(this.config);
        }
        
        if (this.config.get('showdoc.enabled')) {
            this.notifiers.showdoc = new ShowDocNotifier(this.config);
        }
        
        if (this.config.get('twitter.enabled')) {
            this.notifiers.twitter = new TwitterNotifier(this.config);
        }
        
        console.log(`✅ 消息路由器初始化完成，启用的通知渠道: ${Object.keys(this.notifiers).join(', ')}`);
    }

    async routeMessage(announcement) {
        try {
            this.stats.messagesReceived++;
            
            // 生成唯一消息ID
            const messageId = this.generateMessageId(announcement);
            
            // 检查消息去重
            if (await this.isDuplicateMessage(messageId)) {
                console.log(`⚠️ 跳过重复消息: ${announcement.title}`);
                return { success: false, error: 'Duplicate message' };
            }
            
            // 过滤消息
            if (!this.shouldProcessMessage(announcement)) {
                console.log(`⚠️ 消息被过滤: ${announcement.title}`);
                return { success: false, error: 'Message filtered' };
            }
            
            // AI翻译处理（异步，不阻塞消息流）
            let translatedAnnouncement = announcement;
            if (this.translationService && this.config.get('ai.enabled')) {
                try {
                    console.log(`🤖 开始AI翻译: ${announcement.title}`);
                    translatedAnnouncement = await this.translationService.translateAnnouncement(announcement);
                } catch (error) {
                    console.error('⚠️ AI翻译失败，使用原文:', error.message);
                    // 翻译失败时使用原公告，不影响后续流程
                    translatedAnnouncement = announcement;
                }
            }
            
            // 如启用AI翻译，已在上文处理

            // 计算打金系数
            let goldScore = null;
            try {
                goldScore = await this.goldScoringService.scoreAnnouncement(translatedAnnouncement);
                translatedAnnouncement.goldScore = goldScore;
            } catch (e) {
                console.error('⚠️ 打金系数计算失败:', e.message);
            }

            // Twitter 中文与阈值前置过滤（只影响twitter，不影响其它渠道）
            const filters = this.config.get('filters') || {};
            const excludeCategories = filters.excludeCategories || [];
            const excludeKeywords = filters.excludeKeywords || [];
            const titleLower = (translatedAnnouncement.translatedTitle || translatedAnnouncement.title || '').toLowerCase();
            const bodyLower = (translatedAnnouncement.translatedBody || translatedAnnouncement.body || '').toLowerCase();
            const contentLower = `${titleLower} ${bodyLower}`;

            const twitterMinScore = this.config.get('twitter.minGoldScore') || 60;
            const isExcludedCategory = excludeCategories.includes(translatedAnnouncement.catalogId) || excludeCategories.includes(translatedAnnouncement.catalogName);
            const hasExcludedKeyword = excludeKeywords.some(k => contentLower.includes(String(k).toLowerCase()));

            if (this.notifiers.twitter) {
                // 如果不满足条件，临时禁用twitter发送（仅本次路由）
                const allowTwitter = (!!goldScore && goldScore.score >= twitterMinScore) && !isExcludedCategory && !hasExcludedKeyword;
                if (!allowTwitter) {
                    // 用一个标志在结果里体现过滤原因
                    translatedAnnouncement.__twitterFiltered = true;
                }
            }

            // 发送到所有启用的通知渠道
            const results = [];
            const promises = [];
            
            for (const [name, notifier] of Object.entries(this.notifiers)) {
                if (name === 'twitter' && translatedAnnouncement.__twitterFiltered) {
                    // 跳过twitter
                    results.push({ name, success: false, error: 'Twitter filtered by rules' });
                    continue;
                }
                promises.push(
                    notifier.sendWithRetry(translatedAnnouncement)
                        .then(result => ({ name, ...result }))
                        .catch(error => ({ name, success: false, error: error.message }))
                );
            }
            
            const notificationResults = await Promise.allSettled(promises);
            
            // 处理结果
            for (const result of notificationResults) {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                    if (result.value.success) {
                        this.stats.notificationsSent++;
                    }
                } else {
                    results.push({
                        name: 'unknown',
                        success: false,
                        error: result.reason?.message || 'Unknown error'
                    });
                }
            }
            
            // 保存到数据库
            if (this.dbService) {
                await this.dbService.saveAnnouncement(translatedAnnouncement, messageId);
                
                // 记录每个通知结果到数据库
                for (const result of results) {
                    if (result.name && result.results && Array.isArray(result.results)) {
                        // 处理多接收者结果（如ShowDoc）
                        for (const recipientResult of result.results) {
                            await this.dbService.logNotification(
                                messageId,
                                result.name,
                                recipientResult.success,
                                recipientResult.error || null,
                                recipientResult,
                                recipientResult.recipient || null
                            );
                        }
                    } else {
                        // 处理单接收者结果（如Telegram）
                        await this.dbService.logNotification(
                            messageId,
                            result.name,
                            result.success,
                            result.error || null,
                            result,
                            null
                        );
                    }
                }
            }
            
            this.stats.messagesProcessed++;
            
            const successCount = results.filter(r => r.success).length;
            
            // 如果至少有一个通知成功发送，标记公告为已处理
            if (successCount > 0 && this.dbService) {
                await this.dbService.markAnnouncementProcessed(messageId);
            }
            
            console.log(`📤 消息分发完成: ${announcement.title} - 成功: ${successCount}/${results.length}`);
            
            return {
                success: successCount > 0,
                messageId,
                results,
                successCount,
                totalCount: results.length
            };
            
        } catch (error) {
            this.stats.errors++;
            console.error('❌ 消息路由失败:', error);
            return { success: false, error: error.message };
        }
    }

    generateMessageId(announcement) {
        const content = `${announcement.catalogId}-${announcement.title}-${announcement.publishDate}`;
        return crypto.createHash('md5').update(content).digest('hex');
    }

    async isDuplicateMessage(messageId) {
        if (!this.dbService) return false;
        
        try {
            return await this.dbService.messageExists(messageId);
        } catch (error) {
            console.error('检查重复消息失败:', error);
            return false;
        }
    }

    shouldProcessMessage(announcement) {
        // 基本过滤规则
        if (!announcement.title || announcement.title.length < 5) {
            return false;
        }
        
        // 可以在这里添加更多过滤规则
        const filters = this.config.get('filters') || {};
        
        // 分类过滤
        if (filters.enabledCategories && filters.enabledCategories.length > 0) {
            const categoryMatch = filters.enabledCategories.includes(announcement.catalogId) ||
                                filters.enabledCategories.includes(announcement.catalogName);
            if (!categoryMatch) return false;
        }
        
        // 关键词过滤
        if (filters.enabledKeywords && filters.enabledKeywords.length > 0) {
            const title = (announcement.title || '').toLowerCase();
            const body = (announcement.body || '').toLowerCase();
            const content = title + ' ' + body;
            
            const keywordMatch = filters.enabledKeywords.some(keyword => 
                content.includes(keyword.toLowerCase())
            );
            if (!keywordMatch) return false;
        }
        
        // 排除关键词
        if (filters.excludeKeywords && filters.excludeKeywords.length > 0) {
            const title = (announcement.title || '').toLowerCase();
            const body = (announcement.body || '').toLowerCase();
            const content = title + ' ' + body;
            
            const hasExcludeKeyword = filters.excludeKeywords.some(keyword => 
                content.includes(keyword.toLowerCase())
            );
            if (hasExcludeKeyword) return false;
        }
        
        // 排除分类
        if (filters.excludeCategories && filters.excludeCategories.length > 0) {
            const categoryMatch = filters.excludeCategories.includes(announcement.catalogId) ||
                                  filters.excludeCategories.includes(announcement.catalogName);
            if (categoryMatch) return false;
        }
        
        return true;
    }

    async testAllConnections() {
        const results = [];
        
        for (const [name, notifier] of Object.entries(this.notifiers)) {
            try {
                const result = await notifier.testConnection();
                results.push({
                    channel: name,
                    ...result
                });
            } catch (error) {
                results.push({
                    channel: name,
                    success: false,
                    error: error.message
                });
            }
        }
        
        // 测试翻译服务
        if (this.translationService) {
            try {
                const result = await this.translationService.testConnection();
                results.push({
                    channel: 'translation',
                    ...result
                });
            } catch (error) {
                results.push({
                    channel: 'translation',
                    success: false,
                    error: error.message
                });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        
        return {
            results,
            successCount,
            totalCount: results.length
        };
    }

    getMessageCount() {
        return this.stats.messagesProcessed;
    }

    getStats() {
        const baseStats = { ...this.stats };
        
        // 添加翻译统计信息
        if (this.translationService) {
            baseStats.translation = this.translationService.getStatus();
        }
        
        return baseStats;
    }

    getStatus() {
        return {
            enabled: Object.keys(this.notifiers).length > 0,
            channels: Object.keys(this.notifiers),
            stats: this.stats
        };
    }
}

module.exports = MessageRouter;