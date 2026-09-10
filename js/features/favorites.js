/**
 * Solara 收藏夹管理模块 (Favorites CRUD, 爱心状态高亮, 批量导入导出)
 */

import { FAVORITE_EXPORT_VERSION } from "../constants.js";
import { getSongKey, sanitizeImportedSong } from "./playlist.js";
import { resetPlayerToIdle } from "../core/audio.js";
import { showNotification } from "./settings.js";

export function ensureFavoriteSongsArray(state) {
    if (!Array.isArray(state.favoriteSongs)) {
        state.favoriteSongs = [];
    }
    return state.favoriteSongs;
}

export function isSongFavorited(song, state) {
    const key = getSongKey(song);
    if (!key) {
        return false;
    }
    return ensureFavoriteSongsArray(state).some((item) => getSongKey(item) === key);
}

export function updateFavoriteActionStates(state, dom) {
    const favorites = ensureFavoriteSongsArray(state);
    const hasFavorites = favorites.length > 0;

    if (dom.addAllFavoritesBtn) {
        dom.addAllFavoritesBtn.disabled = !hasFavorites;
        dom.addAllFavoritesBtn.setAttribute("aria-disabled", hasFavorites ? "false" : "true");
    }
    if (dom.exportFavoritesBtn) {
        dom.exportFavoritesBtn.disabled = !hasFavorites;
        dom.exportFavoritesBtn.setAttribute("aria-disabled", hasFavorites ? "false" : "true");
    }
    if (dom.clearFavoritesBtn) {
        dom.clearFavoritesBtn.disabled = !hasFavorites;
        dom.clearFavoritesBtn.setAttribute("aria-disabled", hasFavorites ? "false" : "true");
    }
    if (dom.mobileClearFavoritesBtn) {
        dom.mobileClearFavoritesBtn.disabled = !hasFavorites;
        dom.mobileClearFavoritesBtn.setAttribute("aria-disabled", hasFavorites ? "false" : "true");
    }
    if (dom.mobileExportFavoritesBtn) {
        dom.mobileExportFavoritesBtn.disabled = !hasFavorites;
        dom.mobileExportFavoritesBtn.setAttribute("aria-disabled", hasFavorites ? "false" : "true");
    }
    if (dom.mobileAddAllFavoritesBtn) {
        dom.mobileAddAllFavoritesBtn.disabled = !hasFavorites;
        dom.mobileAddAllFavoritesBtn.setAttribute("aria-disabled", hasFavorites ? "false" : "true");
    }
}

export function updateFavoriteHighlight(state, dom) {
    if (!dom.favoriteItems) {
        return;
    }
    const items = dom.favoriteItems.querySelectorAll(".playlist-item");
    const currentSongKey = state.currentSong ? getSongKey(state.currentSong) : null;
    const isPlayingFavorites = state.currentList === "favorite" && state.currentSong != null && state.currentFavoriteIndex >= 0;

    items.forEach((item, index) => {
        let isCurrent = false;
        if (isPlayingFavorites) {
            const itemKey = item.dataset.favoriteKey;
            if (currentSongKey && itemKey) {
                isCurrent = (itemKey === currentSongKey) || (index === state.currentFavoriteIndex);
            } else {
                isCurrent = (index === state.currentFavoriteIndex);
            }
        }
        item.classList.toggle("current", isCurrent);
        item.setAttribute("aria-current", isCurrent ? "true" : "false");
        item.setAttribute("aria-pressed", isCurrent ? "true" : "false");
    });
}

export function updateFavoriteIcons(state, dom) {
    const favorites = ensureFavoriteSongsArray(state);
    const favoriteKeys = new Set(
        favorites
            .map(getSongKey)
            .filter((key) => typeof key === "string" && key !== "")
    );

    const toggleButtons = document.querySelectorAll('.favorite-toggle[data-favorite-key]');
    toggleButtons.forEach((button) => {
        const key = button.dataset.favoriteKey;
        const isActive = key && favoriteKeys.has(key);
        button.classList.toggle('is-active', Boolean(isActive));
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        const icon = button.querySelector('i');
        if (icon) {
            icon.classList.toggle('fas', Boolean(isActive));
            icon.classList.toggle('far', !isActive);
            icon.classList.toggle('fa-solid', Boolean(isActive));
            icon.classList.toggle('fa-regular', !isActive);
        }
        if (isActive) {
            button.setAttribute('title', '取消收藏');
            button.setAttribute('aria-label', '取消收藏');
        } else {
            button.setAttribute('title', '收藏');
            button.setAttribute('aria-label', '收藏');
        }
    });

    if (dom.currentFavoriteToggle) {
        const currentSong = state.currentSong;
        const key = currentSong ? getSongKey(currentSong) : null;
        const isActive = key && favoriteKeys.has(key);
        dom.currentFavoriteToggle.disabled = !currentSong;
        dom.currentFavoriteToggle.setAttribute('aria-disabled', currentSong ? 'false' : 'true');
        dom.currentFavoriteToggle.classList.toggle('is-active', Boolean(isActive));
        dom.currentFavoriteToggle.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        const label = isActive ? '取消收藏当前歌曲' : '收藏当前歌曲';
        dom.currentFavoriteToggle.setAttribute('aria-label', label);
        dom.currentFavoriteToggle.setAttribute('title', label);
        const icon = dom.currentFavoriteToggle.querySelector('i');
        if (icon) {
            icon.classList.toggle('fas', Boolean(isActive));
            icon.classList.toggle('far', !isActive);
            icon.classList.toggle('fa-solid', Boolean(isActive));
            icon.classList.toggle('fa-regular', !isActive);
        }
    }
}

