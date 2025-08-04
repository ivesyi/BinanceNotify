const WebSocket = require('ws');
const crypto = require('crypto');
const Logger = require('../utils/logger');

class WebSocketManager {
    constructor(config, messageRouter) {
        this.config = config;
        this.messageRouter = messageRouter;
        this.logger = new Logger();
        this.ws = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.connectionStartTime = null;
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.lifetimeTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectInterval = 5000;
        this.connectionLifetime = 24 * 60 * 60 * 1000 - 60 * 1000; // 24小时减1分钟
        this.lastPongTime = null;
        
        this.stats = {
            totalConnections: 0,
            totalReconnections: 0,
            messagesReceived: 0,
            lastMessageTime: null,
            uptime: Date.now()
        };
    }

    async connect() {
        if (this.isConnecting || this.isConnected) {
            console.log('⚠️ WebSocket已在连接中或已连接');
            return;
        }

        this.isConnecting = true;
        console.log(`🔄 尝试连接WebSocket (尝试 ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})...`);

        try {
            const connectionUrl = this.buildConnectionUrl();
            await this.establishConnection(connectionUrl);
        } catch (error) {
            console.error('❌ WebSocket连接失败:', error.message);
            this.handleConnectionError(error);
        }
    }

    buildConnectionUrl() {
        const timestamp = Date.now();
        const random = this.generateRandomString(16);
        const recvWindow = this.config.get('binance.recvWindow');
        const topic = this.config.get('binance.topic');

        const queryParams = {
            timestamp,
            random,
            recvWindow,
            topic
        };

        const queryString = Object.entries(queryParams)
            .map(([key, value]) => `${key}=${value}`)
            .join('&');
        
        const signature = crypto
            .createHmac('sha256', this.config.get('binance.apiSecret'))
            .update(queryString)
            .digest('hex');

        return `${this.config.get('binance.wsUrl')}?${queryString}&signature=${signature}`;
    }

