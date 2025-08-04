// 测试第三方API翻译功能
require('dotenv').config();

const ConfigManager = require('./src/core/config-manager');
const TranslationService = require('./src/services/translation-service');

async function testThirdPartyTranslation() {
    console.log('🚀 测试第三方API翻译功能...\n');
    
    try {
        // 检查配置
        const config = ConfigManager;
        const aiConfig = config.getAIConfig();
        
        console.log('📋 当前AI配置:');
        console.log('- 启用状态:', aiConfig.enabled);
        console.log('- 提供商:', aiConfig.provider);
        console.log('- 模型:', aiConfig.model);
        console.log('- 翻译模式:', aiConfig.translationMode);
        console.log('- API端点:', aiConfig.customConfig.baseURL);
        console.log('- API密钥:', aiConfig.customConfig.apiKey ? '已配置' : '未配置');
        console.log('');
        
        if (!aiConfig.enabled) {
            console.log('⚠️ AI翻译功能未启用');
            return;
        }
        
        // 初始化翻译服务
        console.log('🔧 初始化翻译服务...');
        const translationService = new TranslationService(config);
        
        // 测试连接
        console.log('🔗 测试翻译服务连接...');
        const connectionTest = await translationService.testConnection();
        
        if (connectionTest.success) {
            console.log('✅ 翻译服务连接成功!');
            console.log('测试输入:', connectionTest.testInput);
            console.log('测试输出:', connectionTest.testOutput);
            console.log('使用模型:', connectionTest.model);
        } else {
            console.log('❌ 翻译服务连接失败:', connectionTest.error);
            return;
        }
        
        console.log('\\n📝 测试实际翻译...');
        
        // 创建测试公告
        const testText = 'Binance will list a new cryptocurrency token with enhanced security features and trading capabilities.';
        
        console.log('原文:', testText);
        console.log('翻译中...');
        
        const translatedText = await translationService.translateToChineseAsync(testText);
        console.log('译文:', translatedText);
        
        // 显示统计信息
        const status = translationService.getStatus();
        console.log('\\n📈 翻译服务状态:');
        console.log('- 提供商:', status.provider);
        console.log('- 端点:', status.endpoint);
        console.log('- 请求次数:', status.stats.translationsRequested);
        console.log('- 成功次数:', status.stats.translationsSucceeded);
        console.log('- 失败次数:', status.stats.translationsFailed);
        console.log('- 成功率:', status.stats.successRate + '%');
        console.log('- 平均响应时间:', status.stats.averageResponseTime + 'ms');
        
        console.log('\\n✅ 第三方API翻译功能测试完成!');
        
    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error.message);
        console.error('错误堆栈:', error.stack);
    }
}

// 运行测试
testThirdPartyTranslation().catch(console.error);