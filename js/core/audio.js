/**
 * Solara 核心音频引擎与播放管线 (HTML5 Audio, 播放模式, 进度/音量同步, 自动切歌)
 */

import { API } from "../constants.js";
import { safeSetLocalStorage, preferHttpsUrl, buildAudioProxyUrl } from "./storage.js";
import { showNotification } from "../features/settings.js";
import { getSongKey } from "../features/playlist.js";
import { ensureFavoriteSongsArray } from "../features/favorites.js";

export const playModeTexts = {
    "list": "列表循环",
    "single": "单曲循环",
    "random": "随机播放"
};

export const APPLE_SVG_ICONS = {
    play: `<svg class="apple-svg-icon icon-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5.5v13a1.5 1.5 0 0 0 2.3 1.28l10.5-6.5a1.5 1.5 0 0 0 0-2.56L9.3 4.22A1.5 1.5 0 0 0 7 5.5z"/></svg>`,
    pause: `<svg class="apple-svg-icon icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1zm11 0a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1z"/></svg>`,
    repeatList: `<svg class="apple-svg-icon icon-repeat-list" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`,
    repeatSingle: `<svg class="apple-svg-icon icon-repeat-single" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><text x="12" y="15.5" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif" font-size="9.5" font-weight="900" text-anchor="middle" fill="currentColor" stroke="none">1</text></svg>`,
    shuffle: `<svg class="apple-svg-icon shuffle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.6-8.6c.8-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.4c1.3 0 2.5.6 3.3 1.7l1.8 2.3"/><path d="M14.9 14.7l1.8 2.3c.8 1.1 2 1.7 3.3 1.7H22"/><path d="m18 22 4-4-4-4"/></svg>`
};

export function getActivePlayMode(state) {
    return state.currentList === "favorite" ? state.favoritePlayMode : state.playMode;
}

export function getLastNonRandomMode(state) {
    if (state.currentList === "favorite") {
        return state.favoriteLastNonRandomMode || "list";
    }
    return state.playlistLastNonRandomMode || "list";
}

export function rememberLastNonRandomMode(state) {
    const currentMode = getActivePlayMode(state);
    if (currentMode === "random") {
        return;
    }
    const mode = currentMode || "list";
    if (state.currentList === "favorite") {
        state.favoriteLastNonRandomMode = mode;
    } else {
        state.playlistLastNonRandomMode = mode;
    }
}

export function updateShuffleButtonUI(state, dom) {
    const button = dom.shuffleToggleBtn;
    if (!button) {
        return;
    }
    const mode = getActivePlayMode(state);
    const isRandom = mode === "random";
    button.setAttribute("aria-pressed", isRandom ? "true" : "false");
    button.classList.toggle("active", isRandom);
    button.classList.toggle("is-random", isRandom);
    button.innerHTML = APPLE_SVG_ICONS.shuffle;
    const label = isRandom ? "随机播放：已开启 (点击关闭)" : "随机播放：已关闭 (点击开启)";
    button.title = label;
    button.setAttribute("aria-label", label);
}

export function updatePlayModeUI(state, dom) {
    const mode = getActivePlayMode(state);
    if (dom.playModeBtn) {
        const isSingle = mode === "single";
        const isRandom = mode === "random";
        if (isSingle) {
            dom.playModeBtn.innerHTML = APPLE_SVG_ICONS.repeatSingle;
        } else if (isRandom) {
            dom.playModeBtn.innerHTML = APPLE_SVG_ICONS.shuffle;
        } else {
            dom.playModeBtn.innerHTML = APPLE_SVG_ICONS.repeatList;
        }
        dom.playModeBtn.classList.toggle("is-single", isSingle);
        dom.playModeBtn.classList.toggle("is-random", isRandom);
        dom.playModeBtn.classList.toggle("active", isSingle || isRandom);
        dom.playModeBtn.setAttribute("aria-pressed", (isSingle || isRandom) ? "true" : "false");
        const label = isSingle ? "当前模式：单曲循环" : (isRandom ? "当前模式：随机播放" : "当前模式：列表循环");
        dom.playModeBtn.title = label;
        dom.playModeBtn.setAttribute("aria-label", label);
    }
    updateShuffleButtonUI(state, dom);
}

