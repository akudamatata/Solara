/**
 * Solara 全局响应式状态机单例与自洽性检查
 */

import {
    normalizeQuality,
    normalizeSource,
    LAST_SEARCH_STATE_STORAGE_KEY,
    SOURCE_OPTIONS,
    EXPLORE_RADAR_GENRES,
    DEFAULT_RADAR_GENRES
} from "./constants.js";
import {
    safeGetLocalStorage,
    safeSetLocalStorage,
    safeRemoveLocalStorage,
    parseJSON,
    cloneSearchResults,
    sanitizeStoredSearchState
} from "./core/storage.js";

// 1. 初始化读取本地缓存状态
const savedPlaylistSongs = (() => {
    const stored = safeGetLocalStorage("playlistSongs");
    const playlist = parseJSON(stored, []);
    return Array.isArray(playlist) ? playlist : [];
})();

const savedFavoriteSongs = (() => {
    const stored = safeGetLocalStorage("favoriteSongs");
    const favorites = parseJSON(stored, []);
    return Array.isArray(favorites) ? favorites : [];
})();

const savedCurrentFavoriteIndex = (() => {
    const stored = safeGetLocalStorage("currentFavoriteIndex");
    const index = Number.parseInt(stored, 10);
    return Number.isInteger(index) && index >= 0 ? index : 0;
})();

const savedFavoritePlayMode = (() => {
    const stored = safeGetLocalStorage("favoritePlayMode");
    const normalized = stored === "order" ? "list" : stored;
    const modes = ["list", "single", "random"];
    return modes.includes(normalized) ? normalized : "list";
})();

const savedFavoritePlaybackTime = (() => {
    const stored = safeGetLocalStorage("favoritePlaybackTime");
    const time = Number.parseFloat(stored);
    return Number.isFinite(time) && time >= 0 ? time : 0;
})();

const savedCurrentList = (() => {
    const stored = safeGetLocalStorage("currentList");
    return stored === "favorite" ? "favorite" : "playlist";
})();

const savedCurrentTrackIndex = (() => {
    const stored = safeGetLocalStorage("currentTrackIndex");
    const index = Number.parseInt(stored, 10);
    return Number.isInteger(index) ? index : -1;
})();

const savedPlayMode = (() => {
    const stored = safeGetLocalStorage("playMode");
    const modes = ["list", "single", "random"];
    return modes.includes(stored) ? stored : "list";
})();

const savedPlaybackQuality = normalizeQuality(safeGetLocalStorage("playbackQuality"));

const savedVolume = (() => {
    const stored = safeGetLocalStorage("playerVolume");
    const volume = Number.parseFloat(stored);
    if (Number.isFinite(volume)) {
        return Math.min(Math.max(volume, 0), 1);
    }
    return 0.8;
})();

const savedSearchSource = (() => {
    const stored = safeGetLocalStorage("searchSource");
    return normalizeSource(stored);
})();

const savedLastSearchState = (() => {
    const stored = safeGetLocalStorage(LAST_SEARCH_STATE_STORAGE_KEY);
    const parsed = parseJSON(stored, null);
    return sanitizeStoredSearchState(parsed, savedSearchSource || SOURCE_OPTIONS[0].value);
})();

const savedPlaybackTime = (() => {
    const stored = safeGetLocalStorage("currentPlaybackTime");
    const time = Number.parseFloat(stored);
    return Number.isFinite(time) && time >= 0 ? time : 0;
})();

const savedCurrentSong = (() => {
    const stored = safeGetLocalStorage("currentSong");
    return parseJSON(stored, null);
})();

const savedCurrentPlaylist = (() => {
    const stored = safeGetLocalStorage("currentPlaylist");
    const playlists = ["playlist", "online", "search", "favorites"];
    return playlists.includes(stored) ? stored : "playlist";
})();

const savedRadarSettings = (() => {
    const stored = safeGetLocalStorage("radarSettings");
    const parsed = parseJSON(stored, null);
    if (parsed && Array.isArray(parsed.genres)) {
        const valid = parsed.genres.filter(g => EXPLORE_RADAR_GENRES.includes(g));
        if (valid.length > 0) return { genres: valid };
    }
    return { genres: [...DEFAULT_RADAR_GENRES] };
})();

