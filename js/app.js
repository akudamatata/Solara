/**
 * Solara 主应用总装入口 (App Assembly & Lifecycle Orchestrator)
 */

import {
    API,
    DEFAULT_RADAR_GENRES,
    EXPLORE_RADAR_GENRES,
    RADAR_PLAYLISTS,
    LAST_SEARCH_STATE_STORAGE_KEY,
    STORAGE_KEYS_TO_SYNC,
    normalizeQuality,
    normalizeSource
} from "./constants.js";
import { dom } from "./dom.js";
import { state, validateStateConsistency } from "./state.js";
import {
    safeSetLocalStorage,
    safeGetLocalStorage,
    parseJSON,
    persistentStorage,
    setRemoteSyncEnabled,
    isRemoteSyncEnabled,
    syncLocalDataToCloud,
    preferHttpsUrl
} from "./core/storage.js";
import {
    showAlbumCoverPlaceholder,
    setAlbumCoverImage,
    scheduleDeferredPaletteUpdate,
    applyDynamicGradient,
    cancelDeferredPaletteUpdate,
    attemptPaletteApplication,
    initTheme
} from "./visual/aurora.js";
import {
    initSpotlightEffect,
    createDebugLogger,
    initDebugShortcut
} from "./visual/spotlight.js";
import {
    loadLyrics,
    syncLyrics,
    clearLyricsIfLibraryEmpty,
    clearLyricsContent,
    scrollToCurrentLyric,
    initDesktopLyricsInteractions
} from "./features/lyrics.js";
import {
    initSettings,
    showNotification,
    applySettingsToUI
} from "./features/settings.js";
import {
    updateQualityLabel,
    updateSourceLabel,
    buildQualityMenu,
    buildSourceMenu,
    openPlayerQualityMenu,
    closePlayerQualityMenu,
    togglePlayerQualityMenu,
    openSourceMenu,
    closeSourceMenu,
    toggleSourceMenu,
    handlePlayerQualitySelection,
    handleSourceSelection
} from "./core/quality.js";
import {
    getSongKey,
    renderPlaylist,
    updatePlaylistHighlight,
    updatePlaylistActionStates,
    switchLibraryTab,
    clearPlaylist,
    removeFromPlaylist,
    exportPlaylist,
    handleImportPlaylistChange,
    updateAllTabsIndicators
} from "./features/playlist.js";
import {
    ensureFavoriteSongsArray,
    renderFavorites,
    updateFavoriteIcons,
    updateFavoriteHighlight,
    updateFavoriteActionStates,
    toggleFavorite,
    removeFavoriteAtIndex,
    addAllFavoritesToPlaylist,
    clearFavorites,
    exportFavorites,
    handleImportFavoritesChange
} from "./features/favorites.js";
import {
    toggleSearchMode,
    showSearchResults,
    hideSearchResults,
    performSearch,
    loadMoreResults,
    openImportSelectedMenu,
    closeImportSelectedMenu,
    importSelectedSearchResults,
    updateImportSelectedButton,
    displaySearchResults,
    restoreLastSearchResults,
    clearSearchResults
} from "./features/search.js";
import {
    updatePlayModeUI,
    togglePlayMode,
    toggleShuffleMode,
    updatePlayPauseButton,
    updateProgressBarBackground,
    updateVolumeSliderBackground,
    updateVolumeIcon,
    setAudioCurrentTime,
    playSong,
    autoPlayNext,
    playNext,
    playPrevious,
    downloadSong,
    formatTime,
    resetPlayerToIdle,
    cancelPendingPlayback
} from "./core/audio.js";
import { initMediaSession } from "./core/media-session.js";

const debugLog = createDebugLogger(state, dom);
initDebugShortcut(state, dom, debugLog);

const isMobileView = Boolean(window.__SOLARA_IS_MOBILE);

// 状态保存快捷方法
export function savePlayerState(options = {}) {
    const { skipRemote = false } = options;
    safeSetLocalStorage("playlistSongs", JSON.stringify(state.playlistSongs), { skipRemote });
    safeSetLocalStorage("currentTrackIndex", String(state.currentTrackIndex), { skipRemote });
    safeSetLocalStorage("playMode", state.playMode, { skipRemote });
    safeSetLocalStorage("playbackQuality", state.playbackQuality, { skipRemote });
    safeSetLocalStorage("playerVolume", String(state.volume), { skipRemote });
    safeSetLocalStorage("currentPlaylist", state.currentPlaylist, { skipRemote });
    safeSetLocalStorage("currentList", state.currentList, { skipRemote });
    if (state.currentSong) {
        safeSetLocalStorage("currentSong", JSON.stringify(state.currentSong), { skipRemote });
    } else {
        safeSetLocalStorage("currentSong", "", { skipRemote });
    }
    safeSetLocalStorage("currentPlaybackTime", String(state.currentPlaybackTime || 0), { skipRemote });
}

export function saveFavoriteState(options = {}) {
    const { skipRemote = false } = options;
    safeSetLocalStorage("favoriteSongs", JSON.stringify(state.favoriteSongs), { skipRemote });
    safeSetLocalStorage("currentFavoriteIndex", String(state.currentFavoriteIndex), { skipRemote });
    safeSetLocalStorage("favoritePlayMode", state.favoritePlayMode, { skipRemote });
    safeSetLocalStorage("favoritePlaybackTime", String(state.favoritePlaybackTime || 0), { skipRemote });
}

// 封面图片前端内存持久缓存
const coverPicMemoryCache = new Map();

// 歌曲信息更新
export async function updateCurrentSongInfo(song, options = {}) {
    const { loadArtwork = true } = options;
    if (!song) {
        dom.currentSongTitle.textContent = "选择一首歌曲开始播放";
        dom.currentSongArtist.textContent = "未知艺术家";
        showAlbumCoverPlaceholder(dom, state);
        updateFavoriteIcons(state, dom);
        return;
    }

    dom.currentSongTitle.textContent = song.name || "未知歌曲";
    dom.currentSongArtist.textContent = Array.isArray(song.artist)
        ? song.artist.join(" / ")
        : (song.artist || "未知艺术家");

    if (loadArtwork) {
        try {
            const cacheKey = `${song.source || 'netease'}_${song.pic_id || song.id}`;
            const isDirectUrl = (val) => typeof val === "string" && (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("//"));

            // 1. 优先命中前端内存缓存（0 网络请求）
            if (coverPicMemoryCache.has(cacheKey)) {
                const finalPicUrl = coverPicMemoryCache.get(cacheKey);
                debugLog(`[封面缓存] 命中内存缓存，无需请求网络`);
                setAlbumCoverImage(finalPicUrl, dom, state);
                scheduleDeferredPaletteUpdate(finalPicUrl, state, dom, {}, debugLog);
            }
            // 2. 歌曲本身自带直接可用的图片 URL（如雷达抓取到的数据），直接使用并存入缓存
            else if (isDirectUrl(song.pic)) {
                const finalPicUrl = preferHttpsUrl(song.pic);
                coverPicMemoryCache.set(cacheKey, finalPicUrl);
                setAlbumCoverImage(finalPicUrl, dom, state);
                scheduleDeferredPaletteUpdate(finalPicUrl, state, dom, {}, debugLog);
            }
            // 3. pic_id 本身就是图片 URL
            else if (isDirectUrl(song.pic_id)) {
                const finalPicUrl = preferHttpsUrl(song.pic_id);
                coverPicMemoryCache.set(cacheKey, finalPicUrl);
                setAlbumCoverImage(finalPicUrl, dom, state);
                scheduleDeferredPaletteUpdate(finalPicUrl, state, dom, {}, debugLog);
            }
            // 4. 确实没有直链时，才向后端请求 types=pic 解析
            else if (song.pic_id) {
                const picUrl = API.getPicUrl(song);
                debugLog(`[封面请求] 解析接口: ${picUrl}`);
                const picData = await API.fetchJson(picUrl, debugLog);
                if (picData && picData.url) {
                    const finalPicUrl = preferHttpsUrl(picData.url);
                    coverPicMemoryCache.set(cacheKey, finalPicUrl);
                    setAlbumCoverImage(finalPicUrl, dom, state);
                    scheduleDeferredPaletteUpdate(finalPicUrl, state, dom, {}, debugLog);
                } else {
                    showAlbumCoverPlaceholder(dom, state);
                }
            } else {
                showAlbumCoverPlaceholder(dom, state);
            }
        } catch (e) {
            console.warn("加载封面失败:", e);
            showAlbumCoverPlaceholder(dom, state);
        }
    }

    // 实时同步主播放界面爱心状态与列表收藏标记
    updateFavoriteIcons(state, dom);
}

