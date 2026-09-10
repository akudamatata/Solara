/**
 * Solara 播放列表核心数据与交互逻辑 (Playlist CRUD, JSON 导入导出, 标签切换)
 */

import { PLAYLIST_EXPORT_VERSION } from "../constants.js";
import { safeSetLocalStorage, preferHttpsUrl } from "../core/storage.js";
import { resetPlayerToIdle } from "../core/audio.js";
import { showNotification } from "./settings.js";

export function resolveSongId(rawSong) {
    if (!rawSong || typeof rawSong !== "object") {
        return undefined;
    }
    const candidateKeys = [
        "id",
        "songId",
        "song_id",
        "url_id",
        "mid",
        "musicId",
        "music_id",
        "trackId",
        "track_id",
        "copyrightId",
        "copyright_id",
        "rid",
        "bvid"
    ];
    for (const key of candidateKeys) {
        const val = rawSong[key];
        if (typeof val === "string" && val.trim() !== "") {
            return val.trim();
        }
        if (typeof val === "number" && Number.isFinite(val)) {
            return String(val);
        }
    }
    return undefined;
}

export function normalizeArtistValue(value) {
    if (Array.isArray(value)) {
        const names = value.map((item) => {
            if (typeof item === "string") {
                return item.trim();
            }
            if (item && typeof item === "object" && typeof item.name === "string") {
                return item.name.trim();
            }
            return "";
        }).filter(Boolean);
        return names.length > 0 ? names.join(", ") : undefined;
    }
    if (value && typeof value === "object" && typeof value.name === "string") {
        const name = value.name.trim();
        return name || undefined;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || undefined;
    }
    return undefined;
}

export function getSongKey(song) {
    if (!song || typeof song !== "object") {
        return null;
    }
    const source = typeof song.source === "string" && song.source.trim() !== ""
        ? song.source.trim().toLowerCase()
        : (typeof song.platform === "string" && song.platform.trim() !== ""
            ? song.platform.trim().toLowerCase()
            : "netease");
    const id = resolveSongId(song);
    if (id) {
        return `${source}:${id}`;
    }
    const name = typeof song.name === "string" ? song.name.trim().toLowerCase() : "";
    if (!name) {
        return null;
    }
    const artistValue = song.artist ?? song.artists ?? song.singers ?? song.singer;
    let artistText = "";
    if (Array.isArray(artistValue)) {
        artistText = artistValue.map((item) => {
            if (typeof item === "string") {
                return item.trim().toLowerCase();
            }
            if (item && typeof item === "object" && typeof item.name === "string") {
                return item.name.trim().toLowerCase();
            }
            return "";
        }).filter(Boolean).join(",");
    } else if (artistValue && typeof artistValue === "object" && typeof artistValue.name === "string") {
        artistText = artistValue.name.trim().toLowerCase();
    } else if (typeof artistValue === "string") {
        artistText = artistValue.trim().toLowerCase();
    }
    return `${source}:${name}::${artistText}`;
}

export function sanitizeImportedSong(rawSong) {
    if (!rawSong || typeof rawSong !== "object") {
        return null;
    }
    const name = typeof rawSong.name === "string" ? rawSong.name.trim() : "";
    if (!name) {
        return null;
    }

    const normalized = { ...rawSong, name };
    const sourceCandidate = rawSong.source || rawSong.platform || rawSong.provider || rawSong.vendor;
    normalized.source = typeof sourceCandidate === "string" && sourceCandidate.trim() !== ""
        ? sourceCandidate.trim()
        : "netease";

    const resolvedId = resolveSongId(rawSong);
    if (resolvedId) {
        normalized.id = resolvedId;
    }

    const artistValue = rawSong.artist ?? rawSong.artists ?? rawSong.singers ?? rawSong.singer;
    const normalizedArtist = normalizeArtistValue(artistValue);
    if (normalizedArtist !== undefined) {
        normalized.artist = normalizedArtist;
    }

    if (normalized.album && typeof normalized.album === "object" && typeof normalized.album.name === "string") {
        normalized.album = normalized.album.name.trim();
    }

    return normalized;
}

export function extractPlaylistItems(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }
    if (payload && typeof payload === "object") {
        const possibleKeys = ["items", "songs", "playlist", "tracks", "data"];
        for (const key of possibleKeys) {
            if (Array.isArray(payload[key])) {
                return payload[key];
            }
        }
    }
    return [];
}