// 2. 构建状态单例
export const state = {
    radarSettings: savedRadarSettings,
    onlineSongs: [],
    searchResults: cloneSearchResults(savedLastSearchState?.results) || [],
    renderedSearchCount: 0,
    currentTrackIndex: savedCurrentTrackIndex,
    currentAudioUrl: null,
    lyricsData: [],
    currentLyricLine: -1,
    currentPlaylist: savedCurrentPlaylist, // 'online', 'search', or 'playlist'
    searchPage: savedLastSearchState?.page || 1,
    searchKeyword: savedLastSearchState?.keyword || "",
    searchSource: savedLastSearchState ? savedLastSearchState.source : savedSearchSource,
    hasMoreResults: typeof savedLastSearchState?.hasMore === "boolean" ? savedLastSearchState.hasMore : true,
    currentSong: savedCurrentSong,
    currentArtworkUrl: null,
    debugMode: false,
    isSearchMode: false,
    playlistSongs: savedPlaylistSongs,
    playMode: savedPlayMode,
    playlistLastNonRandomMode: savedPlayMode === "random" ? "list" : savedPlayMode,
    favoriteSongs: savedFavoriteSongs,
    currentFavoriteIndex: savedCurrentFavoriteIndex,
    currentList: savedCurrentList,
    favoritePlayMode: savedFavoritePlayMode,
    favoriteLastNonRandomMode: savedFavoritePlayMode === "random" ? "list" : savedFavoritePlayMode,
    favoritePlaybackTime: savedFavoritePlaybackTime,
    playbackQuality: savedPlaybackQuality,
    volume: savedVolume,
    previousVolume: savedVolume > 0 ? savedVolume : 0.8,
    currentPlaybackTime: savedPlaybackTime,
    lastSavedPlaybackTime: savedPlaybackTime,
    favoriteLastSavedPlaybackTime: savedFavoritePlaybackTime,
    pendingSeekTime: null,
    isSeeking: false,
    qualityMenuOpen: false,
    sourceMenuOpen: false,
    userScrolledLyrics: false,
    lyricsScrollTimeout: null,
    themeDefaultsCaptured: false,
    dynamicPalette: null,
    currentPaletteImage: null,
    pendingPaletteData: null,
    pendingPaletteImage: null,
    pendingPaletteImmediate: false,
    pendingPaletteReady: false,
    audioReadyForPalette: true,
    currentGradient: '',
    isMobileInlineLyricsOpen: false,
    selectedSearchResults: new Set(),
};

/**
 * 状态自洽性检查：
 * 如果当前指向的播放列表为空，则清除当前歌曲状态，防止“幽灵播放”
 */
export function validateStateConsistency(dom = null, callbacks = {}) {
    const isPlaylistEmpty = () => {
        if (state.currentPlaylist === 'playlist') return state.playlistSongs.length === 0;
        if (state.currentPlaylist === 'favorites') return state.favoriteSongs.length === 0;
        if (state.currentPlaylist === 'search') return state.searchResults.length === 0;
        if (state.currentPlaylist === 'online') return state.onlineSongs.length === 0;
        return false;
    };

    if (isPlaylistEmpty() && state.currentSong !== null) {
        if (typeof callbacks.debugLog === "function") callbacks.debugLog("检测到列表为空，清除幽灵播放歌曲");
        state.currentSong = null;
        state.currentTrackIndex = -1;
        state.currentAudioUrl = null;
        state.currentPlaybackTime = 0;
        
        safeRemoveLocalStorage("currentSong", { skipRemote: true });
        safeSetLocalStorage("currentTrackIndex", "-1", { skipRemote: true });
        
        if (dom) {
            if (dom.currentSongTitle) dom.currentSongTitle.textContent = "选择一首歌曲开始播放";
            if (dom.currentSongArtist) dom.currentSongArtist.textContent = "未知艺术家";
        }
        if (typeof callbacks.showAlbumCoverPlaceholder === "function") callbacks.showAlbumCoverPlaceholder();
        if (typeof callbacks.updateMobileToolbarTitle === "function") callbacks.updateMobileToolbarTitle();
        if (typeof callbacks.updatePlayPauseButton === "function") callbacks.updatePlayPauseButton();
    }
}

// 确保 currentList 状态正确
if (state.currentList === "favorite" && state.favoriteSongs.length === 0) {
    state.currentList = "playlist";
}
if (state.currentList === "favorite") {
    state.currentPlaylist = "favorites";
}

// 修正收藏夹索引
if (state.favoriteSongs.length === 0) {
    state.currentFavoriteIndex = 0;
} else if (state.currentFavoriteIndex >= state.favoriteSongs.length) {
    state.currentFavoriteIndex = state.favoriteSongs.length - 1;
}

// 挂载到 window，保证与原有代码及调试的兼容性
window.SolaraState = state;