export function setPlayMode(mode, state, dom, callbacks = {}, { announce = true } = {}) {
    const validModes = ["list", "single", "random"];
    if (!validModes.includes(mode)) {
        return getActivePlayMode(state);
    }
    const isFavoriteList = state.currentList === "favorite";
    const key = isFavoriteList ? "favoritePlayMode" : "playMode";
    const previousMode = state[key];
    if (previousMode === mode) {
        updatePlayModeUI(state, dom);
        return mode;
    }

    state[key] = mode;
    if (mode !== "random") {
        if (isFavoriteList) {
            state.favoriteLastNonRandomMode = mode;
        } else {
            state.playlistLastNonRandomMode = mode;
        }
    }

    if (isFavoriteList) {
        if (typeof callbacks.saveFavoriteState === "function") callbacks.saveFavoriteState();
    } else {
        if (typeof callbacks.savePlayerState === "function") callbacks.savePlayerState();
    }

    updatePlayModeUI(state, dom);

    if (announce) {
        const modeText = playModeTexts[mode] || playModeTexts.list;
        showNotification(`播放模式: ${modeText}`, "info", dom);
    }

    return mode;
}

export function togglePlayMode(state, dom, callbacks = {}, isMobileView = false) {
    const modes = isMobileView ? ["list", "single", "random"] : ["list", "single"];
    const currentMode = getActivePlayMode(state);
    let currentIndex = modes.indexOf(currentMode);
    if (currentIndex === -1) {
        currentIndex = 0;
    }
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    if (nextMode === "random") {
        rememberLastNonRandomMode(state);
    }
    setPlayMode(nextMode, state, dom, callbacks);
}

export function toggleShuffleMode(state, dom, callbacks = {}) {
    const currentMode = getActivePlayMode(state);
    if (currentMode === "random") {
        const fallback = getLastNonRandomMode(state);
        setPlayMode(fallback, state, dom, callbacks);
        return;
    }
    rememberLastNonRandomMode(state);
    setPlayMode("random", state, dom, callbacks);
}

export function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "00:00";
    }
    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function updatePlayPauseButton(dom) {
    if (!dom.playPauseBtn || !dom.audioPlayer) return;
    const isPlaying = !dom.audioPlayer.paused && !dom.audioPlayer.ended;
    dom.playPauseBtn.innerHTML = isPlaying ? APPLE_SVG_ICONS.pause : APPLE_SVG_ICONS.play;
    dom.playPauseBtn.title = isPlaying ? "暂停" : "播放";
    if (typeof document !== "undefined" && document.body) {
        document.body.classList.toggle("is-playing", isPlaying);
    }
    const visualizer = typeof document !== "undefined" ? document.getElementById("audioVisualizer") : null;
    if (visualizer) {
        visualizer.classList.toggle("playing", isPlaying);
    }
}

export function updateProgressBarBackground(dom, value = Number(dom.progressBar?.value), max = Number(dom.progressBar?.max)) {
    if (!dom.progressBar) return;
    const duration = Number.isFinite(max) && max > 0 ? max : 0;
    const progressValue = Number.isFinite(value) ? Math.max(value, 0) : 0;
    const percent = duration > 0 ? Math.min(progressValue / duration, 1) * 100 : 0;
    dom.progressBar.style.setProperty("--progress", `${percent}%`);
}

export function updateVolumeSliderBackground(dom, volume = dom.audioPlayer?.volume) {
    if (!dom.volumeSlider) return;
    const clamped = Math.min(Math.max(Number.isFinite(volume) ? volume : 0, 0), 1);
    dom.volumeSlider.style.setProperty("--volume-progress", `${clamped * 100}%`);
}

