/**
 * Solara Mobile UI - Spotlight 聚焦搜索面板控制器
 */

import { $, triggerLightHaptic, updateMobileOverlayScrim } from "./core.js";
import { LAST_SEARCH_STATE_STORAGE_KEY } from "../constants.js";

export function openMobileSearch() {
    if (!document.body) return;
    triggerLightHaptic();
    document.body.classList.add("mobile-search-open");
    document.body.classList.remove("mobile-panel-open");

    const searchArea = $("searchArea");
    if (searchArea) {
        searchArea.style.transform = "";
        searchArea.style.transition = "";
        searchArea.setAttribute("aria-hidden", "false");
    }
    const searchResults = $("searchResults");
    if (searchResults) {
        searchResults.removeAttribute("hidden");
        searchResults.setAttribute("aria-hidden", "false");
        searchResults.classList.add("show");
    }
    const listContainer = $("searchResultsList") || $("searchResults");
    const hasRenderedItems = listContainer && listContainer.querySelectorAll(".search-result-item").length > 0;
    if (!hasRenderedItems && typeof window.restoreLastSearchResults === "function") {
        window.restoreLastSearchResults({ showView: true });
    }
    updateMobileOverlayScrim();

    const searchInput = $("searchInput");
    if (searchInput) {
        if (!searchInput.value.trim()) {
            try {
                const raw = localStorage.getItem(LAST_SEARCH_STATE_STORAGE_KEY) || localStorage.getItem("lastSearchState");
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.keyword) {
                        searchInput.value = parsed.keyword;
                        const clearBtn = $("searchClearBtn");
                        if (clearBtn) clearBtn.style.display = "flex";
                    }
                }
            } catch (e) {}
        }
        window.requestAnimationFrame(() => {
            try {
                searchInput.focus({ preventScroll: true });
            } catch (error) {
                searchInput.focus();
            }
        });
    }
}

export function closeMobileSearch() {
    if (!document.body) return;
    document.body.classList.remove("mobile-search-open");

    const toggleSearchMode = window.toggleSearchMode;
    if (typeof toggleSearchMode === "function") {
        toggleSearchMode(false);
    } else if (typeof window.hideSearchResults === "function") {
        window.hideSearchResults();
    }

    const searchArea = $("searchArea");
    if (searchArea) {
        searchArea.style.transform = "";
        searchArea.style.transition = "";
        searchArea.setAttribute("aria-hidden", "true");
    }
    const searchInput = $("searchInput");
    if (searchInput) {
        searchInput.blur();
    }
    updateMobileOverlayScrim();
}

export function toggleMobileSearch() {
    if (!document.body) return;
    if (document.body.classList.contains("mobile-search-open")) {
        closeMobileSearch();
    } else {
        openMobileSearch();
    }
}
