require('dotenv').config();
const WebSocket = require('ws');
const crypto = require('crypto');

class BinanceAnnouncementWebSocket {
    constructor() {
        this.apiKey = process.env.BINANCE_API_KEY;
        this.apiSecret = process.env.BINANCE_API_SECRET;
        
        if (!this.apiKey || !this.apiSecret) {
            throw new Error('🚫 缺少必要的环境变量：BINANCE_API_KEY 和 BINANCE_API_SECRET');
        }
        
        this.ws = null;
        this.connected = false;
        this.subscribed = false;
        this.messageCount = 0;
        this.announcementCount = 0;
        this.pingInterval = null;
        
        console.log('🔐 币安公告WebSocket客户端已初始化');
        console.log(`📊 API Key: ${this.apiKey.substring(0, 8)}***${this.apiKey.substring(this.apiKey.length - 4)}`);
    }

    // 创建签名连接URL
    createConnectionUrl(topic = 'com_announcement_en') {
        const uri = `wss://api.binance.com/sapi/wss?random=56724ac693184379ae23ffe5e910063c&topic=${topic}&recvWindow=30000&timestamp=\${timestamp}&signature=\${signature}`;
        
        const ts = Date.now();
        let paramsObject = {};
        const queryString = uri.substring(uri.indexOf('?') + 1);
        
        const parameters = queryString.split('&')
            .filter(param => param.includes('='))
            .map(param => {
                const [key, value] = param.split('=');
                return {key, value};
            });
        
        parameters.map((param) => {
            if (param.key !== 'signature' && param.key !== 'timestamp') {
                paramsObject[param.key] = param.value;
            }
        });
        
        Object.assign(paramsObject, {'timestamp': ts});
        
        const signatureString = Object.keys(paramsObject).map((key) => {
            return `${key}=${paramsObject[key]}`;
        }).join('&');
        
        const signature = crypto.createHmac('sha256', this.apiSecret).update(signatureString).digest('hex');
        Object.assign(paramsObject, {'signature': signature});
        
        const finalParams = Object.keys(paramsObject).map((key) => {
            return `${key}=${paramsObject[key]}`;
        }).join('&');
        
        const finalUri = `wss://api.binance.com/sapi/wss?${finalParams}`;
        
        console.log(`🌐 连接URL已生成 (topic: ${topic})`);
        console.log(`⏰ 时间戳: ${ts}`);
        console.log(`🔐 签名: ${signature.substring(0, 16)}...`);
        
        return finalUri;
    }

    // 连接到币安公告WebSocket
    async connect(topic = 'com_announcement_en') {
        console.log(`🚀 开始连接币安公告WebSocket...`);
        console.log(`📡 订阅主题: ${topic}`);
        
        return new Promise((resolve, reject) => {
            try {
                const uri = this.createConnectionUrl(topic);
                
                this.ws = new WebSocket(uri, [], {
                    headers: { "X-MBX-APIKEY": this.apiKey }
                });

                const timeout = setTimeout(() => {
                    console.log('⏰ 连接超时 (15秒)');
                    this.ws.terminate();
                    resolve({ success: false, error: '连接超时' });
                }, 15000);

                this.ws.on('open', () => {
                    clearTimeout(timeout);
                    console.log('✅ WebSocket连接已建立');
                    this.connected = true;
                    
                    // 订阅公告主题
                    setTimeout(() => {
                        const subscribeMsg = {
                            "command": "SUBSCRIBE",
                            "value": topic
                        };
                        console.log('📡 发送订阅消息:', JSON.stringify(subscribeMsg));
                        this.ws.send(JSON.stringify(subscribeMsg));
                    }, 1000);
                    
                    // 启动心跳
                    this.startHeartbeat();
                });

                this.ws.on('message', (data) => {
                    this.handleMessage(data, resolve);
                });

                this.ws.on('close', (code, reason) => {
                    clearTimeout(timeout);
                    this.connected = false;
                    this.subscribed = false;
                    this.stopHeartbeat();
                    console.log(`🔌 连接关闭 - 代码: ${code}, 原因: ${reason || '服务器关闭'}`);
                });

                this.ws.on('error', (error) => {
                    clearTimeout(timeout);
                    console.log('❌ WebSocket错误:', error.message);
                    if (!resolve.called) {
                        resolve({ success: false, error: error.message });
                    }
                });

            } catch (error) {
                console.error('💥 连接创建失败:', error.message);
                reject(error);
            }
        });
    }

