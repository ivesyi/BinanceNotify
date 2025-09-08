const { TwitterApi } = require('twitter-api-v2');

class TwitterNotifier {
    constructor(config) {
        this.config = config;
        this.enabled = config.get('twitter.enabled');
        this.minGoldScore = config.get('twitter.minGoldScore') || 60;
        this.retryAttempts = config.get('twitter.retryAttempts') || 3;
        this.retryDelay = config.get('twitter.retryDelay') || 1000;
        this.messageTemplate = config.get('twitter.messageTemplate');

        if (this.enabled) {
            const creds = {
                appKey: config.get('twitter.appKey'),
                appSecret: config.get('twitter.appSecret'),
                accessToken: config.get('twitter.accessToken'),
                accessSecret: config.get('twitter.accessSecret')
            };
            this.client = new TwitterApi(creds);
        }
    }

    isChinese(text) {
        if (!text) return false;
        // 检测是否包含汉字范围的字符
        return /[\u4E00-\u9FFF]/.test(text);
    }

    buildTweet(announcement) {
        const publishTime = new Date(announcement.publishDate).toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        const goldScore = Math.round(announcement.goldScore?.score || 0);
        const goldLevel = announcement.goldScore?.level || this.getGoldLevel(goldScore);
        const goldTips = announcement.goldScore?.tips || this.generateDefaultGoldTips(goldScore, announcement);

        let title = announcement.translatedTitle || announcement.title || '';
        let body = announcement.translatedBody || '';

        // 只发中文推文：如果没有中文，尝试只用translated；若仍不是中文，则放弃
        const contentCandidate = `${title}\n${body}`.trim();
        if (!this.isChinese(contentCandidate)) {
            // 尝试仅标题
            if (!this.isChinese(title)) {
                return null;
            }
        }

        // 构建推文主体（限制280字符）
        const catalog = announcement.catalogName ? `分类：${announcement.catalogName}\n` : '';
        const header = `【币安速报】`;
        const scoreLine = `打金系数：${goldScore}/100（${goldLevel}）`;
        const tipsLine = goldTips ? `打金秘籍：${goldTips}` : '';
        const timeLine = `发布时间：${publishTime}`;

        let tweet = [
            header,
            `标题：${title}`,
            catalog,
            scoreLine,
            tipsLine,
            timeLine
        ].filter(Boolean).join('\n');

        // Twitter 280 字符限制
        if (tweet.length > 275) {
            tweet = tweet.slice(0, 272) + '...';
        }

        return tweet;
    }

    getGoldLevel(score) {
        if (score >= 85) return '高';
        if (score >= 70) return '中';
        if (score >= 50) return '低';
        return '极低';
    }

    generateDefaultGoldTips(score, announcement) {
        if (score >= 85) return '关注交易对与流动性变化，留意快速拉升风险';
        if (score >= 70) return '控制仓位，择机布局，避免追高';
        if (score >= 50) return '观望为主，等待进一步确认';
        return '信息参考为主，不构成投资建议';
    }

    async sendMessage(announcement) {
        if (!this.enabled || !this.client) {
            return { success: false, error: 'Twitter通知未启用', channel: 'twitter' };
        }

        // 阈值过滤
        const score = Math.round(announcement.goldScore?.score || 0);
        if (score < this.minGoldScore) {
            return { success: false, error: `goldScore ${score} < min ${this.minGoldScore}`, channel: 'twitter' };
        }

        const tweet = this.buildTweet(announcement);
        if (!tweet) {
            return { success: false, error: '无中文内容可发，已跳过', channel: 'twitter' };
        }

        try {
            const result = await this.client.v2.tweet(tweet);
            return { success: true, channel: 'twitter', resultId: result?.data?.id };
        } catch (error) {
            return { success: false, error: error.message, channel: 'twitter' };
        }
    }

    async sendWithRetry(announcement) {
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            const res = await this.sendMessage(announcement);
            if (res.success) return res;
            if (attempt < this.retryAttempts) {
                await new Promise(r => setTimeout(r, this.retryDelay * attempt));
            }
        }
        return { success: false, error: '重试次数已用尽', channel: 'twitter' };
    }

    async testConnection() {
        if (!this.enabled || !this.client) {
            return { success: false, error: 'Twitter通知未启用' };
        }
        try {
            const me = await this.client.v2.me();
            return { success: true, account: me?.data?.username };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = TwitterNotifier;