    async establishConnection(url) {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(url, {
                headers: {
                    'X-MBX-APIKEY': this.config.get('binance.apiKey')
                }
            });

            const connectionTimeout = setTimeout(() => {
                if (this.ws.readyState !== WebSocket.OPEN) {
                    this.ws.terminate();
                    reject(new Error('连接超时'));
                }
            }, 15000);

            this.ws.onopen = () => {
                clearTimeout(connectionTimeout);
                this.handleConnectionOpen();
                resolve();
            };

            this.ws.onmessage = (event) => {
                this.handleMessage(event);
            };

            // 监听WebSocket原生PONG事件
            this.ws.on('pong', () => {
                this.lastPongTime = Date.now();
                this.logger.info('💓 接收心跳PONG');
            });

            this.ws.onclose = (event) => {
                clearTimeout(connectionTimeout);
                this.handleConnectionClose(event);
            };

            this.ws.onerror = (error) => {
                clearTimeout(connectionTimeout);
                this.handleConnectionError(error);
                reject(error);
            };
        });
    }

    handleConnectionOpen() {
        this.isConnected = true;
        this.isConnecting = false;
        this.connectionStartTime = Date.now();
        this.lastPongTime = Date.now();
        this.reconnectAttempts = 0;
        this.stats.totalConnections++;

        console.log('✅ WebSocket连接成功');

        // 清除重连计时器
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // 启动心跳机制
        this.startHeartbeat();

        // 设置24小时生命周期重连
        this.scheduleLifetimeReconnect();
    }

    handleMessage(event) {
        try {
            this.stats.messagesReceived++;
            this.stats.lastMessageTime = Date.now();

            const message = JSON.parse(event.data);
            
            // 调试：记录所有接收到的消息
            this.logger.info(`🔍 接收WebSocket消息`, {
                type: message.type,
                topic: message.topic,
                expectedTopic: this.config.get('binance.topic'),
                dataPreview: message.data ? message.data.substring(0, 100) + '...' : 'no data'
            });

            // 处理数据消息
            if (message.type === 'DATA' && message.topic === this.config.get('binance.topic')) {
                try {
                    const announcementData = JSON.parse(message.data);
                    
                    // 格式化发布时间（东八区）
                    const publishTime = new Date(announcementData.publishDate).toLocaleString('zh-CN', {
                        timeZone: 'Asia/Shanghai',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    });
                    
                    // 记录详细的公告信息
                    this.logger.info(`📢 接收币安公告`, {
                        title: announcementData.title,
                        catalogName: announcementData.catalogName,
                        catalogId: announcementData.catalogId,
                        publishTime: publishTime,
                        topic: message.topic
                    });
                    
                    // 转发到消息路由器
                    this.messageRouter.routeMessage(announcementData).catch(error => {
                        this.logger.error('消息路由失败', error);
                    });
                } catch (parseError) {
                    this.logger.error('解析公告数据失败', parseError);
                }
            }

        } catch (error) {
            this.logger.error('❌ 处理WebSocket消息失败', error);
        }
    }

    handleConnectionClose(event) {
        this.isConnected = false;
        this.isConnecting = false;
        
        console.log(`🔌 WebSocket连接关闭 (代码: ${event.code}, 原因: ${event.reason || '未知'})`);

        this.clearTimers();

        // 非正常关闭时调度重连
        if (event.code !== 1000) {
            this.scheduleReconnect();
        }
    }

    handleConnectionError(error) {
        this.isConnected = false;
        this.isConnecting = false;
        
        console.error('❌ WebSocket连接错误:', error.message);
        this.scheduleReconnect();
    }

    startHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        // 每30秒发送PING
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected) {
                this.sendPing();
                
                // 检查PONG超时（90秒未收到PONG视为超时）
                const pongTimeout = Date.now() - this.lastPongTime;
                if (pongTimeout > 90000) {
                    console.warn('💓 心跳超时，重新连接...');
                    this.reconnect();
                }
            }
        }, 30000);
    }

    sendPing() {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            try {
                // 使用WebSocket原生PING帧（空载荷），符合币安官方规范
                this.ws.ping();
                this.logger.info('💓 发送心跳PING');
            } catch (error) {
                this.logger.error('发送PING失败', error);
            }
        }
    }

    scheduleLifetimeReconnect() {
        if (this.lifetimeTimer) {
            clearTimeout(this.lifetimeTimer);
        }

        // 24小时后重连
        this.lifetimeTimer = setTimeout(() => {
            console.log('⏰ 达到24小时连接限制，重新连接...');
            this.reconnect();
        }, this.connectionLifetime);

        console.log(`⏱️ 设置24小时重连计时器 (${Math.round(this.connectionLifetime / 1000 / 60)} 分钟)`);
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`❌ 已达到最大重连次数 (${this.maxReconnectAttempts})`);
            return;
        }

        // 指数退避延迟 (最大5分钟)
        const delay = Math.min(
            this.reconnectInterval * Math.pow(2, this.reconnectAttempts),
            300000
        );

        this.reconnectAttempts++;
        this.stats.totalReconnections++;

        console.log(`🔄 将在 ${Math.round(delay/1000)} 秒后重连 (尝试 ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, delay);
    }

    async reconnect() {
        console.log('🔄 手动重连...');
        
        this.disconnect();
        this.reconnectAttempts = 0;
        
        setTimeout(() => {
            this.connect();
        }, 1000);
    }

    disconnect() {
        console.log('🔌 断开WebSocket连接...');
        
        this.clearTimers();
        
        if (this.ws) {
            this.ws.close(1000, '手动断开');
            this.ws = null;
        }
        
        this.isConnected = false;
        this.isConnecting = false;
    }

    clearTimers() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        
        if (this.lifetimeTimer) {
            clearTimeout(this.lifetimeTimer);
            this.lifetimeTimer = null;
        }
    }

    generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    isConnected() {
        return this.isConnected;
    }

    getStatus() {
        return {
            isConnected: this.isConnected,
            isConnecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0,
            stats: this.stats
        };
    }
}

module.exports = WebSocketManager;