    // 处理接收到的消息
    handleMessage(data, resolve) {
        this.messageCount++;
        const message = data.toString();
        const timestamp = new Date().toLocaleString();
        
        try {
            const parsed = JSON.parse(message);
            
            if (parsed.type === 'COMMAND') {
                console.log(`📨 [${timestamp}] 命令响应:`, JSON.stringify(parsed));
                
                if (parsed.subType === 'SUBSCRIBE') {
                    if (parsed.data === 'SUCCESS') {
                        console.log('🎉 公告订阅成功！开始监听币安公告...');
                        this.subscribed = true;
                        
                        if (resolve && !resolve.called) {
                            resolve.called = true;
                            resolve({
                                success: true,
                                subscribed: true,
                                message: '公告订阅成功',
                                timestamp: timestamp
                            });
                        }
                    } else {
                        console.log(`❌ 订阅失败: ${parsed.data}`);
                        if (resolve && !resolve.called) {
                            resolve.called = true;
                            resolve({
                                success: false,
                                error: `订阅失败: ${parsed.data}`
                            });
                        }
                    }
                }
            } else if (parsed.type === 'DATA' && parsed.topic === 'com_announcement_en') {
                // 这是公告数据！
                this.announcementCount++;
                this.handleAnnouncement(parsed, timestamp);
            } else {
                console.log(`📊 [${timestamp}] 其他消息:`, JSON.stringify(parsed, null, 2));
            }
            
        } catch (e) {
            console.log(`📄 [${timestamp}] 非JSON消息: ${message}`);
        }
    }

    // 处理公告数据
    handleAnnouncement(announcementData, timestamp) {
        console.log('\n🚨 收到新公告！');
        console.log('=' .repeat(60));
        console.log(`📅 接收时间: ${timestamp}`);
        console.log(`📊 公告编号: #${this.announcementCount}`);
        
        try {
            // 解析公告数据
            const data = JSON.parse(announcementData.data);
            
            console.log(`📋 分类ID: ${data.catalogId}`);
            console.log(`📂 分类名称: ${data.catalogName}`);
            console.log(`⏰ 发布时间: ${new Date(data.publishDate).toLocaleString()}`);
            console.log(`📰 标题: ${data.title}`);
            console.log(`📝 内容摘要: ${data.body.substring(0, 200)}${data.body.length > 200 ? '...' : ''}`);
            
            if (data.disclaimer) {
                console.log(`⚠️  免责声明: ${data.disclaimer.substring(0, 100)}...`);
            }
            
            console.log('=' .repeat(60));
            
            // 保存公告到文件（可选）
            this.saveAnnouncement(data, timestamp);
            
        } catch (error) {
            console.log('❌ 解析公告数据失败:', error.message);
            console.log('📄 原始数据:', announcementData.data);
        }
    }

    // 保存公告到文件
    saveAnnouncement(data, timestamp) {
        const fs = require('fs');
        const path = require('path');
        
        try {
            const announcementsDir = path.join(__dirname, '../announcements');
            if (!fs.existsSync(announcementsDir)) {
                fs.mkdirSync(announcementsDir, { recursive: true });
            }
            
            const filename = `announcement_${Date.now()}.json`;
            const filepath = path.join(announcementsDir, filename);
            
            const announcementRecord = {
                receivedAt: timestamp,
                catalogId: data.catalogId,
                catalogName: data.catalogName,
                publishDate: data.publishDate,
                publishDateFormatted: new Date(data.publishDate).toLocaleString(),
                title: data.title,
                body: data.body,
                disclaimer: data.disclaimer
            };
            
            fs.writeFileSync(filepath, JSON.stringify(announcementRecord, null, 2));
            console.log(`💾 公告已保存到: ${filename}`);
            
        } catch (error) {
            console.log('❌ 保存公告失败:', error.message);
        }
    }

