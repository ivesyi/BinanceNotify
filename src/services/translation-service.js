const { anthropic } = require('@ai-sdk/anthropic');
const { createAnthropic } = require('@ai-sdk/anthropic');
const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');
const { generateText } = require('ai');

class TranslationService {
    constructor(config) {
        this.config = config;
        this.aiConfig = config.getAIConfig();
        this.enabled = this.aiConfig.enabled;
        
        if (this.enabled) {
            this.initializeProvider();
        } else {
            console.log('ℹ️ AI翻译服务未启用');
        }
        
        // 统计信息
        this.stats = {
            translationsRequested: 0,
            translationsSucceeded: 0,
            translationsFailed: 0,
            totalCharactersTranslated: 0,
            averageResponseTime: 0
        };
    }

    /**
     * 初始化AI提供商
     */
    initializeProvider() {
        try {
            if (this.aiConfig.provider === 'anthropic') {
                // 使用官方Anthropic API
                this.model = anthropic(this.aiConfig.model);
                console.log(`✅ AI翻译服务已启用 (Anthropic)，使用模型: ${this.aiConfig.model}`);
                
            } else if (this.aiConfig.provider === 'custom-anthropic') {
                // 使用Anthropic兼容的第三方API
                const customConfig = {
                    baseURL: this.aiConfig.customConfig.baseURL,
                    apiKey: this.aiConfig.customConfig.apiKey
                };
                
                // 添加自定义请求头
                if (this.aiConfig.customConfig.headers && Object.keys(this.aiConfig.customConfig.headers).length > 0) {
                    customConfig.headers = this.aiConfig.customConfig.headers;
                }
                
                const customProvider = createAnthropic(customConfig);
                this.model = customProvider(this.aiConfig.model);
                
                console.log(`✅ AI翻译服务已启用 (Anthropic兼容第三方API)，使用模型: ${this.aiConfig.model}`);
                console.log(`🔗 API端点: ${this.aiConfig.customConfig.baseURL}`);
                
            } else if (this.aiConfig.provider === 'openai-compatible') {
                // 使用OpenAI兼容的第三方API
                const customConfig = {
                    baseURL: this.aiConfig.customConfig.baseURL,
                    apiKey: this.aiConfig.customConfig.apiKey
                };
                
                // 添加自定义请求头
                if (this.aiConfig.customConfig.headers && Object.keys(this.aiConfig.customConfig.headers).length > 0) {
                    customConfig.headers = this.aiConfig.customConfig.headers;
                }
                
                const openaiProvider = createOpenAICompatible(customConfig);
                this.model = openaiProvider(this.aiConfig.model);
                
                console.log(`✅ AI翻译服务已启用 (OpenAI兼容第三方API)，使用模型: ${this.aiConfig.model}`);
                console.log(`🔗 API端点: ${this.aiConfig.customConfig.baseURL}`);
                
            } else {
                throw new Error(`不支持的AI提供商: ${this.aiConfig.provider}`);
            }
        } catch (error) {
            console.error('❌ AI翻译服务初始化失败:', error.message);
            this.enabled = false;
        }
    }

    /**
     * 翻译文本到中文
     * @param {string} text - 要翻译的英文文本
     * @returns {Promise<string>} 翻译结果
     */
    async translateToChineseAsync(text) {
        if (!this.enabled) {
            throw new Error('AI翻译服务未启用');
        }

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            throw new Error('翻译文本不能为空');
        }

        const startTime = Date.now();
        this.stats.translationsRequested++;

