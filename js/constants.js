/**
 * Solara 全局常量与配置
 */

export const EXPLORE_RADAR_GENRES = [
    "热歌榜",
    "新歌榜",
    "飙升榜",
];

export const SOURCE_OPTIONS = [
    { value: "netease", label: "网易云音乐" },
    { value: "kuwo", label: "酷我音乐" },
    { value: "joox", label: "JOOX音乐" },
    { value: "bilibili", label: "哔哩哔哩" }
];

export const RADAR_PLAYLISTS = [
    { id: "3778678", name: "热歌榜", description: "网易云音乐官方热歌榜" },
    { id: "19723756", name: "飙升榜", description: "网易云音乐官方飙升榜" },
    { id: "3779629", name: "新歌榜", description: "网易云音乐官方新歌榜" }
];

export function normalizeSource(value) {
    const allowed = SOURCE_OPTIONS.map(option => option.value);
    return allowed.includes(value) ? value : SOURCE_OPTIONS[0].value;
}

export const QUALITY_OPTIONS = [
    { value: "128", label: "标准音质", description: "128 kbps" },
    { value: "192", label: "高品音质", description: "192 kbps" },
    { value: "320", label: "极高音质", description: "320 kbps" },
    { value: "999", label: "无损音质", description: "FLAC" }
];

export function normalizeQuality(value) {
    const match = QUALITY_OPTIONS.find(option => option.value === value);
    return match ? match.value : "320";
}

export const REMOTE_STORAGE_ENDPOINT = "/api/storage";

export const STORAGE_KEYS_TO_SYNC = new Set([
    "playlistSongs",
    "currentTrackIndex",
    "playMode",
    "playbackQuality",
    "playerVolume",
    "currentPlaylist",
    "currentList",
    "currentSong",
    "currentPlaybackTime",
    "favoriteSongs",
    "currentFavoriteIndex",
    "favoritePlayMode",
    "favoritePlaybackTime",
    "searchSource",
    "lastSearchState.v1",
    "radarSettings",
]);

export const PALETTE_STORAGE_KEY = "paletteCache.v3";
export const LAST_SEARCH_STATE_STORAGE_KEY = "lastSearchState.v1";
export const PLAYLIST_EXPORT_VERSION = 1;
export const FAVORITE_EXPORT_VERSION = 1;

export const BACKGROUND_TRANSITION_DURATION = 850;
export const PALETTE_APPLY_DELAY = 140;
export const PALETTE_MAX_DIMENSION = 96;
export const PALETTE_TARGET_SAMPLE_COUNT = 2400;

export const PLACEHOLDER_HTML = `<div class="placeholder"><i class="fas fa-music"></i></div>`;

export const themeDefaults = {
    light: {
        gradient: "",
        primaryColor: "",
        primaryColorDark: "",
    },
    dark: {
        gradient: "",
        primaryColor: "",
        primaryColorDark: "",
    }
};

/**
 * 核心后端 API 代理接口
 */
export const API = {
    baseUrl: "/proxy",

    generateSignature: () => {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    },

    fetchJson: async (url, debugLogger = null) => {
        try {
            const response = await fetch(url, {
                headers: {
                    "Accept": "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }

            const cacheStatus = response.headers.get("X-Cache-Status");
            if (cacheStatus && typeof debugLogger === "function") {
                const urlObj = new URL(url, window.location.origin);
                const type = urlObj.searchParams.get("types") || "未知接口";
                if (cacheStatus === "HIT") {
                    debugLogger(`[边缘缓存] 命中接口数据: ${type}`);
                } else if (cacheStatus === "MISS") {
                    debugLogger(`[穿透回源] 拉取接口数据: ${type}`);
                }
            }

            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (parseError) {
                console.warn("JSON parse failed, returning raw text", parseError);
                return text;
            }
        } catch (error) {
            console.error("API request error:", error);
            throw error;
        }
    },

    search: async (keyword, source = "netease", count = 20, page = 1, debugLogger = null) => {
        const signature = API.generateSignature();
        const url = `${API.baseUrl}?types=search&source=${source}&name=${encodeURIComponent(keyword)}&count=${count}&pages=${page}&s=${signature}`;

        try {
            if (typeof debugLogger === "function") debugLogger(`API请求: ${url}`);
            const data = await API.fetchJson(url, debugLogger);
            if (typeof debugLogger === "function") debugLogger(`API响应: ${JSON.stringify(data).substring(0, 200)}...`);

            if (!Array.isArray(data)) throw new Error("搜索结果格式错误");

            return data.map(song => ({
                id: song.id,
                name: song.name,
                artist: song.artist,
                album: song.album,
                pic_id: song.pic_id,
                url_id: song.url_id,
                lyric_id: song.lyric_id,
                source: song.source,
            }));
        } catch (error) {
            if (typeof debugLogger === "function") debugLogger(`API错误: ${error.message}`);
            throw error;
        }
    },

    getRadarPlaylist: async (playlistId = "3778678", options = {}) => {
        const signature = API.generateSignature();

        let limit = 20;
        let offset = 0;

        if (typeof options === "number") {
            limit = options;
        } else if (options && typeof options === "object") {
            if (Number.isFinite(options.limit)) {
                limit = options.limit;
            } else if (Number.isFinite(options.count)) {
                limit = options.count;
            }
            if (Number.isFinite(options.offset)) {
                offset = options.offset;
            }
        }

        limit = Math.max(1, Math.min(200, Math.trunc(limit)) || 20);
        offset = Math.max(0, Math.trunc(offset) || 0);

        const params = new URLSearchParams({
            types: "playlist",
            id: playlistId,
            limit: String(limit),
            offset: String(offset),
            s: signature,
        });
        const url = `${API.baseUrl}?${params.toString()}`;

        try {
            const data = await API.fetchJson(url);
            const tracks = data && data.playlist && Array.isArray(data.playlist.tracks)
                ? data.playlist.tracks.slice(0, limit)
                : [];

            if (tracks.length === 0) throw new Error("No tracks found");

            return tracks.map(track => ({
                id: track.id,
                name: track.name,
                artist: Array.isArray(track.ar) ? track.ar.map(artist => artist.name).join(" / ") : (track.ar?.name || "未知艺术家"),
                album: track.al?.name || "",
                source: "netease",
                lyric_id: track.id,
                pic_id: track.al?.pic_str || track.al?.pic || track.al?.picUrl || "",
                url_id: track.id,
            }));
        } catch (error) {
            console.error("API request failed:", error);
            throw error;
        }
    },

    getSongUrl: (song, quality = "320") => {
        const signature = API.generateSignature();
        return `${API.baseUrl}?types=url&id=${song.id}&source=${song.source || "netease"}&br=${quality}&s=${signature}`;
    },

    getLyric: (song) => {
        const signature = API.generateSignature();
        return `${API.baseUrl}?types=lyric&id=${song.lyric_id || song.id}&source=${song.source || "netease"}&s=${signature}`;
    },

    getPicUrl: (song) => {
        const signature = API.generateSignature();
        return `${API.baseUrl}?types=pic&id=${song.pic_id}&source=${song.source || "netease"}&size=300&s=${signature}`;
    }
};

Object.freeze(API);