export function updatePlaylistActionStates(state, dom) {
    const hasSongs = Array.isArray(state.playlistSongs) && state.playlistSongs.length > 0;
    if (dom.exportPlaylistBtn) {
        dom.exportPlaylistBtn.disabled = !hasSongs;
        dom.exportPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
    }
    if (dom.mobileExportPlaylistBtn) {
        dom.mobileExportPlaylistBtn.disabled = !hasSongs;
        dom.mobileExportPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
    }
    if (dom.clearPlaylistBtn) {
        dom.clearPlaylistBtn.disabled = !hasSongs;
        dom.clearPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
    }
    if (dom.mobileClearPlaylistBtn) {
        dom.mobileClearPlaylistBtn.disabled = !hasSongs;
        dom.mobileClearPlaylistBtn.setAttribute("aria-disabled", hasSongs ? "false" : "true");
    }
}

export function updatePlaylistHighlight(state, dom) {
    if (!dom.playlistItems) return;
    const items = dom.playlistItems.querySelectorAll(".playlist-item");
    const currentSongKey = state.currentSong ? getSongKey(state.currentSong) : null;
    const isPlayingPlaylist = state.currentPlaylist === "playlist" && state.currentSong != null && state.currentTrackIndex >= 0;

    items.forEach((item, index) => {
        let isCurrent = false;
        if (isPlayingPlaylist) {
            const itemKey = item.dataset.favoriteKey;
            if (currentSongKey && itemKey) {
                isCurrent = (itemKey === currentSongKey) || (index === state.currentTrackIndex);
            } else {
                isCurrent = (index === state.currentTrackIndex);
            }
        }
        item.classList.toggle("current", isCurrent);
        item.setAttribute("aria-current", isCurrent ? "true" : "false");
        item.setAttribute("aria-pressed", isCurrent ? "true" : "false");
    });
}

export function renderPlaylist(state, dom, callbacks = {}) {
    if (!dom.playlistItems) return;

    if (!Array.isArray(state.playlistSongs) || state.playlistSongs.length === 0) {
        if (dom.playlist) dom.playlist.classList.add("empty");
        dom.playlistItems.innerHTML = "";
        if (typeof callbacks.savePlayerState === "function") callbacks.savePlayerState();
        if (typeof callbacks.updateFavoriteIcons === "function") callbacks.updateFavoriteIcons();
        updatePlaylistHighlight(state, dom);
        if (typeof callbacks.updateMobileClearPlaylistVisibility === "function") callbacks.updateMobileClearPlaylistVisibility();
        updatePlaylistActionStates(state, dom);
        return;
    }

    if (dom.playlist) dom.playlist.classList.remove("empty");
    const playlistHtml = state.playlistSongs.map((song, index) => {
        const artistValue = Array.isArray(song.artist)
            ? song.artist.join(", ")
            : (song.artist || "未知艺术家");
        const songKey = getSongKey(song) || `playlist-${index}`;
        return `
        <div class="playlist-item" data-index="${index}" role="button" tabindex="0" aria-label="播放 ${song.name}" data-favorite-key="${songKey}">
            <div class="playlist-item-info">
                <span class="playlist-item-title">${song.name}</span>
                <span class="playlist-item-artist"> - ${artistValue}</span>
            </div>
            <div class="playlist-item-actions" role="toolbar" aria-label="歌曲操作">
                <button class="playlist-item-favorite favorite-toggle" type="button" data-playlist-action="favorite" data-index="${index}" data-favorite-key="${songKey}" title="收藏" aria-label="收藏">
                    <i class="fa-regular fa-heart"></i>
                </button>
                <button class="playlist-item-download" type="button" data-playlist-action="download" data-index="${index}" title="下载" aria-label="下载">
                    <i class="fas fa-download"></i>
                </button>
                <button class="playlist-item-remove" type="button" data-playlist-action="remove" data-index="${index}" title="从播放列表移除" aria-label="从播放列表移除">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>`;
    }).join("");

    dom.playlistItems.innerHTML = playlistHtml;
    if (typeof callbacks.savePlayerState === "function") callbacks.savePlayerState();
    if (typeof callbacks.updateFavoriteIcons === "function") callbacks.updateFavoriteIcons();
    updatePlaylistHighlight(state, dom);
    if (typeof callbacks.updateMobileClearPlaylistVisibility === "function") callbacks.updateMobileClearPlaylistVisibility();
    updatePlaylistActionStates(state, dom);
}

