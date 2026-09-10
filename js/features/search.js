/**
 * Solara 搜索模块 (多音源搜索、分页无限加载、批量操作多选框、批量导入歌单/收藏)
 */

import { API, normalizeSource, LAST_SEARCH_STATE_STORAGE_KEY } from "../constants.js";
import { safeSetLocalStorage, safeGetLocalStorage, cloneSearchResults, sanitizeStoredSearchState } from "../core/storage.js";
import { getSongKey, sanitizeImportedSong } from "./playlist.js";
import { ensureFavoriteSongsArray } from "./favorites.js";
import { showNotification } from "./settings.js";

let importSelectedMenuOutsideHandler = null;

export function ensureSelectedSearchResultsSet(state) {
    if (!(state.selectedSearchResults instanceof Set)) {
        state.selectedSearchResults = new Set();
    }
    return state.selectedSearchResults;
}

export function toggleSearchMode(enable, state, dom) {
    state.isSearchMode = enable;
    if (enable) {
        dom.container.classList.add("search-mode");
    } else {
        dom.container.classList.remove("search-mode");
    }
}

export function showSearchResults(state, dom) {
    toggleSearchMode(true, state, dom);
    dom.searchResults.classList.add("show");
    dom.searchResults.removeAttribute("hidden");
    dom.searchResults.setAttribute("aria-hidden", "false");
}

export function hideSearchResults(state, dom) {
    toggleSearchMode(false, state, dom);
    dom.searchResults.classList.remove("show");
    dom.searchResults.setAttribute("hidden", "");
    dom.searchResults.setAttribute("aria-hidden", "true");
}

export function restoreLastSearchResults(state, dom, callbacks = {}, options = {}) {
    const raw = safeGetLocalStorage(LAST_SEARCH_STATE_STORAGE_KEY);
    if (!raw) return false;
    try {
        const data = JSON.parse(raw);
        const restored = sanitizeStoredSearchState(data, state.searchSource);
        if (!restored || !Array.isArray(restored.results) || restored.results.length === 0) {
            return false;
        }

        state.searchKeyword = restored.keyword || "";
        state.searchSource = restored.source || state.searchSource;
        state.searchPage = restored.page || 1;
        state.hasMoreResults = Boolean(restored.hasMore);
        state.searchResults = restored.results;
        state.renderedSearchCount = 0;

        if (dom.searchInput && restored.keyword) {
            dom.searchInput.value = restored.keyword;
            if (dom.searchClearBtn) {
                dom.searchClearBtn.style.display = "flex";
            }
        }

        displaySearchResults(restored.results, {
            reset: true,
            totalCount: restored.results.length
        }, state, dom, callbacks);

        // 如果未指定展开视图（例如页面启动静默数据恢复），绝不切换到 search-mode 隐藏封面主舞台
        const shouldShowView = options.showView !== false;
        if (shouldShowView) {
            showSearchResults(state, dom);
        } else {
            hideSearchResults(state, dom);
        }
        return true;
    } catch (e) {
        console.warn("恢复上次搜索结果失败:", e);
        return false;
    }
}

export function applySelectionStateToElement(item, isSelected) {
    if (!item) {
        return;
    }
    item.classList.toggle("selected", Boolean(isSelected));
    const toggle = item.querySelector(".search-result-select");
    if (toggle) {
        toggle.setAttribute("aria-pressed", isSelected ? "true" : "false");
        toggle.setAttribute("aria-label", isSelected ? "取消选择" : "选择歌曲");
    }
}

export function updateSearchResultSelectionUI(index, state, dom) {
    const container = dom.searchResultsList || dom.searchResults;
    if (!container) {
        return;
    }
    const numericIndex = Number(index);
    const item = container.querySelector(`.search-result-item[data-index="${numericIndex}"]`);
    ensureSelectedSearchResultsSet(state);
    applySelectionStateToElement(item, state.selectedSearchResults.has(numericIndex));
}