export function updateVolumeIcon(dom, volume) {
    if (!dom.volumeIcon) return;
    const clamped = Math.min(Math.max(Number.isFinite(volume) ? volume : 0, 0), 1);
    
    // 如果是 SVG 图标（Apple 矢量图标），动态更新内部矢量路径
    if (dom.volumeIcon.tagName && dom.volumeIcon.tagName.toLowerCase() === "svg") {
        if (clamped === 0) {
            // 静音状态 (扬声器 + 叉号)
            dom.volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>';
        } else if (clamped < 0.4) {
            // 低音量状态 (扬声器 + 单波纹)
            dom.volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
        } else {
            // 高音量状态 (扬声器 + 双波纹)
            dom.volumeIcon.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
        }
        return;
    }

    // 兼容普通 <i> 标签（FontAwesome）
    let icon = "fa-volume-high";
    if (clamped === 0) {
        icon = "fa-volume-xmark";
    } else if (clamped < 0.4) {
        icon = "fa-volume-low";
    }
    dom.volumeIcon.setAttribute("class", `fas ${icon}`);
}

export function setAudioCurrentTime(time, state, dom) {
    if (!Number.isFinite(time) || !dom.audioPlayer) return;
    const duration = dom.audioPlayer.duration || Number(dom.progressBar?.max) || 0;
    const clamped = duration > 0 ? Math.min(Math.max(time, 0), duration) : Math.max(time, 0);
    try {
        dom.audioPlayer.currentTime = clamped;
    } catch (error) {
        console.warn("设置播放进度失败", error);
    }
    if (dom.progressBar) dom.progressBar.value = clamped;
    if (dom.currentTimeDisplay) dom.currentTimeDisplay.textContent = formatTime(clamped);
    updateProgressBarBackground(dom, clamped, duration);
    if (state.currentList === "favorite") {
        state.favoritePlaybackTime = clamped;
    } else {
        state.currentPlaybackTime = clamped;
    }
}

export function waitForAudioReady(player) {
    if (!player) return Promise.resolve();
    if (player.readyState >= 1) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            player.removeEventListener('loadedmetadata', onLoaded);
            player.removeEventListener('error', onError);
        };
        const onLoaded = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error('音频加载失败'));
        };
        player.addEventListener('loadedmetadata', onLoaded, { once: true });
        player.addEventListener('error', onError, { once: true });
    });
}

let currentPlaybackToken = 0;

export function cancelPendingPlayback() {
    currentPlaybackToken++;
}