let pendingArtworkTimer = null;

// 将某一首歌曲设为就绪待播状态（纯本地UI更新，不发起任何音频/歌词网络请求，避免连删时 API 洪峰）
export function setSongAsPending(song, index, listType = "playlist") {
    cancelPendingPlayback();

    if (!song) return;

    if (dom.audioPlayer) {
        try {
            dom.audioPlayer.pause();
            dom.audioPlayer.removeAttribute("src");
            dom.audioPlayer.src = "";
            dom.audioPlayer.load();
        } catch (e) {
            console.warn("停止音频播放异常:", e);
        }
    }

    state.isPlaying = false;
    state.currentSong = song;
    state.currentAudioUrl = null;
    state.currentPlaybackTime = 0;
    state.lastSavedPlaybackTime = 0;
    state.currentList = listType;
    state.currentPlaylist = listType === "favorite" ? "favorites" : "playlist";

    if (listType === "favorite") {
        state.currentFavoriteIndex = index;
        state.favoritePlaybackTime = 0;
        state.favoriteLastSavedPlaybackTime = 0;
        updateFavoriteHighlight(state, dom);
    } else {
        state.currentTrackIndex = index;
        updatePlaylistHighlight(state, dom);
    }

    // 重置进度条
    if (dom.progressBar) {
        dom.progressBar.value = 0;
        dom.progressBar.max = 0;
        updateProgressBarBackground(dom, 0, 1);
    }
    if (dom.currentTimeDisplay) dom.currentTimeDisplay.textContent = "00:00";
    if (dom.durationDisplay) dom.durationDisplay.textContent = "00:00";

    // 播放按钮重置为待播（播放图标）
    updatePlayPauseButton(dom);

    // 纯本地文字更新，0 次网络 API
    if (dom.currentSongTitle) dom.currentSongTitle.textContent = song.name || "未知歌曲";
    if (dom.currentSongArtist) {
        dom.currentSongArtist.textContent = Array.isArray(song.artist)
            ? song.artist.join(" / ")
            : (song.artist || "未知艺术家");
    }

    // 同步爱心图标
    updateFavoriteIcons(state, dom);

    // 清空歌词（待播期间不发歌词 API）
    clearLyricsContent(state, dom, isMobileView);

    // 封面防抖加载（400ms）：连删时多次触发会被自动清空，停手后才为最终曲目拉取 1 次
    if (pendingArtworkTimer) {
        clearTimeout(pendingArtworkTimer);
        pendingArtworkTimer = null;
    }
    pendingArtworkTimer = setTimeout(() => {
        if (state.currentSong && state.currentSong === song) {
            updateCurrentSongInfo(song, { loadArtwork: true });
        }
    }, 400);

    savePlayerState();
}

// 播放列表中单曲点击播放
export async function playPlaylistSong(index, options = {}) {
    if (index < 0 || index >= state.playlistSongs.length) return;

    const song = state.playlistSongs[index];
    state.currentTrackIndex = index;
    state.currentPlaylist = "playlist";
    state.currentList = "playlist";

    try {
        await playSong(song, options, state, dom, getAudioCallbacks(), debugLog);
        updatePlaylistHighlight(state, dom);
        updatePlayModeUI(state, dom);
    } catch (error) {
        console.error("播放失败:", error);
        showNotification("播放失败，请稍后重试", "error", dom);
    }
}

// 播放收藏列表中单曲
export async function playFavoriteSong(index, options = {}) {
    const favorites = ensureFavoriteSongsArray(state);
    if (index < 0 || index >= favorites.length) {
        return;
    }

    const song = favorites[index];
    state.currentFavoriteIndex = index;
    state.currentList = "favorite";
    state.currentPlaylist = "favorites";

    try {
        await playSong(song, options, state, dom, getAudioCallbacks(), debugLog);
        updateFavoriteHighlight(state, dom);
        updatePlayModeUI(state, dom);
        saveFavoriteState();
    } catch (error) {
        console.error("播放收藏歌曲失败:", error);
        showNotification("播放收藏歌曲失败", "error", dom);
    }
}

// 播放搜索结果单曲
export async function playSearchResult(index) {
    if (index < 0 || index >= state.searchResults.length) return;
    const song = state.searchResults[index];
    if (!song) return;

    // 播放搜索结果单曲后，自动收起搜索面板返回首页（保留输入框关键词与搜索结果缓存）
    hideSearchResults(state, dom);
    if (window.SolaraMobileBridge?.handlers?.closeSearch) {
        window.SolaraMobileBridge.handlers.closeSearch();
    }

    // 检查歌曲是否已在播放列表中
    let existingIndex = state.playlistSongs.findIndex(s => getSongKey(s) === getSongKey(song));
    if (existingIndex !== -1) {
        state.currentTrackIndex = existingIndex;
    } else {
        state.playlistSongs.push(song);
        state.currentTrackIndex = state.playlistSongs.length - 1;
        renderPlaylist(state, dom, getPlaylistCallbacks());
    }

    state.currentPlaylist = "playlist";
    state.currentList = "playlist";
    savePlayerState();

    try {
        await playSong(song, {}, state, dom, getAudioCallbacks(), debugLog);
        updatePlaylistHighlight(state, dom);
        updatePlayModeUI(state, dom);
    } catch (error) {
        console.error("播放搜索结果失败:", error);
        showNotification("播放失败，请稍后重试", "error", dom);
    }
}

function getAudioCallbacks() {
    return {
        updateCurrentSongInfo,
        updateFavoriteIcons: () => updateFavoriteIcons(state, dom),
        savePlayerState,
        saveFavoriteState,
        clearLyricsIfLibraryEmpty: () => clearLyricsIfLibraryEmpty(state, dom, isMobileView),
        playPlaylistSong,
        playFavoriteSong,
        playSearchResult,
        scheduleDeferredSongAssets: (song, playPromise) => {
            const run = () => {
                if (state.currentSong !== song) return;
                updateCurrentSongInfo(song, { loadArtwork: true });
                loadLyrics(song, state, dom, debugLog);
                state.audioReadyForPalette = true;
                attemptPaletteApplication(state, dom);
            };
            if (playPromise && typeof playPromise.finally === "function") {
                playPromise.finally(run);
            } else {
                run();
            }
        }
    };
}

function getPlaylistCallbacks() {
    return {
        savePlayerState,
        cancelPendingPlayback: () => cancelPendingPlayback(),
        playPlaylistSong: (idx, opts) => playPlaylistSong(idx, opts),
        setSongAsPending: (song, idx, type) => setSongAsPending(song, idx, type),
        showAlbumCoverPlaceholder: () => showAlbumCoverPlaceholder(dom, state),
        clearLyricsContent: () => clearLyricsContent(state, dom, isMobileView),
        resetPlayerToIdle: () => resetPlayerToIdle(state, dom, {
            showAlbumCoverPlaceholder: () => showAlbumCoverPlaceholder(dom, state),
            clearLyricsContent: () => clearLyricsContent(state, dom, isMobileView),
            updateFavoriteIcons: () => updateFavoriteIcons(state, dom),
            savePlayerState,
        }),
        updateFavoriteIcons: () => updateFavoriteIcons(state, dom),
        updateMobileClearPlaylistVisibility: () => {
            if (dom.mobileClearPlaylistBtn) {
                const hasSongs = state.playlistSongs.length > 0;
                dom.mobileClearPlaylistBtn.disabled = !hasSongs;
                dom.mobileClearPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
            }
        },
        clearLyricsIfLibraryEmpty: () => clearLyricsIfLibraryEmpty(state, dom, isMobileView)
    };
}