export function updateTabsIndicator(tabsContainer) {
    if (!tabsContainer || !(tabsContainer instanceof HTMLElement)) return;
    let indicator = tabsContainer.querySelector(".playlist-tabs-indicator");
    if (!indicator) {
        indicator = document.createElement("div");
        indicator.className = "playlist-tabs-indicator";
        indicator.setAttribute("aria-hidden", "true");
        tabsContainer.prepend(indicator);
    }
    const activeTab = tabsContainer.querySelector(".playlist-tab.active");
    if (activeTab && activeTab.offsetWidth > 0) {
        const left = activeTab.offsetLeft;
        const width = activeTab.offsetWidth;
        indicator.style.transform = `translateX(${left}px)`;
        indicator.style.width = `${width}px`;
        indicator.style.opacity = "1";
    }
}

export function updateAllTabsIndicators() {
    requestAnimationFrame(() => {
        document.querySelectorAll(".playlist-tabs").forEach(tabs => {
            updateTabsIndicator(tabs);
        });
    });
}

export function switchLibraryTab(target, dom, callbacks = {}) {
    const showFavorites = target === "favorites";

    if (Array.isArray(dom.libraryTabs) && dom.libraryTabs.length > 0) {
        dom.libraryTabs.forEach((tab) => {
            if (!(tab instanceof HTMLElement)) {
                return;
            }
            const tabTarget = tab.dataset.target === "favorites" ? "favorites" : "playlist";
            const isActive = showFavorites ? tabTarget === "favorites" : tabTarget === "playlist";
            tab.classList.toggle("active", isActive);
            tab.setAttribute("aria-selected", isActive ? "true" : "false");
        });
    }

    // 物理平滑滑动指示器
    updateAllTabsIndicators();

    if (dom.playlist) {
        if (showFavorites) {
            dom.playlist.classList.remove("active");
            dom.playlist.setAttribute("hidden", "");
        } else {
            dom.playlist.classList.add("active");
            dom.playlist.removeAttribute("hidden");
        }
    }

    if (dom.favorites) {
        if (showFavorites) {
            dom.favorites.classList.add("active");
            dom.favorites.removeAttribute("hidden");
        } else {
            dom.favorites.classList.remove("active");
            dom.favorites.setAttribute("hidden", "");
        }
    }

    // 切换后再次在微帧内矫正指示器位置（防止容器动画引起的轻微位移差）
    updateAllTabsIndicators();

    if (typeof callbacks.updateMobileLibraryActionVisibility === "function") {
        callbacks.updateMobileLibraryActionVisibility(showFavorites);
    }
    if (typeof callbacks.updateMobileClearPlaylistVisibility === "function") {
        callbacks.updateMobileClearPlaylistVisibility();
    }
    if (typeof callbacks.closeImportSelectedMenu === "function") {
        callbacks.closeImportSelectedMenu();
    }
}

export function removeFromPlaylist(index, state, dom, callbacks = {}) {
    if (!Array.isArray(state.playlistSongs) || index < 0 || index >= state.playlistSongs.length) {
        return;
    }

    const removingSong = state.playlistSongs[index];
    const removingKey = getSongKey(removingSong);
    const currentKey = state.currentSong ? getSongKey(state.currentSong) : null;
    const removingCurrent = (state.currentPlaylist === "playlist" && state.currentTrackIndex === index) ||
        Boolean(state.currentSong && removingKey && removingKey === currentKey);

    if (removingCurrent) {
        // 第一时间停止当前正在播放的声音，防止异步加载待播歌曲时旧歌仍出声
        if (dom && dom.audioPlayer) {
            dom.audioPlayer.pause();
        }

        // 如果列表中只有这一首歌，删除后整个列表为空，彻底停播并重置为空态
        if (state.playlistSongs.length === 1) {
            state.playlistSongs = [];
            state.currentTrackIndex = -1;
            if (typeof callbacks.resetPlayerToIdle === "function") {
                callbacks.resetPlayerToIdle();
            } else {
                resetPlayerToIdle(state, dom, callbacks);
            }
            renderPlaylist(state, dom, callbacks);
            if (typeof callbacks.clearLyricsIfLibraryEmpty === "function") {
                callbacks.clearLyricsIfLibraryEmpty();
            }
            showNotification("已从播放列表移除", "success", dom);
            return;
        }

        // 列表中有多首歌，计算接下来顶上来的索引
        let targetIndex = index;
        if (index === state.playlistSongs.length - 1) {
            targetIndex = index - 1;
        }

        state.playlistSongs.splice(index, 1);
        state.currentTrackIndex = targetIndex;
        renderPlaylist(state, dom, callbacks);

        // 方案2：停止当前播放，将顶上来的歌曲载入为就绪待播状态，不自动出声（autoplay: false）
        if (typeof callbacks.playPlaylistSong === "function") {
            callbacks.playPlaylistSong(targetIndex, { autoplay: false });
        }
        showNotification("已从播放列表移除", "success", dom);
        return;
    }

    // 删除的不是当前正在播放的歌曲
    if (state.currentPlaylist === "playlist" && state.currentTrackIndex > index) {
        state.currentTrackIndex--;
    }

    state.playlistSongs.splice(index, 1);

    if (state.playlistSongs.length === 0) {
        state.currentTrackIndex = -1;
        if (state.currentPlaylist === "playlist") {
            if (typeof callbacks.resetPlayerToIdle === "function") {
                callbacks.resetPlayerToIdle();
            } else {
                resetPlayerToIdle(state, dom, callbacks);
            }
        }
    }

    renderPlaylist(state, dom, callbacks);
    if (typeof callbacks.clearLyricsIfLibraryEmpty === "function") {
        callbacks.clearLyricsIfLibraryEmpty();
    }
    showNotification("已从播放列表移除", "success", dom);
}