        try {
            // 构建专门针对币安公告的翻译提示词
            const prompt = this.buildTranslationPrompt(text);
            
            const { text: translatedText } = await generateText({
                model: this.model,
                prompt: prompt,
                maxTokens: this.aiConfig.maxTokens,
                temperature: 0.1, // 低温度确保翻译准确性
            });

            // 清理翻译结果
            const cleanedTranslation = this.cleanTranslationResult(translatedText);
            
            // 更新统计信息
            const responseTime = Date.now() - startTime;
            this.stats.translationsSucceeded++;
            this.stats.totalCharactersTranslated += text.length;
            this.updateAverageResponseTime(responseTime);

            console.log(`✅ 翻译完成 (${responseTime}ms): ${text.substring(0, 50)}... -> ${cleanedTranslation.substring(0, 50)}...`);
            
            return cleanedTranslation;

        } catch (error) {
            this.stats.translationsFailed++;
            console.error('❌ AI翻译失败:', error.message);
            
            // 根据配置决定是否抛出异常或返回原文
            if (this.aiConfig.retryAttempts > 0) {
                // 可以在这里实现重试逻辑
                console.log('📝 将回退到原文');
                return text; // 回退到原文
            } else {
                throw error;
            }
        }
    }

    /**
     * 构建翻译提示词
     * @param {string} text - 原文
     * @returns {string} 提示词
     */
    buildTranslationPrompt(text) {
        return `请将以下英文币安交易所公告准确翻译成简体中文。请保持：
1. 金融术语的专业性和准确性
2. 时间格式和数字格式不变
3. 公司名称、代币名称等专有名词保持原文
4. 保持原文的语气和正式程度
5. 确保翻译通顺易懂

原文：
${text}

请直接返回中文翻译，不要包含任何解释或其他内容：`;
    }

    /**
     * 清理翻译结果
     * @param {string} translatedText - AI返回的翻译文本
     * @returns {string} 清理后的翻译文本
     */
    cleanTranslationResult(translatedText) {
        if (!translatedText) return '';
        
        // 去除可能的前缀和后缀说明
        let cleaned = translatedText.trim();
        
        // 移除常见的AI回复前缀
        const prefixesToRemove = [
            '中文翻译：',
            '翻译：',
            '翻译结果：',
            '以下是翻译：',
            '中文：'
        ];
        
        for (const prefix of prefixesToRemove) {
            if (cleaned.startsWith(prefix)) {
                cleaned = cleaned.substring(prefix.length).trim();
            }
        }
        
        return cleaned;
    }

    /**
     * 翻译公告对象
     * @param {Object} announcement - 公告对象
     * @returns {Promise<Object>} 包含翻译结果的公告对象
     */
    async translateAnnouncement(announcement) {
        if (!this.enabled) {
            return announcement; // 返回原公告，不做翻译
        }

        try {
            const translatedAnnouncement = { ...announcement };
            
            // 翻译标题
            if (announcement.title) {
                translatedAnnouncement.translatedTitle = await this.translateToChineseAsync(announcement.title);
            }
            
            // 翻译正文
            if (announcement.body) {
                // 限制正文长度以控制成本
                const bodyToTranslate = announcement.body.length > 5000 
                    ? announcement.body.substring(0, 5000) + '...'
                    : announcement.body;
                
                translatedAnnouncement.translatedBody = await this.translateToChineseAsync(bodyToTranslate);
            }
            
            console.log(`📝 公告翻译完成: ${announcement.title} -> ${translatedAnnouncement.translatedTitle}`);
            return translatedAnnouncement;
            
        } catch (error) {
            console.error('❌ 公告翻译失败:', error.message);
            // 翻译失败时返回原公告
            return announcement;
        }
    }

    /**
     * 更新平均响应时间
     * @param {number} responseTime - 响应时间（毫秒）
     */
    updateAverageResponseTime(responseTime) {
        if (this.stats.translationsSucceeded === 1) {
            this.stats.averageResponseTime = responseTime;
        } else {
            this.stats.averageResponseTime = Math.round(
                (this.stats.averageResponseTime * (this.stats.translationsSucceeded - 1) + responseTime) / 
                this.stats.translationsSucceeded
            );
        }
    }

    /**
     * 获取服务状态
     * @returns {Object} 服务状态信息
     */
    getStatus() {
        return {
            enabled: this.enabled,
            provider: this.aiConfig.provider,
            model: this.aiConfig.model,
            translationMode: this.aiConfig.translationMode,
            endpoint: (this.aiConfig.provider === 'custom-anthropic' || this.aiConfig.provider === 'openai-compatible') 
                ? this.aiConfig.customConfig.baseURL 
                : 'https://api.anthropic.com',
            stats: {
                ...this.stats,
                successRate: this.stats.translationsRequested > 0 
                    ? Math.round((this.stats.translationsSucceeded / this.stats.translationsRequested) * 100)
                    : 0
            }
        };
    }

    /**
     * 测试翻译服务连接
     * @returns {Promise<Object>} 测试结果
     */
    async testConnection() {
        if (!this.enabled) {
            return { 
                success: false, 
                error: 'AI翻译服务未启用' 
            };
        }

        try {
            const testText = 'Binance announces new listing for BTC trading pairs.';
            const translatedText = await this.translateToChineseAsync(testText);
            
            return {
                success: true,
                testInput: testText,
                testOutput: translatedText,
                model: this.aiConfig.model
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message,
                model: this.aiConfig.model
            };
        }
    }

    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            translationsRequested: 0,
            translationsSucceeded: 0,
            translationsFailed: 0,
            totalCharactersTranslated: 0,
            averageResponseTime: 0
        };
        console.log('📊 翻译服务统计信息已重置');
    }
}

module.exports = TranslationService;