export async function playSong(song, options = {}, state, dom, callbacks = {}, debugLogger = null) {
    const myToken = ++currentPlaybackToken;
    const { autoplay = true, startTime = 0, preserveProgress = false, isRetry = false } = options;

    state.audioReadyForPalette = false;

    try {
        if (typeof callbacks.updateCurrentSongInfo === "function") {
            callbacks.updateCurrentSongInfo(song, { loadArtwork: false });
        }

        const quality = state.playbackQuality || '320';
        let audioUrl = API.getSongUrl(song, quality);
        if (isRetry) {
            audioUrl += '&nocache=true';
        }
        if (typeof debugLogger === "function") debugLogger(`获取音频URL: ${audioUrl}`);

        const audioData = await API.fetchJson(audioUrl);
        if (myToken !== currentPlaybackToken) {
            return;
        }

        if (!audioData || !audioData.url) {
            throw new Error('无法获取音频播放地址');
        }

        const originalAudioUrl = audioData.url;
        const proxiedAudioUrl = buildAudioProxyUrl(originalAudioUrl);
        const preferredAudioUrl = preferHttpsUrl(originalAudioUrl);
        const candidateAudioUrls = Array.from(
            new Set([proxiedAudioUrl, preferredAudioUrl, originalAudioUrl].filter(Boolean))
        );

        state.currentSong = song;
        state.currentAudioUrl = null;
        dom.audioPlayer.pause();

        if (state.currentList === "favorite") {
            if (!preserveProgress) {
                state.favoritePlaybackTime = 0;
                state.favoriteLastSavedPlaybackTime = 0;
                safeSetLocalStorage('favoritePlaybackTime', '0');
            } else if (startTime > 0) {
                state.favoritePlaybackTime = startTime;
                state.favoriteLastSavedPlaybackTime = startTime;
            }
        } else {
            if (!preserveProgress) {
                state.currentPlaybackTime = 0;
                state.lastSavedPlaybackTime = 0;
                safeSetLocalStorage('currentPlaybackTime', '0');
            } else if (startTime > 0) {
                state.currentPlaybackTime = startTime;
                state.lastSavedPlaybackTime = startTime;
            }
        }

        state.pendingSeekTime = startTime > 0 ? startTime : null;

        let selectedAudioUrl = null;
        let lastAudioError = null;

        for (const candidateUrl of candidateAudioUrls) {
            dom.audioPlayer.src = candidateUrl;
            dom.audioPlayer.load();

            try {
                await waitForAudioReady(dom.audioPlayer);
                selectedAudioUrl = candidateUrl;
                break;
            } catch (error) {
                lastAudioError = error;
            }
        }

        if (myToken !== currentPlaybackToken) {
            return;
        }

        if (!selectedAudioUrl) {
            throw lastAudioError || new Error('音频加载失败');
        }

        if (myToken !== currentPlaybackToken) {
            return;
        }

        state.currentAudioUrl = selectedAudioUrl;

        if (state.pendingSeekTime != null) {
            setAudioCurrentTime(state.pendingSeekTime, state, dom);
            state.pendingSeekTime = null;
        } else {
            setAudioCurrentTime(dom.audioPlayer.currentTime || 0, state, dom);
        }

        state.lastSavedPlaybackTime = state.currentPlaybackTime;

        let playPromise = null;
        if (autoplay) {
            playPromise = dom.audioPlayer.play();
            if (playPromise !== undefined) {
                playPromise.catch(async error => {
                    console.error('播放失败:', error);
                    if (!isRetry) {
                        try {
                            await playSong(song, { ...options, isRetry: true }, state, dom, callbacks, debugLogger);
                        } catch (retryError) {
                            showNotification('播放失败，请检查网络连接', 'error', dom);
                        }
                    } else {
                        showNotification('播放失败，请检查网络连接', 'error', dom);
                    }
                });
            }
        } else {
            dom.audioPlayer.pause();
            updatePlayPauseButton(dom);
        }

        // 异步延迟调度封面、歌词与极光色彩应用
        if (typeof callbacks.scheduleDeferredSongAssets === "function") {
            callbacks.scheduleDeferredSongAssets(song, playPromise);
        }

        if (typeof window.__SOLARA_UPDATE_MEDIA_METADATA === 'function') {
            window.__SOLARA_UPDATE_MEDIA_METADATA();
        }
    } catch (error) {
        console.error('播放歌曲失败:', error);
        if (!isRetry) {
            return playSong(song, { ...options, isRetry: true }, state, dom, callbacks, debugLogger);
        }
        throw error;
    } finally {
        if (typeof callbacks.savePlayerState === "function") {
            callbacks.savePlayerState();
        }
    }
}

export function autoPlayNext(state, dom, callbacks = {}) {
    if (dom.audioPlayer && dom.audioPlayer.__solaraMediaSessionHandledEnded === 'skip') {
        dom.audioPlayer.__solaraMediaSessionHandledEnded = false;
        return;
    }
    const mode = getActivePlayMode(state);
    if (mode === "single") {
        dom.audioPlayer.currentTime = 0;
        dom.audioPlayer.play();
        return;
    }

    playNext(state, dom, callbacks);
    updatePlayPauseButton(dom);
}

