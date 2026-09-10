/**
 * Solara Mobile UI - iOS 原生可拖拽 Bottom Sheet 抽屉控制器
 */

import { $, triggerLightHaptic, updateMobileOverlayScrim } from "./core.js";
import { closeMobileSearch } from "./search.js";

export function normalizePanelView(view) {
    return view === "lyrics" ? "playlist" : (view || "playlist");
}

export function switchMobilePanelTab(targetTab) {
    const isFavorites = targetTab === "favorites";
    const plTab = $("mobilePlaylistTab");
    const favTab = $("mobileFavoritesTab");
    const plActions = $("mobilePlaylistActions");
    const favActions = $("mobileFavoritesActions");
    const playlist = $("playlist");
    const favorites = $("favorites");

    if (plTab) {
        plTab.classList.toggle("active", !isFavorites);
        plTab.setAttribute("aria-selected", !isFavorites ? "true" : "false");
    }
    if (favTab) {
        favTab.classList.toggle("active", isFavorites);
        favTab.setAttribute("aria-selected", isFavorites ? "true" : "false");
    }

    if (plActions) {
        plActions.hidden = isFavorites;
        plActions.setAttribute("aria-hidden", isFavorites ? "true" : "false");
    }
    if (favActions) {
        favActions.hidden = !isFavorites;
        favActions.setAttribute("aria-hidden", !isFavorites ? "true" : "false");
    }

    if (playlist) {
        playlist.classList.toggle("active", !isFavorites);
        playlist.hidden = isFavorites;
        if (isFavorites) {
            playlist.setAttribute("hidden", "");
        } else {
            playlist.removeAttribute("hidden");
        }
    }
    if (favorites) {
        favorites.classList.toggle("active", isFavorites);
        favorites.hidden = !isFavorites;
        if (!isFavorites) {
            favorites.setAttribute("hidden", "");
        } else {
            favorites.removeAttribute("hidden");
        }
    }

    if (document.body) {
        document.body.setAttribute("data-mobile-panel-view", targetTab);
    }

    // 移动端分段控制器物理滑动胶囊
    const tabsContainer = $("mobilePanelHeader")?.querySelector(".playlist-tabs");
    if (tabsContainer) {
        requestAnimationFrame(() => {
            let indicator = tabsContainer.querySelector(".playlist-tabs-indicator");
            if (!indicator) {
                indicator = document.createElement("div");
                indicator.className = "playlist-tabs-indicator";
                indicator.setAttribute("aria-hidden", "true");
                tabsContainer.prepend(indicator);
            }
            const activeTab = isFavorites ? favTab : plTab;
            if (activeTab && activeTab.offsetWidth > 0) {
                indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
                indicator.style.width = `${activeTab.offsetWidth}px`;
                indicator.style.opacity = "1";
            }
        });
    }

    try {
        window.dispatchEvent(new CustomEvent("solara:mobile-tab-changed", { detail: { tab: targetTab } }));
    } catch (e) {}
}

export function openMobilePanel(view = "playlist") {
    if (!document.body) return;
    triggerLightHaptic();
    const targetView = normalizePanelView(view);
    switchMobilePanelTab(targetView);
    closeMobileSearch();
    document.body.classList.add("mobile-panel-open");
    updateMobileOverlayScrim();

    const panel = $("mobilePanel");
    if (panel) {
        requestAnimationFrame(() => {
            const tabsContainer = $("mobilePanelHeader")?.querySelector(".playlist-tabs");
            const activeTab = targetView === "favorites" ? $("mobileFavoritesTab") : $("mobilePlaylistTab");
            const indicator = tabsContainer?.querySelector(".playlist-tabs-indicator");
            if (indicator && activeTab && activeTab.offsetWidth > 0) {
                indicator.style.transform = `translateX(${activeTab.offsetLeft}px)`;
                indicator.style.width = `${activeTab.offsetWidth}px`;
                indicator.style.opacity = "1";
            }
        });
    }
    if (panel) {
        panel.style.transform = "";
        panel.style.transition = "";
    }
}

export function closeMobilePanel() {
    if (!document.body) return;
    document.body.classList.remove("mobile-panel-open");
    updateMobileOverlayScrim();

    const panel = $("mobilePanel");
    if (panel) {
        panel.style.transform = "";
        panel.style.transition = "";
    }
}

export function toggleMobilePanel(view = "playlist") {
    if (!document.body) return;
    const isOpen = document.body.classList.contains("mobile-panel-open");
    const currentView = document.body.getAttribute("data-mobile-panel-view") || "playlist";
    const targetView = normalizePanelView(view);
    if (isOpen && (!targetView || currentView === targetView)) {
        closeMobilePanel();
    } else {
        openMobilePanel(targetView || currentView || "playlist");
    }
}

export function closeAllMobileOverlays() {
    closeMobileSearch();
    closeMobilePanel();
}
