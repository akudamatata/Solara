// @ts-nocheck
// 定义响应头
const HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache", // 状态信息不应被浏览器缓存
};

// 处理 OPTIONS 预检请求
export async function onRequestOptions(context) {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
        },
    });
}

// 处理 POST 请求
export async function onRequestPost(context) {
    const { request, env } = context;
    const kv = env.SONG_STATUS_KV;

    // 检查 KV 是否已绑定
    if (!kv) {
        console.error('KV 命名空间 "SONG_STATUS_KV" 未绑定。');
        return new Response(JSON.stringify({ error: "服务器配置错误" }), {
            status: 500,
            headers: HEADERS,
        });
    }

    let payload;
    try {
        // 解析请求体中的JSON数据
        payload = await request.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: "无效的请求体" }), {
            status: 400,
            headers: HEADERS,
        });
    }

    // 检查请求体中是否包含 keys 数组
    if (!Array.isArray(payload.keys) || payload.keys.length === 0) {
        return new Response(JSON.stringify({ error: "缺少 'keys' 参数" }), {
            status: 400,
            headers: HEADERS,
        });
    }

    // 从请求体中最多取100个key，防止滥用
    const keys = payload.keys.slice(0, 100);

    try {
        // 创建一个包含所有KV查询任务的Promise数组
        const promises = keys.map(key => kv.get(key));

        // 并发执行所有KV查询
        const values = await Promise.all(promises);

        // 构建响应结果对象
        const results = {};
        keys.forEach((key, index) => {
            // 如果KV中有值，则使用该值，否则为null（表示尚未验证）
            if (values[index] !== null) {
                results[key] = values[index];
            }
        });

        // 返回查询结果
        return new Response(JSON.stringify(results), {
            status: 200,
            headers: HEADERS,
        });

    } catch (error) {
        console.error('查询KV时出错:', error);
        return new Response(JSON.stringify({ error: "查询歌曲状态失败" }), {
            status: 500,
            headers: HEADERS,
        });
    }
}