export function playNext(state, dom, callbacks = {}) {
    if (state.currentList === "favorite") {
        const favorites = ensureFavoriteSongsArray(state);
        if (favorites.length === 0) {
            if (typeof callbacks.clearLyricsIfLibraryEmpty === "function") callbacks.clearLyricsIfLibraryEmpty();
            return;
        }
        const mode = state.favoritePlayMode || "list";
        let nextIndex = state.currentFavoriteIndex;
        if (mode === "random") {
            nextIndex = Math.floor(Math.random() * favorites.length);
        } else if (mode === "list") {
            nextIndex = (state.currentFavoriteIndex + 1) % favorites.length;
        }
        if (mode !== "single") {
            state.currentFavoriteIndex = nextIndex;
        }
        if (typeof callbacks.playFavoriteSong === "function") {
            callbacks.playFavoriteSong(state.currentFavoriteIndex);
        }
        return;
    }

    let nextIndex = -1;
    let playlist = [];

    if (state.currentPlaylist === "playlist") {
        playlist = state.playlistSongs;
    } else if (state.currentPlaylist === "online") {
        playlist = state.onlineSongs;
    } else if (state.currentPlaylist === "search") {
        playlist = state.searchResults;
    }

    if (playlist.length === 0) {
        if (typeof callbacks.clearLyricsIfLibraryEmpty === "function") callbacks.clearLyricsIfLibraryEmpty();
        return;
    }

    const mode = state.playMode || "list";
    if (mode === "random") {
        nextIndex = Math.floor(Math.random() * playlist.length);
    } else if (mode === "list") {
        nextIndex = (state.currentTrackIndex + 1) % playlist.length;
    } else if (mode === "single") {
        nextIndex = state.currentTrackIndex >= 0 ? state.currentTrackIndex : 0;
    }

    if (mode !== "single") {
        state.currentTrackIndex = nextIndex;
    }

    const targetIndex = mode === "single" ? state.currentTrackIndex : nextIndex;

    if (state.currentPlaylist === "playlist" && typeof callbacks.playPlaylistSong === "function") {
        callbacks.playPlaylistSong(targetIndex);
    } else if (state.currentPlaylist === "online" && typeof callbacks.playOnlineSong === "function") {
        callbacks.playOnlineSong(targetIndex);
    } else if (state.currentPlaylist === "search" && typeof callbacks.playSearchResult === "function") {
        callbacks.playSearchResult(targetIndex);
    }
}

export function playPrevious(state, dom, callbacks = {}) {
    if (state.currentList === "favorite") {
        const favorites = ensureFavoriteSongsArray(state);
        if (favorites.length === 0) {
            return;
        }
        const mode = state.favoritePlayMode || "list";
        let prevIndex = state.currentFavoriteIndex;
        if (mode === "random") {
            prevIndex = Math.floor(Math.random() * favorites.length);
        } else if (mode === "list") {
            prevIndex = state.currentFavoriteIndex - 1;
            if (prevIndex < 0) {
                prevIndex = favorites.length - 1;
            }
        }
        if (mode !== "single") {
            state.currentFavoriteIndex = prevIndex;
        }
        if (typeof callbacks.playFavoriteSong === "function") {
            callbacks.playFavoriteSong(state.currentFavoriteIndex);
        }
        return;
    }

    let prevIndex = -1;
    let playlist = [];

    if (state.currentPlaylist === "playlist") {
        playlist = state.playlistSongs;
    } else if (state.currentPlaylist === "online") {
        playlist = state.onlineSongs;
    } else if (state.currentPlaylist === "search") {
        playlist = state.searchResults;
    }

    if (playlist.length === 0) return;

    const mode = state.playMode || "list";
    if (mode === "random") {
        prevIndex = Math.floor(Math.random() * playlist.length);
    } else if (mode === "list") {
        prevIndex = state.currentTrackIndex - 1;
        if (prevIndex < 0) prevIndex = playlist.length - 1;
    } else if (mode === "single") {
        prevIndex = state.currentTrackIndex >= 0 ? state.currentTrackIndex : 0;
    }

    if (mode !== "single") {
        state.currentTrackIndex = prevIndex;
    }

    const targetIndex = mode === "single" ? state.currentTrackIndex : prevIndex;

    if (state.currentPlaylist === "playlist" && typeof callbacks.playPlaylistSong === "function") {
        callbacks.playPlaylistSong(targetIndex);
    } else if (state.currentPlaylist === "online" && typeof callbacks.playOnlineSong === "function") {
        callbacks.playOnlineSong(targetIndex);
    } else if (state.currentPlaylist === "search" && typeof callbacks.playSearchResult === "function") {
        callbacks.playSearchResult(targetIndex);
    }
}

