/**
 * Solara 语音指令解析 (纯函数：无 DOM、无外部依赖，可在 Node 中直接测试)
 * 规则：整句匹配，不做模糊猜测；无法确定时返回 null
 */

export const INTENTS = ["next", "previous", "pause", "resume"];

// 指令短语表（中英文同时生效，与识别语言无关）
const PHRASES = {
    next: ["next track", "next song", "skip", "下一首", "下一曲", "切歌"],
    previous: ["previous track", "previous song", "go back", "上一首", "上一曲"],
    pause: ["pause", "stop", "暂停", "停止"],
    resume: ["resume", "play", "continue", "继续", "继续播放", "播放"],
};

// 英文语气/礼貌填充词（按整词移除）
const EN_FILLERS = new Set([
    "please", "pls", "ok", "okay", "hey", "um", "uh", "er", "just", "now",
    "can", "could", "would", "you", "the", "music",
]);

// 中文语气/礼貌填充词（按子串移除，长词优先）
const ZH_FILLERS = ["麻烦你", "麻烦", "帮我", "给我", "一下", "请", "吧", "啊", "呀", "嗯", "哦", "了"];

// 动词前缀：仅当剩余部分恰好是切歌指令时才剥离，例如“播放下一首”“play next song”
const NAV_PREFIXES = ["播放", "放", "play", "go to"];
const NAV_INTENTS = ["next", "previous"];

// 中文结尾的“歌/歌曲”，例如“下一首歌”
const ZH_SONG_SUFFIX = /(歌曲|歌)$/;

const PHRASE_LOOKUP = new Map();
for (const intent of INTENTS) {
    for (const phrase of PHRASES[intent]) {
        PHRASE_LOOKUP.set(phrase, intent);
    }
}

function hasCjk(text) {
    return /[㐀-鿿]/.test(text);
}

export function normalizeText(text) {
    if (typeof text !== "string") return "";
    return text
        .toLowerCase()
        .normalize("NFKC")
        .replace(/[\p{P}\p{S}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function stripFillers(text) {
    let result = text
        .split(" ")
        .filter((word) => word && !EN_FILLERS.has(word))
        .join(" ");
    if (hasCjk(result)) {
        for (const filler of ZH_FILLERS) {
            result = result.split(filler).join("");
        }
        // 中文之间的空格没有意义（识别结果偶尔带空格）
        result = result.replace(/(?<=[㐀-鿿])\s+|\s+(?=[㐀-鿿])/g, "");
    }
    return result.trim();
}

function lookup(text) {
    if (!text) return null;
    if (PHRASE_LOOKUP.has(text)) return PHRASE_LOOKUP.get(text);
    if (hasCjk(text) && ZH_SONG_SUFFIX.test(text)) {
        const withoutSuffix = text.replace(ZH_SONG_SUFFIX, "");
        const intent = PHRASE_LOOKUP.get(withoutSuffix);
        if (intent && NAV_INTENTS.includes(intent)) return intent;
    }
    return null;
}

function matchOne(text) {
    const normalized = normalizeText(text);
    if (!normalized) return null;

    const direct = lookup(normalized);
    if (direct) return direct;

    const stripped = stripFillers(normalized);
    const afterFillers = lookup(stripped);
    if (afterFillers) return afterFillers;

    for (const prefix of NAV_PREFIXES) {
        if (!stripped.startsWith(prefix)) continue;
        const rest = stripped.slice(prefix.length).trim();
        const intent = lookup(rest);
        if (intent && NAV_INTENTS.includes(intent)) return intent;
    }
    return null;
}

/**
 * 解析单条识别文本或多条候选结果（按识别置信度排序），返回第一个可确定的指令
 * @param {string|string[]} input
 * @returns {{ intent: string, text: string } | null}
 */
export function parseCommand(input) {
    const candidates = Array.isArray(input) ? input : [input];
    for (const candidate of candidates) {
        const intent = matchOne(candidate);
        if (intent) {
            return { intent, text: String(candidate).trim() };
        }
    }
    return null;
}