export function clearPlaylist(state, dom, callbacks = {}) {
    if (!Array.isArray(state.playlistSongs) || state.playlistSongs.length === 0) {
        return;
    }

    // 检查当前是否正在播放属于播放列表的歌曲
    const currentKey = state.currentSong ? getSongKey(state.currentSong) : null;
    const isPlayingFromPlaylist = state.currentPlaylist === "playlist" ||
        (currentKey && state.playlistSongs.some((song) => getSongKey(song) === currentKey));

    state.playlistSongs = [];
    state.currentTrackIndex = -1;

    if (isPlayingFromPlaylist) {
        if (typeof callbacks.resetPlayerToIdle === "function") {
            callbacks.resetPlayerToIdle();
        } else {
            resetPlayerToIdle(state, dom, callbacks);
        }
    }

    renderPlaylist(state, dom, callbacks);
    if (typeof callbacks.clearLyricsIfLibraryEmpty === "function") {
        callbacks.clearLyricsIfLibraryEmpty();
    }
    showNotification("已清空播放列表", "success", dom);
}

export function exportPlaylist(state, dom) {
    if (!Array.isArray(state.playlistSongs) || state.playlistSongs.length === 0) {
        showNotification("播放列表为空，无法导出", "warning", dom);
        return;
    }

    try {
        const payload = {
            version: PLAYLIST_EXPORT_VERSION,
            type: "solara_playlist",
            timestamp: new Date().toISOString(),
            songs: state.playlistSongs,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Solara_Playlist_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showNotification("播放列表已成功导出", "success", dom);
    } catch (e) {
        console.error("导出播放列表失败:", e);
        showNotification("导出失败，请稍后重试", "error", dom);
    }
}

export function handleImportPlaylistChange(event, state, dom, callbacks = {}) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const text = typeof reader.result === "string" ? reader.result : "";
            if (!text) {
                throw new Error("EMPTY_FILE");
            }

            const payload = JSON.parse(text);
            if (!payload) {
                throw new Error("INVALID_JSON");
            }

            const items = extractPlaylistItems(payload);
            if (!Array.isArray(items) || items.length === 0) {
                throw new Error("NO_SONGS");
            }

            if (!Array.isArray(state.playlistSongs)) {
                state.playlistSongs = [];
            }

            const existingKeys = new Set(
                state.playlistSongs
                    .map(getSongKey)
                    .filter((key) => typeof key === "string" && key !== "")
            );

            let added = 0;
            let duplicates = 0;

            items.forEach((raw) => {
                const song = sanitizeImportedSong(raw);
                if (!song) return;
                const key = getSongKey(song);
                if (key && existingKeys.has(key)) {
                    duplicates++;
                    return;
                }
                state.playlistSongs.push(song);
                if (key) existingKeys.add(key);
                added++;
            });

            if (added > 0) {
                if (typeof callbacks.savePlayerState === "function") callbacks.savePlayerState();
                if (typeof callbacks.renderPlaylist === "function") callbacks.renderPlaylist();
                const duplicateHint = duplicates > 0 ? `（${duplicates} 首已存在跳过）` : "";
                showNotification(`成功导入 ${added} 首歌曲${duplicateHint}`, "success", dom);
            } else {
                showNotification("文件中的歌曲已全部存在于播放列表", "warning", dom);
            }
        } catch (error) {
            console.error("导入播放列表失败:", error);
            showNotification("导入失败，请检查文件格式是否有效", "error", dom);
        } finally {
            if (input) {
                input.value = "";
            }
        }
    };

    reader.onerror = () => {
        console.error("读取播放列表文件失败:", reader.error);
        showNotification("无法读取所选文件", "error", dom);
        if (input) {
            input.value = "";
        }
    };

    reader.readAsText(file, "utf-8");
}