export function renderFavorites(state, dom) {
    if (!dom.favoriteItems || !dom.favorites) {
        return;
    }

    const favorites = ensureFavoriteSongsArray(state);

    if (favorites.length === 0) {
        dom.favorites.classList.add("empty");
        dom.favoriteItems.innerHTML = "";
        updateFavoriteIcons(state, dom);
        updateFavoriteActionStates(state, dom);
        return;
    }

    dom.favorites.classList.remove("empty");
    const favoritesHtml = favorites.map((song, index) => {
        const artistValue = Array.isArray(song.artist)
            ? song.artist.join(", ")
            : (song.artist || "未知艺术家");
        const isCurrent = state.currentList === "favorite" && index === state.currentFavoriteIndex;
        const songKey = getSongKey(song) || `favorite-${index}`;
        return `
        <div class="playlist-item${isCurrent ? " current" : ""}" data-index="${index}" role="button" tabindex="0" aria-label="播放 ${song.name}" data-favorite-key="${songKey}">
            <div class="playlist-item-info">
                <span class="playlist-item-title">${song.name}</span>
                <span class="playlist-item-artist"> - ${artistValue}</span>
            </div>
            <div class="playlist-item-actions" role="toolbar" aria-label="歌曲操作">
                <button class="favorite-item-action favorite-item-action--add" type="button" data-favorite-action="add" data-index="${index}" title="添加到播放列表" aria-label="添加到播放列表">
                    <i class="fas fa-plus"></i>
                </button>
                <button class="favorite-item-action favorite-item-action--download" type="button" data-favorite-action="download" data-index="${index}" title="下载" aria-label="下载">
                    <i class="fas fa-download"></i>
                </button>
                <button class="favorite-item-action favorite-item-action--remove" type="button" data-favorite-action="remove" data-index="${index}" title="从收藏列表移除" aria-label="从收藏列表移除">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>`;
    }).join("");

    dom.favoriteItems.innerHTML = favoritesHtml;
    updateFavoriteHighlight(state, dom);
    updateFavoriteIcons(state, dom);
    updateFavoriteActionStates(state, dom);
}

export function removeFavoriteAtIndex(index, state, dom, callbacks = {}) {
    const favorites = ensureFavoriteSongsArray(state);
    if (index < 0 || index >= favorites.length) {
        return null;
    }

    const removingSong = favorites[index];
    const removingKey = getSongKey(removingSong);
    const currentKey = state.currentSong ? getSongKey(state.currentSong) : null;
    const isPlayingFavorites = state.currentList === "favorite";
    const removingCurrent = isPlayingFavorites && ((state.currentFavoriteIndex === index) ||
        Boolean(state.currentSong && removingKey && removingKey === currentKey));

    const [removed] = favorites.splice(index, 1);

    if (isPlayingFavorites) {
        if (removingCurrent) {
            if (favorites.length === 0) {
                // 收藏夹删空了，彻底停播并重置为空态
                state.currentFavoriteIndex = -1;
                state.favoritePlaybackTime = 0;
                state.favoriteLastSavedPlaybackTime = 0;
                if (typeof callbacks.resetPlayerToIdle === "function") {
                    callbacks.resetPlayerToIdle();
                } else {
                    resetPlayerToIdle(state, dom, callbacks);
                }
            } else {
                // 还有其他收藏歌曲，计算下一首并自动连贯播放
                let targetIndex = index;
                if (index >= favorites.length) {
                    targetIndex = favorites.length - 1;
                }
                state.currentFavoriteIndex = targetIndex;
                if (typeof callbacks.playFavoriteSong === "function") {
                    callbacks.playFavoriteSong(targetIndex);
                }
            }
        } else if (state.currentFavoriteIndex > index) {
            state.currentFavoriteIndex--;
        }
    }

    if (typeof callbacks.saveFavoriteState === "function") callbacks.saveFavoriteState();
    renderFavorites(state, dom);
    if (typeof callbacks.updatePlayModeUI === "function") callbacks.updatePlayModeUI();
    if (typeof callbacks.clearLyricsIfLibraryEmpty === "function") callbacks.clearLyricsIfLibraryEmpty();
    return removed;
}