export function closeImportSelectedMenu(dom) {
    if (!dom.importSelectedMenu || !dom.importSelectedBtn) {
        return;
    }
    if (!dom.importSelectedMenu.hasAttribute("hidden")) {
        dom.importSelectedMenu.setAttribute("hidden", "");
        dom.importSelectedBtn.setAttribute("aria-expanded", "false");
    }
    if (importSelectedMenuOutsideHandler) {
        document.removeEventListener("click", importSelectedMenuOutsideHandler);
        importSelectedMenuOutsideHandler = null;
    }
}

export function openImportSelectedMenu(dom) {
    if (!dom.importSelectedMenu || !dom.importSelectedBtn || dom.importSelectedBtn.disabled) {
        return;
    }
    dom.importSelectedMenu.removeAttribute("hidden");
    dom.importSelectedBtn.setAttribute("aria-expanded", "true");
    if (importSelectedMenuOutsideHandler) {
        document.removeEventListener("click", importSelectedMenuOutsideHandler);
    }
    importSelectedMenuOutsideHandler = (event) => {
        if (!dom.importSelectedMenu || !dom.importSelectedBtn) {
            return;
        }
        if (dom.importSelectedMenu.contains(event.target) || dom.importSelectedBtn.contains(event.target)) {
            return;
        }
        closeImportSelectedMenu(dom);
    };
    window.requestAnimationFrame(() => {
        document.addEventListener("click", importSelectedMenuOutsideHandler);
    });
}

export function updateImportSelectedButton(state, dom) {
    const button = dom.importSelectedBtn;
    if (!button) {
        return;
    }
    ensureSelectedSearchResultsSet(state);
    const count = state.selectedSearchResults.size;
    button.disabled = count === 0;
    button.setAttribute("aria-disabled", count === 0 ? "true" : "false");
    if (count === 0) {
        closeImportSelectedMenu(dom);
    }
    const countLabel = dom.importSelectedCount;
    if (countLabel) {
        countLabel.textContent = count > 0 ? `(${count})` : "";
    }
    const label = count > 0 ? `导入已选 (${count})` : "导入已选";
    button.title = label;
    button.setAttribute("aria-label", count > 0 ? `导入已选 ${count} 首歌曲` : "导入已选");

    const toolbar = button.closest(".search-results-toolbar");
    if (toolbar) {
        toolbar.classList.toggle("has-selected", count > 0);
    }
}

export function toggleSearchResultSelection(index, state, dom) {
    const numericIndex = Number(index);
    if (!Number.isInteger(numericIndex) || numericIndex < 0) {
        return;
    }
    ensureSelectedSearchResultsSet(state);
    if (state.selectedSearchResults.has(numericIndex)) {
        state.selectedSearchResults.delete(numericIndex);
    } else {
        state.selectedSearchResults.add(numericIndex);
    }
    updateSearchResultSelectionUI(numericIndex, state, dom);
    updateImportSelectedButton(state, dom);
}

export function resetSelectedSearchResults(state, dom) {
    ensureSelectedSearchResultsSet(state);
    if (state.selectedSearchResults.size === 0) {
        updateImportSelectedButton(state, dom);
        return;
    }
    const indices = Array.from(state.selectedSearchResults);
    state.selectedSearchResults.clear();
    indices.forEach(idx => updateSearchResultSelectionUI(idx, state, dom));
    updateImportSelectedButton(state, dom);
}

export function persistLastSearchState(state) {
    const payload = {
        keyword: state.searchKeyword,
        source: state.searchSource,
        page: state.searchPage,
        hasMore: state.hasMoreResults,
        results: cloneSearchResults(state.searchResults),
    };
    safeSetLocalStorage(LAST_SEARCH_STATE_STORAGE_KEY, JSON.stringify(payload));
}

