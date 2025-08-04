class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
    }

    shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }

    formatMessage(level, message, data = null) {
        const timestamp = new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        if (data !== null && data !== undefined) {
            if (data instanceof Error) {
                // 处理Error对象
                logMessage += ` ${data.message}\n${data.stack || ''}`;
            } else if (typeof data === 'object') {
                try {
                    logMessage += ` ${JSON.stringify(data, null, 2)}`;
                } catch (err) {
                    logMessage += ` [Object: ${data.toString()}]`;
                }
            } else {
                logMessage += ` ${data}`;
            }
        }
        
        return logMessage;
    }

    error(message, data = null) {
        if (this.shouldLog('error')) {
            console.error(this.formatMessage('error', message, data));
        }
    }

    warn(message, data = null) {
        if (this.shouldLog('warn')) {
            console.warn(this.formatMessage('warn', message, data));
        }
    }

    info(message, data = null) {
        if (this.shouldLog('info')) {
            console.log(this.formatMessage('info', message, data));
        }
    }

    debug(message, data = null) {
        if (this.shouldLog('debug')) {
            console.log(this.formatMessage('debug', message, data));
        }
    }
}

module.exports = Logger;