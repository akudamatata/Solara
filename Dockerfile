FROM node:22-slim

WORKDIR /app

# 安装 wrangler 和 npm
RUN npm install -g wrangler@latest

# 将项目的所有文件复制到容器内
COPY . .

# 复制启动脚本并赋予执行权限
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 创建数据存放目录
RUN mkdir -p /app/data

# 暴露 wrangler 默认运行的 8787 端口
EXPOSE 8787

# 设置启动命令
ENTRYPOINT ["docker-entrypoint.sh"]