function showQualityMenu(event, index, type) {
    event.stopPropagation();

    // 移除已存在的动态质量菜单
    const existingMenu = document.querySelector(".dynamic-quality-menu");
    if (existingMenu) {
        existingMenu.remove();
    }

    let song = null;
    if (type === "search") {
        song = state.searchResults?.[index];
    } else if (type === "online") {
        song = state.onlineSongs?.[index];
    } else if (type === "playlist") {
        song = state.playlistSongs?.[index];
    } else if (type === "favorites") {
        song = state.favoriteSongs?.[index];
    }

    if (!song) return;

    // 创建精致的毛玻璃质量菜单
    const menu = document.createElement("div");
    menu.className = "dynamic-quality-menu";
    menu.innerHTML = `
        <div class="quality-option" data-quality="128">
            <span>标准音质</span><small>128 kbps</small>
        </div>
        <div class="quality-option" data-quality="192">
            <span>高音质</span><small>192 kbps</small>
        </div>
        <div class="quality-option" data-quality="320">
            <span>超高音质</span><small>320 kbps</small>
        </div>
        <div class="quality-option" data-quality="999">
            <span>无损音质</span><small>FLAC / Hi-Res</small>
        </div>
    `;

    menu.querySelectorAll(".quality-option").forEach((opt) => {
        opt.addEventListener("click", async (e) => {
            e.stopPropagation();
            const q = opt.dataset.quality || "320";
            menu.classList.remove("show");
            setTimeout(() => menu.remove(), 160);
            await downloadSong(song, q, dom);
        });
    });

    const button = event.target.closest("button") || event.target;
    const rect = button ? button.getBoundingClientRect() : { bottom: event.clientY, right: event.clientX, left: event.clientX, top: event.clientY };
    const menuWidth = 196;
    let left = rect.right - menuWidth;
    if (left < 12) left = 12;
    if (left + menuWidth > window.innerWidth - 12) left = window.innerWidth - menuWidth - 12;

    let top = rect.bottom + 6;
    if (top + 200 > window.innerHeight && rect.top > 210) {
        top = rect.top - 180;
        menu.classList.add("open-upwards");
    }

    menu.style.position = "fixed";
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.zIndex = "100000";

    document.body.appendChild(menu);

    requestAnimationFrame(() => {
        menu.classList.add("show");
    });

    setTimeout(() => {
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.classList.remove("show");
                setTimeout(() => menu.remove(), 160);
                document.removeEventListener("click", closeMenu);
            }
        };
        document.addEventListener("click", closeMenu);
    }, 10);
}

function getSearchCallbacks() {
    return {
        closeSourceMenu: () => closeSourceMenu(state, dom),
        updateFavoriteIcons: () => updateFavoriteIcons(state, dom),
        toggleFavorite: (song) => toggleFavorite(song, state, dom, { saveFavoriteState }),
        playSearchResult,
        showQualityMenu: (e, idx) => showQualityMenu(e, idx, "search")
    };
}

// 探索雷达逻辑
export async function exploreOnlineMusic() {
    const desktopButton = dom.loadOnlineBtn;
    const mobileButton = dom.mobileExploreButton;
    const btnText = desktopButton ? desktopButton.querySelector(".btn-text") : null;
    const loader = desktopButton ? desktopButton.querySelector(".loader") : null;

    const setLoadingState = (isLoading) => {
        if (desktopButton) {
            desktopButton.disabled = isLoading;
            desktopButton.classList.toggle("is-loading", Boolean(isLoading));
            if (btnText) btnText.style.display = isLoading ? "none" : "";
            if (loader) loader.style.display = isLoading ? "inline-flex" : "none";
        }
        if (mobileButton) {
            mobileButton.disabled = isLoading;
            mobileButton.setAttribute("aria-disabled", isLoading ? "true" : "false");
        }
    };

    try {
        setLoadingState(true);

        // 获取用户在设置中勾选的榜单（若未配置或空则默认全选默认三大榜单）
        const selectedGenres = Array.isArray(state?.radarSettings?.genres) && state.radarSettings.genres.length > 0
            ? state.radarSettings.genres
            : DEFAULT_RADAR_GENRES;

        const availablePlaylists = (Array.isArray(RADAR_PLAYLISTS) ? RADAR_PLAYLISTS : [])
            .filter(p => selectedGenres.includes(p.name) || selectedGenres.includes(p.id));

        const pool = availablePlaylists.length > 0 ? availablePlaylists : RADAR_PLAYLISTS;
        const targetPlaylist = (pool.length > 0)
            ? pool[Math.floor(Math.random() * pool.length)]
            : { id: "3778678", name: "热歌榜" };

        debugLog(`[音乐雷达] 从设置榜单 [${selectedGenres.join(" / ")}] 随机抽选【${targetPlaylist.name}】(ID: ${targetPlaylist.id})，正在抓取 Top 20...`);

        const results = await API.getRadarPlaylist(targetPlaylist.id, { limit: 20 });
        if (!Array.isArray(results) || results.length === 0) {
            debugLog(`[音乐雷达] 未能从【${targetPlaylist.name}】获取到数据`);
            showNotification(`探索雷达：未能从【${targetPlaylist.name}】获取到歌曲`, "error", dom);
            return;
        }

        const normalizedSongs = results.map((song) => ({
            id: song.id,
            name: song.name,
            artist: Array.isArray(song.artist) ? song.artist.join(" / ") : (song.artist || "未知艺术家"),
            album: song.album || "",
            source: song.source || "netease",
            lyric_id: song.lyric_id || song.id,
            pic: song.pic || "",
            pic_id: song.pic_id || "",
            url_id: song.url_id || song.id,
        }));

        const existingSongs = Array.isArray(state.playlistSongs) ? state.playlistSongs.slice() : [];
        const existingKeys = new Set(existingSongs.map(getSongKey).filter(Boolean));

        const appendedSongs = [];
        for (const song of normalizedSongs) {
            const key = getSongKey(song);
            if (key && existingKeys.has(key)) continue;
            appendedSongs.push(song);
            if (key) existingKeys.add(key);
        }

        if (appendedSongs.length === 0) {
            debugLog(`[音乐雷达] 本次抓取内容与现有播放列表完全重合，无新增歌曲`);
            showNotification(`探索雷达：已刷新【${targetPlaylist.name}】前20首，当前列表已全部包含`, "info", dom);
            return;
        }

        debugLog(`[音乐雷达] 抓取完成！从【${targetPlaylist.name}】成功引入 ${appendedSongs.length} 首全新曲目`);

        state.playlistSongs = existingSongs.concat(appendedSongs);
        state.currentPlaylist = "playlist";
        state.currentList = "playlist";

        renderPlaylist(state, dom, getPlaylistCallbacks());
        updatePlaylistHighlight(state, dom);

        showNotification(`探索雷达：已从【${targetPlaylist.name}】精选前20首，新增 ${appendedSongs.length} 首曲目`, "success", dom);

        if (existingSongs.length === 0 && state.playlistSongs.length > 0) {
            await playPlaylistSong(0);
        } else {
            savePlayerState();
        }
    } catch (error) {
        console.error("探索雷达错误:", error);
        debugLog(`[音乐雷达] 抓取异常: ${error.message || error}`);
        showNotification("探索雷达获取失败，请稍后重试", "error", dom);
    } finally {
        setLoadingState(false);
    }
}