export async function downloadSong(song, quality = "320", dom = null) {
    try {
        showNotification("正在准备下载...", "info", dom);

        const audioUrl = API.getSongUrl(song, quality);
        const audioData = await API.fetchJson(audioUrl);

        if (audioData && audioData.url) {
            const proxiedAudioUrl = buildAudioProxyUrl(audioData.url);
            const preferredAudioUrl = preferHttpsUrl(audioData.url);
            const downloadUrl = proxiedAudioUrl || preferredAudioUrl || audioData.url;

            const link = document.createElement("a");
            link.href = downloadUrl;
            const preferredExtension = quality === "999" ? "flac" : quality === "740" ? "ape" : "mp3";
            const fileExtension = (() => {
                try {
                    const url = new URL(audioData.url);
                    const pathname = url.pathname || "";
                    const match = pathname.match(/\.([a-z0-9]+)$/i);
                    if (match) return match[1];
                } catch (error) {
                    console.warn("无法从下载链接中解析扩展名:", error);
                }
                return preferredExtension;
            })();
            link.download = `${song.name} - ${Array.isArray(song.artist) ? song.artist.join(", ") : song.artist}.${fileExtension}`;
            link.target = "_blank";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showNotification("下载已开始", "success", dom);
        } else {
            throw new Error("无法获取下载地址");
        }
    } catch (error) {
        console.error("下载失败:", error);
        showNotification("下载失败，请稍后重试", "error", dom);
    }
}

/**
 * 彻底重置播放器为空闲/空态（停止播放、释放音频缓冲、重置界面与系统状态）
 */
export function resetPlayerToIdle(state, dom, callbacks = {}) {
    cancelPendingPlayback();

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
    state.currentTrackIndex = -1;
    state.currentSong = null;
    state.currentAudioUrl = null;
    state.currentArtworkUrl = null;
    state.currentPlaybackTime = 0;
    state.lastSavedPlaybackTime = 0;
    if (state.currentList === "favorite") {
        state.currentFavoriteIndex = -1;
        state.favoritePlaybackTime = 0;
        state.favoriteLastSavedPlaybackTime = 0;
    }

    // 重置进度条
    if (dom.progressBar) {
        dom.progressBar.value = 0;
        dom.progressBar.max = 0;
        updateProgressBarBackground(dom, 0, 1);
    }
    if (dom.currentTimeDisplay) dom.currentTimeDisplay.textContent = "00:00";
    if (dom.durationDisplay) dom.durationDisplay.textContent = "00:00";

    // 重置播放/暂停按钮
    updatePlayPauseButton(dom);

    // 重置歌曲信息与封面
    if (dom.currentSongTitle) dom.currentSongTitle.textContent = "选择一首歌曲开始播放";
    if (dom.currentSongArtist) dom.currentSongArtist.textContent = "未知艺术家";
    if (typeof callbacks.showAlbumCoverPlaceholder === "function") {
        callbacks.showAlbumCoverPlaceholder();
    }
    if (typeof callbacks.clearLyricsContent === "function") {
        callbacks.clearLyricsContent();
    }

    // 重置系统媒体会话
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        try {
            navigator.mediaSession.metadata = null;
            navigator.mediaSession.playbackState = "none";
        } catch (_) {}
    }

    // 更新收藏状态图标
    if (typeof callbacks.updateFavoriteIcons === "function") {
        callbacks.updateFavoriteIcons();
    }

    // 保存状态
    if (typeof callbacks.savePlayerState === "function") {
        callbacks.savePlayerState();
    }
}

