ARG NODE_VERSION=18

FROM node:${NODE_VERSION}-alpine

# 创建应用用户
RUN addgroup -g 1001 -S bnbot && \
    adduser -S bnbot -u 1001

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装依赖
RUN npm ci --only=production && npm cache clean --force

# 复制源代码文件
COPY --chown=bnbot:bnbot src/ ./src/
COPY --chown=bnbot:bnbot config/ ./config/
COPY --chown=bnbot:bnbot scripts/ ./scripts/

# 创建必要的目录
RUN mkdir -p logs data && \
    chown -R bnbot:bnbot /app && \
    chmod +x scripts/init-db.sh

# 切换到应用用户
USER bnbot

# 设置环境变量
ENV NODE_ENV=production

# 暴露端口
EXPOSE 5010

# 启动应用
CMD ["node", "src/main.js"]