// 播放/暂停快捷切换
export async function togglePlayPause() {
    if (!state.currentSong) {
        if (state.playlistSongs.length > 0) {
            const targetIndex = state.currentTrackIndex >= 0 && state.currentTrackIndex < state.playlistSongs.length
                ? state.currentTrackIndex
                : 0;
            await playPlaylistSong(targetIndex);
        } else {
            showNotification("播放列表为空，请先添加歌曲", "error", dom);
        }
        return;
    }

    if (!dom.audioPlayer.src) {
        try {
            await playSong(state.currentSong, {
                autoplay: true,
                startTime: state.currentPlaybackTime,
                preserveProgress: true,
            }, state, dom, getAudioCallbacks(), debugLog);
        } catch (error) {
            console.error("恢复播放失败:", error);
            showNotification("播放失败，请稍后重试", "error", dom);
        }
        return;
    }

    if (dom.audioPlayer.paused) {
        debugLog(`[播放控制] 恢复播放: ${state.currentSong?.name || "当前歌曲"}`);
        const playPromise = dom.audioPlayer.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error("播放失败:", error);
                debugLog(`[播放异常] 恢复播放被浏览器限制: ${error?.message || error}`);
                showNotification("播放失败，请检查网络连接", "error", dom);
            });
        }
    } else {
        debugLog(`[播放控制] 暂停播放: ${state.currentSong?.name || "当前歌曲"}`);
        dom.audioPlayer.pause();
    }
}