export function createSearchResultItem(song, index, state, dom, callbacks = {}) {
    const item = document.createElement("div");
    item.className = "search-result-item";
    item.dataset.index = String(index);

    const selectionToggle = document.createElement("button");
    selectionToggle.className = "search-result-select";
    selectionToggle.type = "button";
    selectionToggle.innerHTML = '<i class="fas fa-check"></i>';
    selectionToggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSearchResultSelection(index, state, dom);
    });

    const info = document.createElement("div");
    info.className = "search-result-info";

    const title = document.createElement("div");
    title.className = "search-result-title";
    title.textContent = song.name || "未知歌曲";

    const artist = document.createElement("div");
    artist.className = "search-result-artist";
    const artistName = Array.isArray(song.artist)
        ? song.artist.join(', ')
        : (song.artist || "未知艺术家");
    const albumText = song.album ? ` - ${song.album}` : "";
    artist.textContent = `${artistName}${albumText}`;

    info.appendChild(title);
    info.appendChild(artist);

    const actions = document.createElement("div");
    actions.className = "search-result-actions";

    const favoriteButton = document.createElement("button");
    favoriteButton.className = "action-btn favorite favorite-toggle";
    favoriteButton.type = "button";
    favoriteButton.title = "收藏";
    favoriteButton.dataset.favoriteKey = getSongKey(song) || `search-${index}`;
    favoriteButton.innerHTML = '<i class="far fa-heart"></i>';
    favoriteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (typeof callbacks.toggleFavorite === "function") callbacks.toggleFavorite(song);
    });

    const playButton = document.createElement("button");
    playButton.className = "action-btn play";
    playButton.type = "button";
    playButton.title = "播放";
    playButton.innerHTML = '<i class="fas fa-play"></i>';
    playButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (typeof callbacks.playSearchResult === "function") callbacks.playSearchResult(index);
    });

    const downloadButton = document.createElement("button");
    downloadButton.className = "action-btn download";
    downloadButton.type = "button";
    downloadButton.title = "下载";
    downloadButton.innerHTML = '<i class="fas fa-download"></i>';
    downloadButton.addEventListener("click", (event) => {
        event.stopPropagation();
        if (typeof callbacks.showQualityMenu === "function") callbacks.showQualityMenu(event, index, "search");
    });

    actions.appendChild(favoriteButton);
    actions.appendChild(playButton);
    actions.appendChild(downloadButton);

    item.appendChild(selectionToggle);
    item.appendChild(info);
    item.appendChild(actions);

    applySelectionStateToElement(item, state.selectedSearchResults.has(index));

    item.addEventListener("click", (event) => {
        if (event.target.closest(".search-result-actions") || event.target.closest(".search-result-select")) {
            return;
        }
        toggleSearchResultSelection(index, state, dom);
    });

    item.addEventListener("dblclick", (event) => {
        if (event.target.closest(".search-result-actions") || event.target.closest(".search-result-select")) {
            return;
        }
        if (typeof callbacks.playSearchResult === "function") {
            callbacks.playSearchResult(index);
        }
    });

    return item;
}

export function displaySearchResults(results, options = {}, state, dom, callbacks = {}) {
    const { reset = false, totalCount = results.length } = options;
    const listContainer = dom.searchResultsList || dom.searchResults;
    if (!listContainer) return;

    if (reset) {
        listContainer.innerHTML = "";
        state.renderedSearchCount = 0;
    }

    const startIndex = state.renderedSearchCount;
    results.forEach((song, idx) => {
        const item = createSearchResultItem(song, startIndex + idx, state, dom, callbacks);
        listContainer.appendChild(item);
    });

    state.renderedSearchCount += results.length;

    let loadMoreBtn = document.getElementById("loadMoreBtn");
    if (!loadMoreBtn && state.hasMoreResults) {
        loadMoreBtn = document.createElement("button");
        loadMoreBtn.id = "loadMoreBtn";
        loadMoreBtn.className = "load-more-btn";
        loadMoreBtn.type = "button";
        loadMoreBtn.innerHTML = '<svg class="apple-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>加载更多</span>';
        loadMoreBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            loadMoreResults(state, dom, callbacks, callbacks?.debugLog);
        });
        listContainer.appendChild(loadMoreBtn);
    } else if (loadMoreBtn && !state.hasMoreResults) {
        loadMoreBtn.remove();
    } else if (loadMoreBtn) {
        listContainer.appendChild(loadMoreBtn);
    }

    if (typeof callbacks.updateFavoriteIcons === "function") {
        callbacks.updateFavoriteIcons();
    }
}