    // 启动心跳机制
    startHeartbeat() {
        console.log('💓 启动心跳机制 (30秒间隔)');
        
        this.pingInterval = setInterval(() => {
            if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    console.log('🏓 发送PING保持连接');
                    this.ws.ping();
                } catch (error) {
                    console.log('❌ PING发送失败:', error.message);
                }
            }
        }, 30000);
    }

    // 停止心跳机制
    stopHeartbeat() {
        if (this.pingInterval) {
            console.log('🛑 停止心跳机制');
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    // 获取连接状态
    getStatus() {
        return {
            connected: this.connected,
            subscribed: this.subscribed,
            messageCount: this.messageCount,
            announcementCount: this.announcementCount,
            uptime: this.connected ? 'Connected' : 'Disconnected'
        };
    }

    // 关闭连接
    close() {
        console.log('👋 关闭币安公告WebSocket连接...');
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
        }
    }

    // 安全清理
    destroy() {
        this.close();
        this.apiKey = null;
        this.apiSecret = null;
        console.log('🧹 已清理敏感信息');
    }
}

// 主函数 - 长期监听公告
async function startAnnouncementMonitoring(duration = 300000) { // 默认5分钟
    console.log('🚀 启动币安公告监听系统');
    console.log('=' .repeat(60));
    
    let client = null;
    
    try {
        // 检查环境变量
        if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
            console.log('⚠️  环境变量未设置');
            console.log('📝 请确保 .env 文件包含正确的API密钥');
            return;
        }

        client = new BinanceAnnouncementWebSocket();
        
        // 建立连接并订阅公告
        console.log('\n📡 第一阶段: 建立连接并订阅公告');
        const connectionResult = await client.connect('com_announcement_en');
        
        if (!connectionResult.success) {
            console.log('❌ 连接或订阅失败:', connectionResult.error);
            return;
        }

        console.log('✅ 公告订阅成功！');
        console.log(`⏳ 开始监听 ${duration/1000} 秒...`);
        console.log('📢 等待币安发布新公告...');
        
        // 定期显示状态
        const statusInterval = setInterval(() => {
            const status = client.getStatus();
            console.log(`📊 状态更新 - 连接: ${status.connected ? '✅' : '❌'}, 订阅: ${status.subscribed ? '✅' : '❌'}, 消息: ${status.messageCount}, 公告: ${status.announcementCount}`);
        }, 60000); // 每分钟显示一次状态
        
        // 监听指定时间
        await new Promise(resolve => setTimeout(resolve, duration));
        
        clearInterval(statusInterval);
        
        const finalStatus = client.getStatus();
        console.log('\n📊 监听结束统计:');
        console.log(`📨 总消息数: ${finalStatus.messageCount}`);
        console.log(`🚨 公告数量: ${finalStatus.announcementCount}`);
        
        if (finalStatus.announcementCount > 0) {
            console.log('🎉 成功捕获到币安公告！');
        } else {
            console.log('⏳ 监听期间没有新公告发布');
            console.log('💡 建议在币安通常发布公告的时间段进行测试');
        }
        
    } catch (error) {
        console.error('💥 监听过程中发生错误:', error.message);
    } finally {
        if (client) {
            client.destroy();
        }
        console.log('\n🔒 公告监听会话结束');
    }
}

// 如果直接运行此文件
if (require.main === module) {
    // 可以通过命令行参数指定监听时长（秒）
    const duration = process.argv[2] ? parseInt(process.argv[2]) * 1000 : 300000; // 默认5分钟
    console.log(`⏱️  监听时长: ${duration/1000} 秒`);
    
    startAnnouncementMonitoring(duration).catch(console.error);
}

module.exports = BinanceAnnouncementWebSocket;