// 全局事件装配
function setupEventHandlers() {
    // 播放 / 暂停
    if (dom.playPauseBtn) {
        dom.playPauseBtn.addEventListener("click", togglePlayPause);
    }

    // 当前歌曲收藏 / 取消收藏切换
    if (dom.currentFavoriteToggle) {
        dom.currentFavoriteToggle.addEventListener("click", () => {
            if (!state.currentSong) return;
            toggleFavorite(state.currentSong, state, dom, { saveFavoriteState });
        });
    }

    // 播放模式与随机
    if (dom.playModeBtn) {
        dom.playModeBtn.addEventListener("click", () => togglePlayMode(state, dom, { savePlayerState, saveFavoriteState }, isMobileView));
    }
    if (dom.shuffleToggleBtn) {
        dom.shuffleToggleBtn.addEventListener("click", () => toggleShuffleMode(state, dom, { savePlayerState, saveFavoriteState }));
    }

    // 音量与进度条
    if (dom.volumeSlider) {
        dom.volumeSlider.addEventListener("input", (e) => {
            const volume = Number.parseFloat(e.target.value);
            const clamped = Number.isFinite(volume) ? Math.min(Math.max(volume, 0), 1) : 0.8;
            dom.audioPlayer.volume = clamped;
            state.volume = clamped;
            updateVolumeSliderBackground(dom, clamped);
            updateVolumeIcon(dom, clamped);
            safeSetLocalStorage("playerVolume", String(clamped));
        });
    }

    if (dom.progressBar) {
        dom.progressBar.addEventListener("input", () => {
            state.isSeeking = true;
            const value = Number(dom.progressBar.value);
            dom.currentTimeDisplay.textContent = formatTime(value);
            updateProgressBarBackground(dom, value, Number(dom.progressBar.max));
        });

        dom.progressBar.addEventListener("change", () => {
            const value = Number(dom.progressBar.value);
            state.isSeeking = false;
            setAudioCurrentTime(value, state, dom);
        });
    }

    // Audio 原生事件
    dom.audioPlayer.addEventListener("play", () => updatePlayPauseButton(dom));
    dom.audioPlayer.addEventListener("pause", () => updatePlayPauseButton(dom));
    dom.audioPlayer.addEventListener("ended", () => autoPlayNext(state, dom, getAudioCallbacks()));
    dom.audioPlayer.addEventListener("timeupdate", () => {
        const currentTime = dom.audioPlayer.currentTime || 0;
        if (!state.isSeeking) {
            dom.progressBar.value = currentTime;
            dom.currentTimeDisplay.textContent = formatTime(currentTime);
            updateProgressBarBackground(dom, currentTime, Number(dom.progressBar.max));
        }
        syncLyrics(state, dom);
    });
    dom.audioPlayer.addEventListener("loadedmetadata", () => {
        const duration = dom.audioPlayer.duration || 0;
        dom.progressBar.max = duration;
        dom.durationDisplay.textContent = formatTime(duration);
        const storedTime = state.currentList === "favorite" ? state.favoritePlaybackTime : state.currentPlaybackTime;
        dom.progressBar.value = storedTime;
        dom.currentTimeDisplay.textContent = formatTime(storedTime);
        updateProgressBarBackground(dom, storedTime, duration);
    });

    // 搜索交互
    if (dom.searchBtn) {
        dom.searchBtn.addEventListener("click", (e) => {
            e.preventDefault();
            performSearch(false, state, dom, getSearchCallbacks(), debugLog);
        });
    }

    if (dom.searchInput) {
        const updateClearBtnVisibility = () => {
            const hasText = Boolean(dom.searchInput.value && dom.searchInput.value.trim().length > 0);
            if (dom.searchClearBtn) {
                dom.searchClearBtn.style.display = hasText ? "flex" : "none";
            }
            if (!hasText) {
                clearSearchResults(state, dom);
            }
        };

        dom.searchInput.addEventListener("input", updateClearBtnVisibility);

        // 核心：点击或聚焦输入框时，展开搜索面板并呈现最后一次的搜索结果
        const handleSearchInputActivate = () => {
            // 检查是否存在可恢复的搜索结果或缓存
            const hasMemoryResults = Array.isArray(state.searchResults) && state.searchResults.length > 0;
            const rawStored = safeGetLocalStorage(LAST_SEARCH_STATE_STORAGE_KEY);
            let hasStoredResults = false;
            let storedKeyword = "";
            if (rawStored) {
                try {
                    const parsed = JSON.parse(rawStored);
                    if (parsed && Array.isArray(parsed.results) && parsed.results.length > 0) {
                        hasStoredResults = true;
                        storedKeyword = parsed.keyword || "";
                    }
                } catch (e) {}
            }

            const canRestore = hasMemoryResults || hasStoredResults;

            // 无论是否有历史记录，点击输入框均展示搜索视图
            if (!state.isSearchMode) {
                showSearchResults(state, dom);
            } else if (dom.searchResults) {
                dom.searchResults.removeAttribute("hidden");
                dom.searchResults.setAttribute("aria-hidden", "false");
                dom.searchResults.classList.add("show");
            }

            if (canRestore) {
                // 若输入框当前为空，自动恢复上次搜索词
                const currentVal = dom.searchInput.value ? dom.searchInput.value.trim() : "";
                if (!currentVal) {
                    const keywordToRestore = state.searchKeyword || storedKeyword;
                    if (keywordToRestore) {
                        dom.searchInput.value = keywordToRestore;
                        state.searchKeyword = keywordToRestore;
                    }
                }

                // 更新清空小叉号显隐
                if (dom.searchClearBtn) {
                    const hasText = Boolean(dom.searchInput.value && dom.searchInput.value.trim().length > 0);
                    dom.searchClearBtn.style.display = hasText ? "flex" : "none";
                }

                // 检查 DOM 结果列表中是否已经渲染有条目
                const listContainer = dom.searchResultsList || dom.searchResults;
                const hasRenderedItems = listContainer && listContainer.querySelectorAll(".search-result-item").length > 0;
                if (!hasRenderedItems) {
                    restoreLastSearchResults(state, dom, getSearchCallbacks(), { showView: true });
                } else if (listContainer) {
                    listContainer.classList.remove("is-searching");
                }
            } else {
                // 确实没有搜索记录（如首次进入或主动点击叉号清空后），确保引导框处于就绪状态
                const listContainer = dom.searchResultsList || dom.searchResults;
                if (listContainer) {
                    listContainer.classList.remove("is-searching");
                }
                if (dom.searchClearBtn) {
                    dom.searchClearBtn.style.display = "none";
                }
            }

            // 移动端联动
            if (isMobileView && window.SolaraMobileBridge?.handlers?.openSearch) {
                const isOpen = document.body?.classList.contains("mobile-search-open");
                if (!isOpen) {
                    window.SolaraMobileBridge.handlers.openSearch();
                }
            }
        };

        dom.searchInput.addEventListener("focus", handleSearchInputActivate);
        dom.searchInput.addEventListener("click", handleSearchInputActivate);

        const searchInputWrapper = dom.searchInput.closest(".search-input-wrapper");
        if (searchInputWrapper) {
            searchInputWrapper.addEventListener("click", (e) => {
                if (e.target.closest("#searchClearBtn")) return;
                if (document.activeElement !== dom.searchInput) {
                    dom.searchInput.focus();
                } else {
                    handleSearchInputActivate();
                }
            });
        }

        if (dom.searchClearBtn) {
            dom.searchClearBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (dom.searchInput) {
                    dom.searchInput.value = "";
                }
                clearSearchResults(state, dom);
                updateClearBtnVisibility();
                if (dom.searchInput) {
                    dom.searchInput.focus();
                }
            });
        }

        dom.searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                performSearch(false, state, dom, getSearchCallbacks(), debugLog);
            }
        });
    }

    // 搜索结果列表内部事件委托（加载更多）
    const handleLoadMoreClick = (e) => {
        const loadMore = e.target.closest("#loadMoreBtn") || e.target.closest(".load-more-btn");
        if (loadMore) {
            e.preventDefault();
            e.stopPropagation();
            loadMoreResults(state, dom, getSearchCallbacks(), debugLog);
        }
    };

    if (dom.searchResults) {
        dom.searchResults.addEventListener("click", handleLoadMoreClick);
    }
    if (dom.searchResultsList) {
        dom.searchResultsList.addEventListener("click", handleLoadMoreClick);
    }

    // 探索雷达
    if (dom.loadOnlineBtn) {
        dom.loadOnlineBtn.addEventListener("click", exploreOnlineMusic);
    }
    if (dom.mobileExploreButton) {
        dom.mobileExploreButton.addEventListener("click", exploreOnlineMusic);
    }

    // 播放列表与收藏夹项事件委托
    if (dom.playlistItems) {
        dom.playlistItems.addEventListener("click", (e) => {
            const item = e.target.closest(".playlist-item");
            if (!item) return;

            const index = Number(item.dataset.index);
            const actionContainer = e.target.closest(".playlist-item-actions");
            const removeBtn = e.target.closest(".playlist-item-remove");
            const favBtn = e.target.closest(".playlist-item-favorite");
            const dlBtn = e.target.closest(".playlist-item-download");

            // 1. 若点击命中操作容器槽或具体某个按钮
            if (actionContainer || removeBtn || favBtn || dlBtn) {
                e.stopPropagation();

                if (removeBtn) {
                    removeFromPlaylist(index, state, dom, getPlaylistCallbacks());
                    return;
                }

                if (favBtn) {
                    const song = state.playlistSongs[index];
                    if (song) toggleFavorite(song, state, dom, { saveFavoriteState });
                    return;
                }

                if (dlBtn) {
                    showQualityMenu(e, index, "playlist");
                    return;
                }

                // 点在操作槽缝隙或边缘空白：直接返回，绝对禁止触发整曲播放！
                return;
            }

            // 2. 坐标级物理防御：卡片右侧 160px（操作区域全范围）哪怕未命中具体元素，也绝禁止触发播放
            const itemRect = item.getBoundingClientRect();
            if (e.clientX && e.clientX >= itemRect.right - 160) {
                e.stopPropagation();
                return;
            }

            // 3. 点击左侧歌曲名/歌手信息区域，触发播放
            e.stopPropagation(); // 阻止冒泡到全局 handleGlobalClickOutside，防止抽屉被误关
            playPlaylistSong(index);
        });
    }

    if (dom.favoriteItems) {
        dom.favoriteItems.addEventListener("click", (e) => {
            const item = e.target.closest(".playlist-item");
            if (!item) return;

            const index = Number(item.dataset.index);
            const actionContainer = e.target.closest(".playlist-item-actions");
            const addBtn = e.target.closest(".favorite-item-action--add");
            const removeBtn = e.target.closest(".favorite-item-action--remove");
            const dlBtn = e.target.closest(".favorite-item-action--download");

            // 1. 若点击命中操作容器槽或具体某个按钮
            if (actionContainer || addBtn || removeBtn || dlBtn) {
                e.stopPropagation();

                if (addBtn) {
                    const song = state.favoriteSongs[index];
                    if (song) {
                        if (!Array.isArray(state.playlistSongs)) {
                            state.playlistSongs = [];
                        }
                        const key = getSongKey(song);
                        const exists = state.playlistSongs.some((item) => getSongKey(item) === key);
                        if (exists) {
                            if (typeof addBtn.animate === "function") {
                                addBtn.animate([
                                    { transform: "translateX(0)" },
                                    { transform: "translateX(-4px)" },
                                    { transform: "translateX(4px)" },
                                    { transform: "translateX(0)" }
                                ], { duration: 250, easing: "ease-in-out" });
                            }
                            showNotification("播放列表已包含该歌曲", "warning", dom);
                            return;
                        }
                        state.playlistSongs.push({ ...song });
                        savePlayerState();
                        renderPlaylist(state, dom, getPlaylistCallbacks());

                        // 即时视觉微反馈：加号变为绿色对号，并伴随弹性缩放动画
                        const originalHtml = addBtn.innerHTML;
                        addBtn.innerHTML = '<i class="fas fa-check" style="color: #34c759;"></i>';
                        if (typeof addBtn.animate === "function") {
                            addBtn.animate([
                                { transform: "scale(0.8)" },
                                { transform: "scale(1.2)" },
                                { transform: "scale(1)" }
                            ], { duration: 280, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });
                        }
                        setTimeout(() => {
                            addBtn.innerHTML = originalHtml;
                        }, 1400);

                        showNotification("已添加到播放列表", "success", dom);
                    }
                    return;
                }

                if (removeBtn) {
                    removeFavoriteAtIndex(index, state, dom, {
                        saveFavoriteState,
                        cancelPendingPlayback: () => cancelPendingPlayback(),
                        playFavoriteSong: (idx, opts) => playFavoriteSong(idx, opts),
                        setSongAsPending: (song, idx, type) => setSongAsPending(song, idx, type),
                        updatePlayModeUI: () => updatePlayModeUI(state, dom),
                        resetPlayerToIdle: () => resetPlayerToIdle(state, dom, {
                            showAlbumCoverPlaceholder: () => showAlbumCoverPlaceholder(dom, state),
                            clearLyricsContent: () => clearLyricsContent(state, dom, isMobileView),
                            updateFavoriteIcons: () => updateFavoriteIcons(state, dom),
                            savePlayerState,
                        }),
                        clearLyricsIfLibraryEmpty: () => clearLyricsIfLibraryEmpty(state, dom, isMobileView)
                    });
                    return;
                }

                if (dlBtn) {
                    showQualityMenu(e, index, "favorites");
                    return;
                }

                // 点在操作槽缝隙或边缘空白：直接返回，绝对禁止触发整曲播放！
                return;
            }

            // 2. 坐标级物理防御：卡片右侧 160px（操作区域全范围）哪怕未命中具体元素，也绝禁止触发播放
            const favItemRect = item.getBoundingClientRect();
            if (e.clientX && e.clientX >= favItemRect.right - 160) {
                e.stopPropagation();
                return;
            }

            // 3. 点击左侧歌曲名/歌手信息区域，触发播放
            e.stopPropagation(); // 阻止冒泡到全局 handleGlobalClickOutside，防止抽屉被误关
            playFavoriteSong(index);
        });
    }

    // 移动端抽屉顶栏操作组联动函数
    const updateMobileLibraryActionVisibility = (showFavorites) => {
        if (dom.mobilePlaylistActions) {
            dom.mobilePlaylistActions.hidden = showFavorites;
            dom.mobilePlaylistActions.setAttribute("aria-hidden", showFavorites ? "true" : "false");
        }
        if (dom.mobileFavoritesActions) {
            dom.mobileFavoritesActions.hidden = !showFavorites;
            dom.mobileFavoritesActions.setAttribute("aria-hidden", !showFavorites ? "true" : "false");
        }
        updatePlaylistActionStates(state, dom);
        updateFavoriteActionStates(state, dom);
    };

    // 标签页切换
    if (dom.libraryTabs) {
        dom.libraryTabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                const target = tab.dataset.target === "favorites" ? "favorites" : "playlist";
                switchLibraryTab(target, dom, { updateMobileLibraryActionVisibility });
            });
        });
    }

    // 播放列表导入与导出
    if (dom.importPlaylistBtn && dom.importPlaylistInput) {
        dom.importPlaylistBtn.addEventListener("click", () => {
            dom.importPlaylistInput.value = "";
            dom.importPlaylistInput.click();
        });
    }
    if (dom.mobileImportPlaylistBtn && dom.importPlaylistInput) {
        dom.mobileImportPlaylistBtn.addEventListener("click", () => {
            dom.importPlaylistInput.value = "";
            dom.importPlaylistInput.click();
        });
    }
    if (dom.importPlaylistInput) {
        dom.importPlaylistInput.addEventListener("change", (e) => {
            handleImportPlaylistChange(e, state, dom, {
                savePlayerState,
                renderPlaylist: () => renderPlaylist(state, dom, getPlaylistCallbacks())
            });
        });
    }
    if (dom.exportPlaylistBtn) {
        dom.exportPlaylistBtn.addEventListener("click", () => exportPlaylist(state, dom));
    }
    if (dom.mobileExportPlaylistBtn) {
        dom.mobileExportPlaylistBtn.addEventListener("click", () => exportPlaylist(state, dom));
    }
    if (dom.clearPlaylistBtn) {
        dom.clearPlaylistBtn.addEventListener("click", () => clearPlaylist(state, dom, getPlaylistCallbacks()));
    }
    if (dom.mobileClearPlaylistBtn) {
        dom.mobileClearPlaylistBtn.addEventListener("click", () => clearPlaylist(state, dom, getPlaylistCallbacks()));
    }

    // 收藏列表导入与导出
    if (dom.importFavoritesBtn && dom.importFavoritesInput) {
        dom.importFavoritesBtn.addEventListener("click", () => {
            dom.importFavoritesInput.value = "";
            dom.importFavoritesInput.click();
        });
    }
    if (dom.mobileImportFavoritesBtn && dom.importFavoritesInput) {
        dom.mobileImportFavoritesBtn.addEventListener("click", () => {
            dom.importFavoritesInput.value = "";
            dom.importFavoritesInput.click();
        });
    }
    if (dom.importFavoritesInput) {
        dom.importFavoritesInput.addEventListener("change", (e) => {
            handleImportFavoritesChange(e, state, dom, {
                saveFavoriteState,
                renderFavorites: () => renderFavorites(state, dom)
            });
        });
    }
    if (dom.exportFavoritesBtn) {
        dom.exportFavoritesBtn.addEventListener("click", () => exportFavorites(state, dom));
    }
    if (dom.mobileExportFavoritesBtn) {
        dom.mobileExportFavoritesBtn.addEventListener("click", () => exportFavorites(state, dom));
    }
    const handleClearFavorites = () => clearFavorites(state, dom, {
        saveFavoriteState,
        resetPlayerToIdle: () => resetPlayerToIdle(state, dom, {
            showAlbumCoverPlaceholder: () => showAlbumCoverPlaceholder(dom, state),
            clearLyricsContent: () => clearLyricsContent(state, dom, isMobileView),
            updateFavoriteIcons: () => updateFavoriteIcons(state, dom),
            savePlayerState,
        }),
        clearLyricsIfLibraryEmpty: () => clearLyricsIfLibraryEmpty(state, dom, isMobileView)
    });
    if (dom.clearFavoritesBtn) {
        dom.clearFavoritesBtn.addEventListener("click", handleClearFavorites);
    }
    if (dom.mobileClearFavoritesBtn) {
        dom.mobileClearFavoritesBtn.addEventListener("click", handleClearFavorites);
    }

    // 全部添加到播放列表
    if (dom.addAllFavoritesBtn) {
        dom.addAllFavoritesBtn.addEventListener("click", () => addAllFavoritesToPlaylist(state, dom, { 
            renderPlaylist: () => renderPlaylist(state, dom, getPlaylistCallbacks()),
            savePlayerState 
        }));
    }
    if (dom.mobileAddAllFavoritesBtn) {
        dom.mobileAddAllFavoritesBtn.addEventListener("click", () => addAllFavoritesToPlaylist(state, dom, { 
            renderPlaylist: () => renderPlaylist(state, dom, getPlaylistCallbacks()),
            savePlayerState 
        }));
    }

    // 批量导入
    if (dom.importSelectedBtn) {
        dom.importSelectedBtn.addEventListener("click", () => openImportSelectedMenu(dom));
    }
    if (dom.importToPlaylist) {
        dom.importToPlaylist.addEventListener("click", () => importSelectedSearchResults("playlist", state, dom, {
            savePlayerState,
            renderPlaylist: () => renderPlaylist(state, dom, getPlaylistCallbacks())
        }));
    }
    if (dom.importToFavorites) {
        dom.importToFavorites.addEventListener("click", () => importSelectedSearchResults("favorites", state, dom, {
            saveFavoriteState,
            renderFavorites: () => renderFavorites(state, dom)
        }));
    }

    // 监听移动端抽屉 Tab 切换事件，确保顶栏按钮与列表状态即时刷新
    window.addEventListener("solara:mobile-tab-changed", (e) => {
        const isFav = e.detail?.tab === "favorites";
        updateMobileLibraryActionVisibility(isFav);
        if (isFav) {
            renderFavorites(state, dom);
        } else {
            renderPlaylist(state, dom, getPlaylistCallbacks());
        }
    });

    // 浮动菜单
    if (dom.sourceSelectButton) {
        dom.sourceSelectButton.addEventListener("click", (e) => toggleSourceMenu(e, state, dom, isMobileView));
    }
    if (dom.sourceMenu) {
        dom.sourceMenu.addEventListener("click", (e) => handleSourceSelection(e, state, dom, {
            showNotification,
            onSourceChange: (newSource) => {
                debugLog(`[音源配置] 已切换音源为: ${newSource} (不自动触发搜索)`);
            }
        }));
    }
    if (dom.qualityToggle) {
        dom.qualityToggle.addEventListener("click", (e) => togglePlayerQualityMenu(e, state, dom, isMobileView));
    }
    if (dom.mobileQualityToggle) {
        dom.mobileQualityToggle.addEventListener("click", (e) => togglePlayerQualityMenu(e, state, dom, isMobileView));
    }
    if (dom.playerQualityMenu) {
        dom.playerQualityMenu.addEventListener("click", (e) => handlePlayerQualitySelection(e, state, dom, {
            savePlayerState,
            showNotification,
            reloadCurrentSong: async () => {
                if (!state.currentSong) return true;
                const wasPlaying = !dom.audioPlayer.paused;
                const targetTime = dom.audioPlayer.currentTime || state.currentPlaybackTime || 0;
                try {
                    await playSong(state.currentSong, {
                        autoplay: wasPlaying,
                        startTime: targetTime,
                        preserveProgress: true,
                    }, state, dom, getAudioCallbacks(), debugLog);
                    if (!wasPlaying) {
                        dom.audioPlayer.pause();
                        updatePlayPauseButton(dom);
                    }
                    return true;
                } catch (err) {
                    console.error("切换音质失败:", err);
                    return false;
                }
            }
        }));
    }

    // 关闭搜索结果交互（收起面板，保留输入框关键词与搜索结果缓存）
    const handleCloseSearch = () => {
        hideSearchResults(state, dom);
        if (isMobileView && window.SolaraMobileBridge?.handlers?.closeSearch) {
            window.SolaraMobileBridge.handlers.closeSearch();
        }
    };

    if (dom.closeSearchBtn) {
        dom.closeSearchBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleCloseSearch();
        });
    }
    // mobileSearchClose 由 mobile.js 统一绑定 closeMobileSearch，此处不重复绑定
    // 避免双重绑定 + stopPropagation 导致移动端搜索面板关不掉

    // 点击空白处收起搜索结果（仅在桌面端生效；移动端搜索面板由右上角 X 按钮专门关闭）
    document.addEventListener("click", (e) => {
        if (!state.isSearchMode) return;

        const isMobile = isMobileView || document.body?.classList.contains("mobile-view") || document.documentElement?.classList.contains("mobile-view");
        if (isMobile) {
            return;
        }

        // 若点击发生在搜索核心控件内部，不关闭
        if (e.target.closest(".search-controls-wrapper") ||
            e.target.closest(".source-menu") ||
            e.target.closest(".import-dropdown-menu") ||
            e.target.closest(".quality-menu")) {
            return;
        }

        // 若点击发生在具体的搜索结果条目自身，不关闭（交给条目点击事件处理）
        if (e.target.closest(".search-result-item") || e.target.closest(".load-more-btn")) {
            return;
        }

        // 点击搜索区域外部（如顶栏 Header、底栏 Controls、背景舞台）或搜索结果列表空白处，立即收起搜索
        debugLog("点击空白处，收起搜索结果");
        handleCloseSearch();
    });

    // 监听移动端抽屉 Tab 切换，联动刷新收藏列表
    window.addEventListener("solara:mobile-tab-changed", (e) => {
        if (e.detail && e.detail.tab === "favorites") {
            renderFavorites(state, dom);
        }
    });

    // 按 Escape 键退出搜索
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && state.isSearchMode) {
            handleCloseSearch();
        }
    });
}

