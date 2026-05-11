#!/bin/sh

# 如果用户传入了 PASSWORD 环境变量，将其写入到 wrangler 能够读取的 .dev.vars 文件中
if [ ! -z "$PASSWORD" ]; then
    echo "PASSWORD=\"$PASSWORD\"" > /app/.dev.vars
    echo "Password environment variable configured in .dev.vars"
else
    echo "No PASSWORD environment variable provided, skipping .dev.vars creation."
fi

# 启动 wrangler
# --ip 0.0.0.0 允许外部访问
# --port 8787 绑定到 8787 端口
# --d1 DB 绑定名为 DB 的 D1 数据库（必须与代码中保持一致）
# --persist-to=/app/data 将数据库文件等持久化保存到 /app/data 目录中，以便做 volume 映射
echo "Starting Cloudflare Pages local development server via Wrangler..."
exec npx wrangler pages dev . --ip 0.0.0.0 --port 8787 --d1 DB --persist-to=/app/data