export async function performSearch(isLiveSearch = false, state, dom, callbacks = {}, debugLogger = null) {
    const query = dom.searchInput.value.trim();
    if (!query) {
        showNotification("请输入搜索关键词", "error", dom);
        return;
    }

    if (state.sourceMenuOpen && typeof callbacks.closeSourceMenu === "function") {
        callbacks.closeSourceMenu();
    }

    const source = normalizeSource(state.searchSource);
    state.searchSource = source;
    safeSetLocalStorage("searchSource", source);

    if (!isLiveSearch) {
        state.searchPage = 1;
        state.searchKeyword = query;
        state.searchSource = source;
        state.searchResults = [];
        state.hasMoreResults = true;
        state.renderedSearchCount = 0;
        resetSelectedSearchResults(state, dom);
        const listContainer = dom.searchResultsList || dom.searchResults;
        if (listContainer) {
            listContainer.innerHTML = "";
        }
        if (typeof debugLogger === "function") debugLogger(`开始新搜索: ${query}, 来源: ${source}`);
    } else {
        state.searchKeyword = query;
        state.searchSource = source;
    }

    const listContainer = dom.searchResultsList || dom.searchResults;

    try {
        dom.searchBtn.disabled = true;
        dom.searchBtn.innerHTML = '<span class="loader"></span><span>搜索中...</span>';

        showSearchResults(state, dom);
        if (listContainer) {
            listContainer.classList.add("is-searching");
        }
        if (typeof debugLogger === "function") debugLogger("已切换到搜索模式");

        const results = await API.search(query, source, 20, state.searchPage, debugLogger);
        if (typeof debugLogger === "function") debugLogger(`API返回结果数量: ${results.length}`);

        if (listContainer) {
            listContainer.classList.remove("is-searching");
        }

        if (state.searchPage === 1) {
            state.searchResults = results;
        } else {
            state.searchResults = [...state.searchResults, ...results];
        }

        state.hasMoreResults = results.length === 20;

        displaySearchResults(results, {
            reset: state.searchPage === 1,
            totalCount: state.searchResults.length,
        }, state, dom, callbacks);
        persistLastSearchState(state);
        if (typeof debugLogger === "function") debugLogger(`搜索完成: 总共显示 ${state.searchResults.length} 个结果`);

        if (state.searchResults.length === 0) {
            showNotification("未找到相关歌曲", "error", dom);
        }
    } catch (error) {
        console.error("搜索失败:", error);
        showNotification("搜索失败，请稍后重试", "error", dom);
        hideSearchResults(state, dom);
        if (typeof debugLogger === "function") debugLogger(`搜索失败: ${error.message}`);
    } finally {
        if (listContainer) {
            listContainer.classList.remove("is-searching");
        }
        dom.searchBtn.disabled = false;
        dom.searchBtn.innerHTML = '<svg class="apple-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg><span>搜索</span>';
    }
}

export async function loadMoreResults(state, dom, callbacks = {}, debugLogger = null) {
    if (!state.hasMoreResults || !state.searchKeyword) {
        return;
    }

    const loadMoreBtn = document.getElementById("loadMoreBtn");
    if (!loadMoreBtn) {
        return;
    }

    try {
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = '<span class="loader"></span><span>加载中...</span>';

        state.searchPage++;
        const source = normalizeSource(state.searchSource);
        state.searchSource = source;
        safeSetLocalStorage("searchSource", source);
        const results = await API.search(state.searchKeyword, source, 20, state.searchPage, debugLogger);

        if (results.length > 0) {
            state.searchResults = [...state.searchResults, ...results];
            state.hasMoreResults = results.length === 20;
            displaySearchResults(results, {
                totalCount: state.searchResults.length,
            }, state, dom, callbacks);
            persistLastSearchState(state);
        } else {
            state.hasMoreResults = false;
            showNotification("没有更多结果了", "info", dom);
        }
    } catch (error) {
        console.error("加载更多失败:", error);
        showNotification("加载失败，请稍后重试", "error", dom);
        state.searchPage--;
    } finally {
        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.innerHTML = '<svg class="apple-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>加载更多</span>';
        }
    }
}

