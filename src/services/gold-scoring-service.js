const { generateText } = require('ai');
const { anthropic } = require('@ai-sdk/anthropic');
const { createAnthropic } = require('@ai-sdk/anthropic');
const { createOpenAICompatible } = require('@ai-sdk/openai-compatible');

class GoldScoringService {
    constructor(config) {
        this.config = config;
        this.aiConfig = config.getAIConfig();
        this.enabled = this.aiConfig.enabled;

        if (this.enabled) {
            this.initializeProvider();
        }
    }

    initializeProvider() {
        try {
            if (this.aiConfig.provider === 'anthropic') {
                this.model = anthropic(this.aiConfig.model);
            } else if (this.aiConfig.provider === 'custom-anthropic') {
                const customProvider = createAnthropic({
                    baseURL: this.aiConfig.customConfig.baseURL,
                    apiKey: this.aiConfig.customConfig.apiKey,
                    headers: this.aiConfig.customConfig.headers
                });
                this.model = customProvider(this.aiConfig.model);
            } else if (this.aiConfig.provider === 'openai-compatible') {
                const openaiProvider = createOpenAICompatible({
                    baseURL: this.aiConfig.customConfig.baseURL,
                    apiKey: this.aiConfig.customConfig.apiKey,
                    headers: this.aiConfig.customConfig.headers
                });
                this.model = openaiProvider(this.aiConfig.model);
            }
        } catch (err) {
            this.enabled = false;
        }
    }

    async scoreAnnouncement(announcement) {
        // 预处理：构建中文语料
        const title = announcement.translatedTitle || announcement.title || '';
        const body = announcement.translatedBody || announcement.body || '';

        // 基础启发式评分
        const heuristic = this.heuristicScore(title, body, announcement);

        // 如果AI不可用，返回启发式结果
        if (!this.enabled) {
            return heuristic;
        }

        try {
            const prompt = this.buildScoringPrompt({ title, body, announcement });
            const { text } = await generateText({
                model: this.model,
                prompt,
                maxTokens: 500,
                temperature: 0.2
            });
            const parsed = this.parseScoringResult(text);
            // 合并启发式作为兜底
            return {
                score: this.clampScore(parsed.score ?? heuristic.score),
                level: parsed.level || this.levelFromScore(heuristic.score),
                tips: parsed.tips || heuristic.tips,
                reasons: parsed.reasons || heuristic.reasons
            };
        } catch (err) {
            return heuristic;
        }
    }

    heuristicScore(title, body, announcement) {
        let score = 20;

        const plus = (n) => score += n;
        const minus = (n) => score -= n;

        const text = `${title}\n${body}`.toLowerCase();

        // 关键词权重
        const strongPositive = ['listing', '上币', '上线', '集成', '质押奖励', '空投', 'staking', 'promotion'];
        const mediumPositive = ['更新', '支持', '开放', '公告', '活动'];
        const negative = ['下架', '暂停', '维护', 'delist', 'suspend', '终止'];

        for (const k of strongPositive) if (text.includes(k)) plus(30);
        for (const k of mediumPositive) if (text.includes(k)) plus(10);
        for (const k of negative) if (text.includes(k)) minus(25);

        // 分类加权
        const name = (announcement.catalogName || '').toLowerCase();
        if (/(listing|上币|新币)/.test(name)) plus(25);
        if (/(维护|maintenance)/.test(name)) minus(20);

        // 标题长度与信息密度
        if (title.length >= 18 && title.length <= 80) plus(10);
        if (body.length > 300) plus(5);

        score = this.clampScore(score);
        return {
            score,
            level: this.levelFromScore(score),
            tips: this.tipsFromScore(score),
            reasons: '基于关键词、分类与信息密度的启发式评估'
        };
    }

    clampScore(n) {
        return Math.max(0, Math.min(100, Math.round(n)));
    }

    levelFromScore(score) {
        if (score >= 85) return '高';
        if (score >= 70) return '中';
        if (score >= 50) return '低';
        return '极低';
    }

    tipsFromScore(score) {
        if (score >= 85) return '高能事件，注意波动与风险控制';
        if (score >= 70) return '具备一定关注度，建议轻仓试探';
        if (score >= 50) return '观望为主，等待更多信号';
        return '信息性公告，谨慎参考';
    }

    buildScoringPrompt({ title, body, announcement }) {
        return `你是加密行业资讯分析助手。请对以下币安公告进行量化打分并给出简短建议：
要求：
1) 输出JSON，字段：score(0-100整数), level('高'|'中'|'低'|'极低'), tips(<=30字), reasons(<=50字)
2) 评分侧重：是否上币/交易对变更/代币经济相关/激励/风险提示/大范围影响
3) 不要输出除JSON外任何文本

标题：${title}
分类：${announcement.catalogName || ''}
正文：${body.slice(0, 1200)}
`;
    }

    parseScoringResult(text) {
        try {
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                const json = text.substring(jsonStart, jsonEnd + 1);
                const data = JSON.parse(json);
                return {
                    score: this.clampScore(data.score),
                    level: data.level,
                    tips: data.tips,
                    reasons: data.reasons
                };
            }
        } catch (_) {}
        return {};
    }
}

module.exports = GoldScoringService;