// 暴露兼容性接口至 window
window.toggleSearchMode = (enable) => toggleSearchMode(enable, state, dom);
window.hideSearchResults = () => hideSearchResults(state, dom);
window.playNext = () => playNext(state, dom, getAudioCallbacks());
window.playPrevious = () => playPrevious(state, dom, getAudioCallbacks());
window.autoPlayNext = () => autoPlayNext(state, dom, getAudioCallbacks());
window.restoreLastSearchResults = (options = { showView: true }) => restoreLastSearchResults(state, dom, getSearchCallbacks(), options);

// 从云端 D1 数据库应用快照至本地应用状态与 UI
export async function applyPersistentSnapshotFromRemote(data) {
    if (!data || typeof data !== "object") {
        return false;
    }

    let playlistUpdated = false;
    let favoritesUpdated = false;

    if (typeof data.playlistSongs === "string") {
        const playlist = parseJSON(data.playlistSongs, null);
        if (Array.isArray(playlist)) {
            // 如果云端是空的，但本地已有歌曲，保留本地已有歌曲并向云端备份，防止误清空本地
            if (playlist.length === 0 && Array.isArray(state.playlistSongs) && state.playlistSongs.length > 0) {
                safeSetLocalStorage("playlistSongs", JSON.stringify(state.playlistSongs));
            } else {
                state.playlistSongs = playlist;
                safeSetLocalStorage("playlistSongs", data.playlistSongs, { skipRemote: true });
                playlistUpdated = true;
            }
        }
    }

    if (typeof data.favoriteSongs === "string") {
        const favorites = parseJSON(data.favoriteSongs, null);
        if (Array.isArray(favorites)) {
            // 如果云端是空的，但本地已有收藏，保留本地已有收藏并向云端备份
            if (favorites.length === 0 && Array.isArray(state.favoriteSongs) && state.favoriteSongs.length > 0) {
                safeSetLocalStorage("favoriteSongs", JSON.stringify(state.favoriteSongs));
            } else {
                state.favoriteSongs = favorites;
                safeSetLocalStorage("favoriteSongs", data.favoriteSongs, { skipRemote: true });
                favoritesUpdated = true;
            }
        }
    }

    if (typeof data.currentTrackIndex === "string") {
        const index = Number.parseInt(data.currentTrackIndex, 10);
        if (Number.isInteger(index)) {
            state.currentTrackIndex = index;
            safeSetLocalStorage("currentTrackIndex", data.currentTrackIndex, { skipRemote: true });
        }
    }

    if (typeof data.currentFavoriteIndex === "string") {
        const favoriteIndex = Number.parseInt(data.currentFavoriteIndex, 10);
        if (Number.isInteger(favoriteIndex)) {
            state.currentFavoriteIndex = favoriteIndex;
            safeSetLocalStorage("currentFavoriteIndex", data.currentFavoriteIndex, { skipRemote: true });
        }
    }

    if (typeof data.playMode === "string" && ["list", "single", "random"].includes(data.playMode)) {
        state.playMode = data.playMode;
        safeSetLocalStorage("playMode", state.playMode, { skipRemote: true });
    }

    if (typeof data.playbackQuality === "string") {
        state.playbackQuality = normalizeQuality(data.playbackQuality);
        safeSetLocalStorage("playbackQuality", state.playbackQuality, { skipRemote: true });
    }

    if (typeof data.playerVolume === "string") {
        const volume = Number.parseFloat(data.playerVolume);
        if (Number.isFinite(volume)) {
            const clamped = Math.min(Math.max(volume, 0), 1);
            state.volume = clamped;
            safeSetLocalStorage("playerVolume", String(clamped), { skipRemote: true });
            try {
                if (dom.audioPlayer) dom.audioPlayer.volume = clamped;
                if (dom.volumeSlider) dom.volumeSlider.value = String(clamped);
                updateVolumeSliderBackground(dom, clamped);
                updateVolumeIcon(dom, clamped);
            } catch (err) {
                console.warn("更新音量设置失败:", err);
            }
        }
    }

    if (typeof data.currentPlaylist === "string") {
        state.currentPlaylist = data.currentPlaylist;
        safeSetLocalStorage("currentPlaylist", data.currentPlaylist, { skipRemote: true });
    }

    if (typeof data.currentList === "string") {
        state.currentList = data.currentList === "favorite" ? "favorite" : "playlist";
        safeSetLocalStorage("currentList", state.currentList, { skipRemote: true });
    }

    if (typeof data.currentSong === "string" && data.currentSong) {
        const currentSong = parseJSON(data.currentSong, null);
        if (currentSong && typeof currentSong === "object") {
            state.currentSong = currentSong;
            safeSetLocalStorage("currentSong", data.currentSong, { skipRemote: true });
        }
    }

    if (typeof data.currentPlaybackTime === "string") {
        const playbackTime = Number.parseFloat(data.currentPlaybackTime);
        if (Number.isFinite(playbackTime) && playbackTime >= 0) {
            state.currentPlaybackTime = playbackTime;
            safeSetLocalStorage("currentPlaybackTime", data.currentPlaybackTime, { skipRemote: true });
        }
    }

    if (typeof data.favoritePlayMode === "string" && ["list", "single", "random"].includes(data.favoritePlayMode)) {
        state.favoritePlayMode = data.favoritePlayMode;
        safeSetLocalStorage("favoritePlayMode", state.favoritePlayMode, { skipRemote: true });
    }

    if (typeof data.favoritePlaybackTime === "string") {
        const favTime = Number.parseFloat(data.favoritePlaybackTime);
        if (Number.isFinite(favTime) && favTime >= 0) {
            state.favoritePlaybackTime = favTime;
            safeSetLocalStorage("favoritePlaybackTime", data.favoritePlaybackTime, { skipRemote: true });
        }
    }

    if (typeof data.searchSource === "string") {
        state.searchSource = normalizeSource(data.searchSource);
        safeSetLocalStorage("searchSource", state.searchSource, { skipRemote: true });
        updateSourceLabel(state, dom);
        buildSourceMenu(state, dom);
    }

    if (typeof data[LAST_SEARCH_STATE_STORAGE_KEY] === "string" && data[LAST_SEARCH_STATE_STORAGE_KEY]) {
        safeSetLocalStorage(LAST_SEARCH_STATE_STORAGE_KEY, data[LAST_SEARCH_STATE_STORAGE_KEY], { skipRemote: true });
    }

    if (typeof data.radarSettings === "string") {
        const radarSettings = parseJSON(data.radarSettings, null);
        if (radarSettings) {
            state.radarSettings = radarSettings;
            safeSetLocalStorage("radarSettings", data.radarSettings, { skipRemote: true });
            applySettingsToUI(dom, state);
        }
    }

    // 重新校准状态自洽
    validateStateConsistency(dom, {
        debugLog,
        showAlbumCoverPlaceholder: () => showAlbumCoverPlaceholder(dom, state),
        updatePlayPauseButton: () => updatePlayPauseButton(dom)
    });

    // 刷新 UI 渲染
    if (playlistUpdated) {
        renderPlaylist(state, dom, getPlaylistCallbacks());
    }
    if (favoritesUpdated) {
        renderFavorites(state, dom);
    }
    updateFavoriteIcons(state, dom);
    updatePlayModeUI(state, dom);
    updateQualityLabel(state, dom);
    updatePlayPauseButton(dom);

    // 恢复当前歌曲与封面
    if (state.currentSong) {
        const savedTime = state.currentList === "favorite"
            ? (state.favoritePlaybackTime || 0)
            : (state.currentPlaybackTime || 0);

        if (dom.progressBar) {
            dom.progressBar.value = savedTime;
        }
        if (dom.currentTimeDisplay) {
            dom.currentTimeDisplay.textContent = formatTime(savedTime);
        }
        updateProgressBarBackground(dom, savedTime, Number(dom.progressBar?.max || 1));

        try {
            await playSong(state.currentSong, {
                autoplay: false,
                startTime: savedTime,
                preserveProgress: true
            }, state, dom, getAudioCallbacks(), debugLog);
        } catch (err) {
            console.warn("云端同步后恢复歌曲待播失败，降级展示封面:", err);
            updateCurrentSongInfo(state.currentSong, { loadArtwork: true });
            loadLyrics(state.currentSong, state, dom, debugLog);
        }
    } else {
        showAlbumCoverPlaceholder(dom, state);
    }

    return true;
}