export function importSelectedSearchResults(target = "playlist", state, dom, callbacks = {}) {
    ensureSelectedSearchResultsSet(state);
    if (state.selectedSearchResults.size === 0) {
        return;
    }

    const indices = Array.from(state.selectedSearchResults).filter((val) => Number.isInteger(val) && val >= 0);
    if (indices.length === 0) {
        resetSelectedSearchResults(state, dom);
        return;
    }

    const songsToAdd = indices
        .map((index) => state.searchResults[index])
        .filter((song) => song && typeof song === "object");

    if (songsToAdd.length === 0) {
        resetSelectedSearchResults(state, dom);
        showNotification("未找到可导入的歌曲", "warning", dom);
        return;
    }

    const processedIndices = [...indices];
    state.selectedSearchResults.clear();
    processedIndices.forEach(idx => updateSearchResultSelectionUI(idx, state, dom));
    updateImportSelectedButton(state, dom);

    if (target === "favorites") {
        const favorites = ensureFavoriteSongsArray(state);
        const existingKeys = new Set(
            favorites.map(getSongKey).filter((key) => typeof key === "string" && key !== "")
        );

        let added = 0;
        let duplicates = 0;

        songsToAdd.forEach((rawSong) => {
            const normalized = sanitizeImportedSong(rawSong);
            if (!normalized) return;
            const key = getSongKey(normalized);
            if (key && existingKeys.has(key)) {
                duplicates++;
                return;
            }
            favorites.push(normalized);
            if (key) existingKeys.add(key);
            added++;
        });

        if (typeof callbacks.saveFavoriteState === "function") callbacks.saveFavoriteState();
        if (typeof callbacks.renderFavorites === "function") callbacks.renderFavorites();

        if (added > 0) {
            const dupMsg = duplicates > 0 ? `，已跳过 ${duplicates} 首重复歌曲` : "";
            showNotification(`已添加 ${added} 首歌曲至收藏列表${dupMsg}`, "success", dom);
        } else {
            showNotification("所选歌曲已全部在收藏列表中", "info", dom);
        }
    } else {
        if (!Array.isArray(state.playlistSongs)) {
            state.playlistSongs = [];
        }
        const existingKeys = new Set(
            state.playlistSongs.map(getSongKey).filter((key) => typeof key === "string" && key !== "")
        );

        let added = 0;
        let duplicates = 0;

        songsToAdd.forEach((rawSong) => {
            const normalized = sanitizeImportedSong(rawSong);
            if (!normalized) return;
            const key = getSongKey(normalized);
            if (key && existingKeys.has(key)) {
                duplicates++;
                return;
            }
            state.playlistSongs.push(normalized);
            if (key) existingKeys.add(key);
            added++;
        });

        if (typeof callbacks.savePlayerState === "function") callbacks.savePlayerState();
        if (typeof callbacks.renderPlaylist === "function") callbacks.renderPlaylist();

        if (added > 0) {
            const dupMsg = duplicates > 0 ? `，已跳过 ${duplicates} 首重复歌曲` : "";
            showNotification(`已添加 ${added} 首歌曲至播放列表${dupMsg}`, "success", dom);
        } else {
            showNotification("所选歌曲已全部在播放列表中", "info", dom);
        }
    }

    closeImportSelectedMenu(dom);
}

/**
 * 彻底清空搜索结果与历史缓存（用户清空搜索框时调用）
 */
export function clearSearchResults(state, dom) {
    if (dom.searchInput) {
        dom.searchInput.value = "";
    }
    state.searchResults = [];
    state.searchKeyword = "";
    state.searchPage = 1;
    state.hasMoreResults = false;
    state.renderedSearchCount = 0;

    // 重置已勾选项
    resetSelectedSearchResults(state, dom);

    // 清空 DOM 搜索结果列表并清除搜索中状态
    const listContainer = dom.searchResultsList || dom.searchResults;
    if (listContainer) {
        listContainer.classList.remove("is-searching");
        listContainer.innerHTML = "";
    }

    // 清除本地存储的搜索历史快照
    safeSetLocalStorage(LAST_SEARCH_STATE_STORAGE_KEY, "");

    // 隐藏清空小叉号按钮
    if (dom.searchClearBtn) {
        dom.searchClearBtn.style.display = "none";
    }
}

