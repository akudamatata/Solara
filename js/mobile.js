/**
 * Solara Mobile UI & Fluid Gestures Engine (总入口编排层)
 * 依据 Apple Design (WWDC Fluid Interfaces) 准则构建的高性能手势与交互引擎
 */

import { $, updateMobileOverlayScrim } from "./mobile/core.js";
import { openMobileSearch, closeMobileSearch, toggleMobileSearch } from "./mobile/search.js";
import { openMobilePanel, closeMobilePanel, toggleMobilePanel, switchMobilePanelTab, closeAllMobileOverlays } from "./mobile/sheet.js";
import { toggleMobileLyrics, initMobileLyricsInteractions } from "./mobile/stage.js";
import { initBottomSheetGestures, initSearchPanelGestures } from "./mobile/gestures.js";
import { bindMobileToolbar } from "./mobile/toolbar.js";

(function () {
    // 检查是否为移动端
    const ua = navigator.userAgent || "";
    const isMobileUA = /android|iphone|ipad|ipod|mobile|blackberry|phone|opera mini|windows phone/i.test(ua);
    const isSmallScreen = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 820px)").matches;
    const isMobile = window.__SOLARA_IS_MOBILE || isMobileUA || isSmallScreen;

    if (!isMobile) {
        return;
    }

    const bridge = window.SolaraMobileBridge || {};
    bridge.handlers = bridge.handlers || {};
    bridge.queue = Array.isArray(bridge.queue) ? bridge.queue : [];
    window.SolaraMobileBridge = bridge;

    let initialized = false;

    // 移动端初始化总装
    function initializeMobileUI() {
        if (initialized || !document.body) {
            return;
        }
        initialized = true;

        document.body.classList.add("mobile-view");
        document.body.setAttribute("data-mobile-panel-view", "playlist");

        // 1. 搜索按钮绑定
        const mobileSearchToggle = $("mobileSearchToggle");
        if (mobileSearchToggle) {
            mobileSearchToggle.addEventListener("click", toggleMobileSearch);
        }
        const mobileSearchClose = $("mobileSearchClose");
        if (mobileSearchClose) {
            mobileSearchClose.addEventListener("click", closeMobileSearch);
        }

        // 2. 抽屉开关与切换绑定
        const mobileQueueToggle = $("mobileQueueToggle");
        if (mobileQueueToggle) {
            mobileQueueToggle.addEventListener("click", () => toggleMobilePanel("playlist"));
        }
        const mobilePanelClose = $("mobilePanelClose");
        if (mobilePanelClose) {
            mobilePanelClose.addEventListener("click", closeMobilePanel);
        }

        const plTab = $("mobilePlaylistTab");
        if (plTab) {
            plTab.addEventListener("click", (e) => {
                e.stopPropagation();
                switchMobilePanelTab("playlist");
            });
        }
        const favTab = $("mobileFavoritesTab");
        if (favTab) {
            favTab.addEventListener("click", (e) => {
                e.stopPropagation();
                switchMobilePanelTab("favorites");
            });
        }

        // 3. 顶部 Toolbar 工具栏交互绑定 (深浅主题、探索雷达)
        bindMobileToolbar();

        // 4. 点击封面显示歌词 / 初始化沉浸式歌词手势与点词即播
        const albumCover = $("albumCover");
        if (albumCover) {
            albumCover.addEventListener("click", () => toggleMobileLyrics(true));
        }
        initMobileLyricsInteractions();

        // 5. 初始化手势系统（底部播放列表抽屉 + 顶部搜索下拉面板）
        initBottomSheetGestures();
        initSearchPanelGestures();

        // 6. 遮罩层直接捕获抽屉外围空白区域轻触收起
        const scrim = $("mobileOverlayScrim");
        if (scrim) {
            scrim.addEventListener("click", (e) => {
                if (document.body.classList.contains("mobile-panel-open")) {
                    e.stopPropagation();
                    closeMobilePanel();
                }
            });
        }

        // 7. 全局点击顶部空白区域收起列表抽屉（包括工具栏、标题、遮罩与顶部留白）
        const handleGlobalClickOutside = (event) => {
            // 搜索面板打开时不处理（搜索由自身 X 按钮和独立层级关闭）
            if (document.body.classList.contains("mobile-search-open")) return;

            const isPanelOpen = document.body.classList.contains("mobile-panel-open");
            if (!isPanelOpen) return;

            const target = event.target;
            const panel = $("mobilePanel");
            if (!panel) return;

            // 点击在抽屉面板内部时，保持展开，不予关闭（内部交互由歌曲列表、标签等处理）
            if (panel.contains(target)) {
                return;
            }

            // 点击了队列切换按钮本身，由自身的 toggle 逻辑处理
            if (target && typeof target.closest === "function" && 
                (target.closest("#mobileQueueToggle") || target.closest(".transport-button--queue"))) {
                return;
            }

            // 点击了抽屉上方的顶部空白处、工具栏、标题等外围区域：拦截并收起抽屉
            event.stopPropagation();
            closeMobilePanel();
        };

        document.addEventListener("click", handleGlobalClickOutside, true);
        updateMobileOverlayScrim();
    }

    // 暴露桥接接口供全局或桌面端联动
    bridge.handlers.openSearch = openMobileSearch;
    bridge.handlers.closeSearch = closeMobileSearch;
    bridge.handlers.toggleSearch = toggleMobileSearch;
    bridge.handlers.openPanel = openMobilePanel;
    bridge.handlers.closePanel = closeMobilePanel;
    bridge.handlers.togglePanel = toggleMobilePanel;
    bridge.handlers.toggleLyrics = toggleMobileLyrics;
    bridge.handlers.closeAllOverlays = closeAllMobileOverlays;
    bridge.handlers.initialize = initializeMobileUI;

    if (bridge.queue.length) {
        const pending = bridge.queue.splice(0, bridge.queue.length);
        for (const entry of pending) {
            const handler = bridge.handlers[entry.name];
            if (typeof handler === "function") {
                handler(...(entry.args || []));
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeMobileUI, { once: true });
    } else {
        initializeMobileUI();
    }
})();