// 手动全量同步触发器
export async function handleManualCloudSync() {
    const remoteKeys = Array.from(STORAGE_KEYS_TO_SYNC);
    const snapshot = await persistentStorage.getItems(remoteKeys);
    if (!snapshot || !snapshot.d1Available) {
        throw new Error("云端 D1 数据库不可用");
    }
    setRemoteSyncEnabled(true);
    const cloudData = snapshot.data;
    const hasCloudData = cloudData && typeof cloudData === "object" && Boolean(
        cloudData.playlistSongs || cloudData.currentSong || cloudData.favoriteSongs
    );

    if (hasCloudData) {
        await applyPersistentSnapshotFromRemote(cloudData);
        debugLog("手动同步：成功从 D1 恢复云端漫游数据");
    } else {
        syncLocalDataToCloud();
        debugLog("手动同步：云端为空，已将本地数据同步推送至云端");
    }
}

window.syncFromCloud = handleManualCloudSync;

// 应用启动引导
export async function bootstrap() {
    validateStateConsistency(dom, { debugLog, showAlbumCoverPlaceholder: () => showAlbumCoverPlaceholder(dom, state), updatePlayPauseButton: () => updatePlayPauseButton(dom) });

    setupEventHandlers();
    initTheme(dom, state);
    initSettings(dom, state, { debugLog, manualSync: handleManualCloudSync });
    initSpotlightEffect();
    initMediaSession(state, dom, {
        playNext: () => playNext(state, dom, getAudioCallbacks()),
        playPrevious: () => playPrevious(state, dom, getAudioCallbacks()),
        autoPlayNext: () => autoPlayNext(state, dom, getAudioCallbacks()),
        updatePlayPauseButton: () => updatePlayPauseButton(dom)
    });

    // 渲染初始界面
    renderPlaylist(state, dom, getPlaylistCallbacks());
    renderFavorites(state, dom);
    updateFavoriteIcons(state, dom);
    updatePlayModeUI(state, dom);
    updateQualityLabel(state, dom);
    updateSourceLabel(state, dom);
    buildSourceMenu(state, dom);
    buildQualityMenu(state, dom);
    applyDynamicGradient(state, dom, { immediate: true });
    initDesktopLyricsInteractions(state, dom);
    updateAllTabsIndicators();
    window.addEventListener("resize", () => updateAllTabsIndicators(), { passive: true });

    // 初始化音量条状态与填充进度，防止初次加载时滑轨高亮溢出
    try {
        if (dom.volumeSlider) {
            const vol = Number.isFinite(state.volume) ? state.volume : 0.8;
            dom.volumeSlider.value = String(vol);
            if (dom.audioPlayer) {
                dom.audioPlayer.volume = vol;
            }
            updateVolumeSliderBackground(dom, vol);
            updateVolumeIcon(dom, vol);
        }
    } catch (err) {
        console.warn("初始化音量条组件失败:", err);
    }

    if (state.currentSong) {
        const savedTime = state.currentList === "favorite"
            ? (state.favoritePlaybackTime || 0)
            : (state.currentPlaybackTime || 0);

        dom.progressBar.value = savedTime;
        dom.currentTimeDisplay.textContent = formatTime(savedTime);
        updateProgressBarBackground(dom, savedTime, Number(dom.progressBar.max || 1));

        // 纯本地待播就绪（0 网络请求）：仅恢复曲目展示与封面，不提前请求音频直链与歌词
        updateCurrentSongInfo(state.currentSong, { loadArtwork: true });
        updatePlayPauseButton(dom);
        if (state.currentList === "favorite") {
            updateFavoriteHighlight(state, dom);
        } else {
            updatePlaylistHighlight(state, dom);
        }
        debugLog(`[冷启动] 已恢复【${state.currentSong.name}】就绪待播（0 网络请求，点击播放才拉取）`);
    } else {
        showAlbumCoverPlaceholder(dom, state);
    }

    // 恢复上次搜索记录与关键词（静默恢复，不强制切到 search-mode 隐藏封面主舞台）
    try {
        restoreLastSearchResults(state, dom, getSearchCallbacks(), { showView: false });
    } catch (e) {
        console.warn("恢复上次搜索结果失败:", e);
    }

    // 核心：异步加载云端 D1 数据漫游快照
    try {
        const remoteKeys = Array.from(STORAGE_KEYS_TO_SYNC);
        const snapshot = await persistentStorage.getItems(remoteKeys);
        if (snapshot && snapshot.d1Available) {
            setRemoteSyncEnabled(true);
            const cloudData = snapshot.data;
            const hasCloudData = cloudData && typeof cloudData === "object" && Boolean(
                cloudData.playlistSongs || cloudData.currentSong || cloudData.favoriteSongs
            );

            if (hasCloudData) {
                debugLog("检测到 D1 云端数据库快照，正在漫游恢复播放状态与歌曲列表...");
                await applyPersistentSnapshotFromRemote(cloudData);
                debugLog("D1 云端数据漫游恢复完成");
            } else if (state.playlistSongs.length > 0 || state.currentSong || state.favoriteSongs.length > 0) {
                debugLog("D1 云端为空，正在将当前设备数据同步备份至云端...");
                syncLocalDataToCloud();
            }
        }
    } catch (e) {
        console.warn("远程数据漫游检测失败:", e);
    } finally {
        if (!isRemoteSyncEnabled()) {
            persistentStorage.checkAvailability().then((avail) => {
                if (avail) setRemoteSyncEnabled(true);
            });
        }
    }
}

// 当 DOM 就绪时启动应用
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
} else {
    bootstrap();
}