export function toggleFavorite(song, state, dom, callbacks = {}) {
    if (!song || typeof song !== "object") {
        return;
    }

    const normalizedSong = sanitizeImportedSong(song) || { ...song };
    const key = getSongKey(normalizedSong);
    if (!key) {
        showNotification("无法收藏该歌曲", "error", dom);
        return;
    }

    const favorites = ensureFavoriteSongsArray(state);
    const existingIndex = favorites.findIndex((item) => getSongKey(item) === key);

    if (existingIndex >= 0) {
        removeFavoriteAtIndex(existingIndex, state, dom, callbacks);
        showNotification("已从收藏列表移除", "success", dom);
    } else {
        favorites.push(normalizedSong);
        if (typeof callbacks.saveFavoriteState === "function") callbacks.saveFavoriteState();
        renderFavorites(state, dom);
        showNotification("已添加到收藏列表", "success", dom);
    }
}

export function addAllFavoritesToPlaylist(state, dom, callbacks = {}) {
    const favorites = ensureFavoriteSongsArray(state);
    if (favorites.length === 0) {
        showNotification("收藏列表为空", "warning", dom);
        return;
    }

    if (!Array.isArray(state.playlistSongs)) {
        state.playlistSongs = [];
    }

    // 若添加前播放列表为空且当前并未在播放播放列表中的歌曲，确保索引重置为 -1，防止新导入的歌曲被幽灵高亮
    if (state.playlistSongs.length === 0 && state.currentPlaylist !== "playlist") {
        state.currentTrackIndex = -1;
    }

    const existingKeys = new Set(
        state.playlistSongs
            .map(getSongKey)
            .filter((key) => typeof key === "string" && key !== "")
    );

    let addedCount = 0;
    favorites.forEach((fav) => {
        const key = getSongKey(fav);
        if (key && !existingKeys.has(key)) {
            state.playlistSongs.push({ ...fav });
            existingKeys.add(key);
            addedCount++;
        }
    });

    if (addedCount > 0) {
        if (typeof callbacks.savePlayerState === "function") callbacks.savePlayerState();
        if (typeof callbacks.renderPlaylist === "function") callbacks.renderPlaylist();
        showNotification(`已将 ${addedCount} 首歌曲加入播放列表`, "success", dom);
    } else {
        showNotification("收藏中的歌曲均已在播放列表中", "info", dom);
    }
}

export function clearFavorites(state, dom, callbacks = {}) {
    const favorites = ensureFavoriteSongsArray(state);
    if (favorites.length === 0) {
        return;
    }

    const isPlayingFavorites = state.currentList === "favorite";
    state.favoriteSongs = [];
    state.currentFavoriteIndex = -1;
    state.favoritePlaybackTime = 0;
    state.favoriteLastSavedPlaybackTime = 0;

    if (isPlayingFavorites) {
        if (typeof callbacks.resetPlayerToIdle === "function") {
            callbacks.resetPlayerToIdle();
        } else {
            resetPlayerToIdle(state, dom, callbacks);
        }
    }

    if (typeof callbacks.saveFavoriteState === "function") callbacks.saveFavoriteState();
    renderFavorites(state, dom);
    if (typeof callbacks.clearLyricsIfLibraryEmpty === "function") callbacks.clearLyricsIfLibraryEmpty();
    showNotification("已清空收藏列表", "success", dom);
}

export function exportFavorites(state, dom) {
    const favorites = ensureFavoriteSongsArray(state);
    if (favorites.length === 0) {
        showNotification("收藏列表为空，无法导出", "warning", dom);
        return;
    }

    try {
        const payload = {
            version: FAVORITE_EXPORT_VERSION,
            type: "solara_favorites",
            timestamp: new Date().toISOString(),
            favorites,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Solara_Favorites_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showNotification("收藏列表已成功导出", "success", dom);
    } catch (e) {
        console.error("导出收藏列表失败:", e);
        showNotification("导出失败，请稍后重试", "error", dom);
    }
}

export function handleImportFavoritesChange(event, state, dom, callbacks = {}) {
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

            const items = Array.isArray(payload.favorites)
                ? payload.favorites
                : (Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.songs) ? payload.songs : []));

            if (!Array.isArray(items) || items.length === 0) {
                throw new Error("NO_SONGS");
            }

            const favorites = ensureFavoriteSongsArray(state);
            const existingKeys = new Set(
                favorites
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
                favorites.push(song);
                if (key) existingKeys.add(key);
                added++;
            });

            if (added > 0) {
                if (typeof callbacks.saveFavoriteState === "function") callbacks.saveFavoriteState();
                renderFavorites(state, dom);
                const duplicateHint = duplicates > 0 ? `（${duplicates} 首已存在跳过）` : "";
                showNotification(`成功导入 ${added} 首收藏歌曲${duplicateHint}`, "success", dom);
            } else {
                showNotification("文件中的歌曲已全部在收藏列表中", "warning", dom);
            }
        } catch (error) {
            console.error("导入收藏列表失败:", error);
            showNotification("导入失败，请检查文件格式是否有效", "error", dom);
        } finally {
            if (input) {
                input.value = "";
            }
        }
    };

    reader.onerror = () => {
        console.error("读取收藏列表文件失败:", reader.error);
        showNotification("无法读取所选文件", "error", dom);
        if (input) {
            input.value = "";
        }
    };

    reader.readAsText(file, "utf-8");
}
