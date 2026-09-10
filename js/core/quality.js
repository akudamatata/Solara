/**
 * Solara 音质选择器、音源切换与 Apple 风格毛玻璃浮动菜单定位系统
 */

import { QUALITY_OPTIONS, SOURCE_OPTIONS, normalizeQuality, normalizeSource } from "../constants.js";
import { safeSetLocalStorage } from "./storage.js";

let qualityMenuAnchor = null;
let qualityMenuPositionFrame = null;
let sourceMenuPositionFrame = null;
let floatingMenuListenersAttached = false;

function isElementNode(value) {
    return Boolean(value) && typeof value === "object" && value.nodeType === 1;
}

function resolveQualityAnchor(anchor, dom) {
    if (isElementNode(anchor)) {
        return anchor;
    }
    if (isElementNode(dom.qualityToggle)) {
        return dom.qualityToggle;
    }
    if (isElementNode(dom.mobileQualityToggle)) {
        return dom.mobileQualityToggle;
    }
    return null;
}

function setQualityAnchorState(anchor, expanded) {
    if (!isElementNode(anchor)) {
        return;
    }
    anchor.classList.toggle("active", Boolean(expanded));
    if (typeof anchor.setAttribute === "function") {
        anchor.setAttribute("aria-expanded", expanded ? "true" : "false");
    }
}

export function updateQualityLabel(state, dom) {
    const option = QUALITY_OPTIONS.find(item => item.value === state.playbackQuality) || QUALITY_OPTIONS[0];
    if (!option) return;
    if (dom.qualityLabel) dom.qualityLabel.textContent = option.label;
    if (dom.qualityToggle) dom.qualityToggle.title = `音质: ${option.label} (${option.description})`;
    if (dom.mobileQualityLabel) {
        dom.mobileQualityLabel.textContent = option.label;
    }
    if (dom.mobileQualityToggle) {
        dom.mobileQualityToggle.title = `音质: ${option.label} (${option.description})`;
    }
}

export function updateSourceLabel(state, dom) {
    const option = SOURCE_OPTIONS.find(item => item.value === state.searchSource) || SOURCE_OPTIONS[0];
    if (dom.sourceSelectLabel) {
        dom.sourceSelectLabel.textContent = option.label;
    }
}

export function buildQualityMenu(state, dom) {
    if (!dom.playerQualityMenu) return;
    const optionsHtml = QUALITY_OPTIONS.map(option => {
        const isActive = option.value === state.playbackQuality;
        return `
            <div class="player-quality-option${isActive ? " active" : ""}" data-quality="${option.value}">
                <span>${option.label}</span>
                <small>${option.description}</small>
            </div>
        `;
    }).join("");
    dom.playerQualityMenu.innerHTML = optionsHtml;
    if (state.qualityMenuOpen) {
        schedulePlayerQualityMenuPositionUpdate(state, dom);
    }
}

export function buildSourceMenu(state, dom) {
    if (!dom.sourceMenu) return;
    const optionsHtml = SOURCE_OPTIONS.map(option => {
        const isActive = option.value === state.searchSource;
        return `
            <button type="button" class="source-option source-menu-item${isActive ? " active" : ""}" data-source="${option.value}" role="option" aria-selected="${isActive}">
                ${option.label}
            </button>
        `;
    }).join("");
    dom.sourceMenu.innerHTML = optionsHtml;
}

export function updatePlayerQualityMenuPosition(state, dom, isMobileView = false) {
    if (!state.qualityMenuOpen || !dom.playerQualityMenu) return;

    const anchor = qualityMenuAnchor || resolveQualityAnchor(null, dom);
    if (!isElementNode(anchor)) {
        return;
    }
    const menu = dom.playerQualityMenu;
    const toggleRect = anchor.getBoundingClientRect();
    const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    const spacing = 10;

    menu.classList.add("floating");
    menu.style.bottom = "auto";
    menu.style.right = "auto";

    const targetWidth = Math.max(Math.round(toggleRect.width), 180);
    menu.style.minWidth = `${targetWidth}px`;
    menu.style.maxWidth = `${targetWidth}px`;
    menu.style.width = `${targetWidth}px`;

    const menuRect = menu.getBoundingClientRect();
    const menuHeight = Math.round(menuRect.height) || 160;
    const menuWidth = Math.round(menuRect.width) || targetWidth;

    let openUpwards = true;
    let top = Math.round(toggleRect.top - spacing - menuHeight);
    if (top < spacing) {
        top = Math.round(toggleRect.bottom + spacing);
        openUpwards = false;
    }

    const isMobile = isMobileView ||
        Boolean(window.__SOLARA_IS_MOBILE) ||
        document.body?.classList.contains("mobile-view") ||
        document.documentElement?.classList.contains("mobile-view") ||
        anchor.id === "mobileQualityToggle" ||
        Boolean(anchor.classList && anchor.classList.contains("mobile-quality-chip"));

    let left;
    if (isMobile) {
        // 手机端/移动端音质胶囊：严格相对于胶囊按钮水平居中对齐
        left = Math.round(toggleRect.left + (toggleRect.width - menuWidth) / 2);
    } else {
        // 桌面端音质菜单：与底栏右侧音质按钮右对齐
        left = Math.round(toggleRect.right - menuWidth);
    }

    const minLeft = spacing;
    const maxLeft = Math.max(minLeft, viewportWidth - spacing - menuWidth);
    left = Math.min(Math.max(left, minLeft), maxLeft);

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.classList.toggle("open-upwards", openUpwards);
    menu.classList.toggle("open-downwards", !openUpwards);
}

export function schedulePlayerQualityMenuPositionUpdate(state, dom, isMobileView = false) {
    if (!state.qualityMenuOpen) {
        cancelPlayerQualityMenuPositionUpdate();
        return;
    }
    if (qualityMenuPositionFrame !== null) {
        return;
    }
    qualityMenuPositionFrame = window.requestAnimationFrame(() => {
        qualityMenuPositionFrame = null;
        updatePlayerQualityMenuPosition(state, dom, isMobileView);
    });
}

export function cancelPlayerQualityMenuPositionUpdate() {
    if (qualityMenuPositionFrame !== null) {
        window.cancelAnimationFrame(qualityMenuPositionFrame);
        qualityMenuPositionFrame = null;
    }
}

export function resetPlayerQualityMenuPosition(dom) {
    if (!dom.playerQualityMenu) return;
    dom.playerQualityMenu.classList.remove("floating", "open-upwards", "open-downwards");
    dom.playerQualityMenu.style.top = "";
    dom.playerQualityMenu.style.bottom = "";
    dom.playerQualityMenu.style.left = "";
    dom.playerQualityMenu.style.right = "";
    dom.playerQualityMenu.style.minWidth = "";
    dom.playerQualityMenu.style.maxWidth = "";
    dom.playerQualityMenu.style.width = "";
}

export function openPlayerQualityMenu(anchor, state, dom, isMobileView = false) {
    if (!dom.playerQualityMenu) return;
    const targetAnchor = resolveQualityAnchor(anchor, dom);
    if (!targetAnchor) {
        return;
    }
    if (qualityMenuAnchor && qualityMenuAnchor !== targetAnchor) {
        setQualityAnchorState(qualityMenuAnchor, false);
    }
    qualityMenuAnchor = targetAnchor;
    state.qualityMenuOpen = true;
    ensureFloatingMenuListeners(state, dom, isMobileView);
    buildQualityMenu(state, dom);
    const menu = dom.playerQualityMenu;
    if (menu && menu.parentElement !== document.body && document.body) {
        document.body.appendChild(menu);
    }
    setQualityAnchorState(qualityMenuAnchor, true);
    menu.classList.add("floating");
    menu.style.bottom = "auto";
    menu.style.right = "auto";

    menu.classList.add("show");
    updatePlayerQualityMenuPosition(state, dom, isMobileView);
    schedulePlayerQualityMenuPositionUpdate(state, dom, isMobileView);
}

export function closePlayerQualityMenu(state, dom) {
    if (!dom.playerQualityMenu) return;
    const menu = dom.playerQualityMenu;
    const wasOpen = state.qualityMenuOpen || menu.classList.contains("show");

    if (!wasOpen) {
        resetPlayerQualityMenuPosition(dom);
        setQualityAnchorState(qualityMenuAnchor, false);
        qualityMenuAnchor = null;
        releaseFloatingMenuListenersIfIdle(state);
        return;
    }

    const finalizeClose = () => {
        if (finalizeClose._timeout) {
            window.clearTimeout(finalizeClose._timeout);
            finalizeClose._timeout = null;
        }
        menu.removeEventListener("transitionend", handleTransitionEnd);
        if (state.qualityMenuOpen || menu.classList.contains("show")) {
            return;
        }
        resetPlayerQualityMenuPosition(dom);
        releaseFloatingMenuListenersIfIdle(state);
    };

    const handleTransitionEnd = (event) => {
        if (event.target !== menu) {
            return;
        }
        if (event.propertyName && !["opacity", "transform"].includes(event.propertyName)) {
            return;
        }
        finalizeClose();
    };

    menu.addEventListener("transitionend", handleTransitionEnd);
    finalizeClose._timeout = window.setTimeout(finalizeClose, 250);

    menu.classList.remove("show");
    state.qualityMenuOpen = false;
    cancelPlayerQualityMenuPositionUpdate();
    setQualityAnchorState(qualityMenuAnchor, false);
    qualityMenuAnchor = null;
}

export function togglePlayerQualityMenu(event, state, dom, isMobileView = false) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const anchor = resolveQualityAnchor(event && event.currentTarget ? event.currentTarget : qualityMenuAnchor, dom);
    if (!anchor) {
        return;
    }
    if (state.qualityMenuOpen && qualityMenuAnchor === anchor) {
        closePlayerQualityMenu(state, dom);
    } else {
        openPlayerQualityMenu(anchor, state, dom, isMobileView);
    }
}

export function updateSourceMenuPosition(dom) {
    const button = dom.sourceSelectButton;
    const menu = dom.sourceMenu;
    if (!button || !menu) return;

    const buttonRect = button.getBoundingClientRect();
    const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    const spacing = 6;
    const menuHeight = menu.offsetHeight || 180;

    let openUpwards = false;
    if (buttonRect.bottom + menuHeight + spacing > viewportHeight && buttonRect.top - menuHeight - spacing > 0) {
        openUpwards = true;
    }

    if (openUpwards) {
        menu.classList.add("open-upwards");
        menu.classList.remove("open-downwards");
        menu.style.top = "";
        menu.style.bottom = `${button.offsetHeight + spacing}px`;
    } else {
        menu.classList.add("open-downwards");
        menu.classList.remove("open-upwards");
        menu.style.bottom = "";
        menu.style.top = `${button.offsetHeight + spacing}px`;
    }
}

export function scheduleSourceMenuPositionUpdate(dom) {
    if (sourceMenuPositionFrame !== null) return;
    sourceMenuPositionFrame = window.requestAnimationFrame(() => {
        sourceMenuPositionFrame = null;
        updateSourceMenuPosition(dom);
    });
}

export function cancelSourceMenuPositionUpdate() {
    if (sourceMenuPositionFrame !== null) {
        window.cancelAnimationFrame(sourceMenuPositionFrame);
        sourceMenuPositionFrame = null;
    }
}

export function resetSourceMenuPosition(dom) {
    if (!dom.sourceMenu) return;
    dom.sourceMenu.classList.remove("open-upwards", "open-downwards");
    dom.sourceMenu.style.top = "";
    dom.sourceMenu.style.left = "";
    dom.sourceMenu.style.bottom = "";
    dom.sourceMenu.style.minWidth = "";
    dom.sourceMenu.style.maxWidth = "";
    dom.sourceMenu.style.width = "";
}

export function openSourceMenu(state, dom, isMobileView = false) {
    if (!dom.sourceMenu || !dom.sourceSelectButton) return;
    state.sourceMenuOpen = true;
    ensureFloatingMenuListeners(state, dom, isMobileView);
    buildSourceMenu(state, dom);
    dom.sourceMenu.classList.add("show");
    dom.sourceSelectButton.classList.add("active");
    dom.sourceSelectButton.setAttribute("aria-expanded", "true");
    updateSourceMenuPosition(dom);
    scheduleSourceMenuPositionUpdate(dom);
}

export function closeSourceMenu(state, dom) {
    if (!dom.sourceMenu) return;
    dom.sourceMenu.classList.remove("show");
    if (dom.sourceSelectButton) {
        dom.sourceSelectButton.classList.remove("active");
        dom.sourceSelectButton.setAttribute("aria-expanded", "false");
    }
    state.sourceMenuOpen = false;
    cancelSourceMenuPositionUpdate();
    resetSourceMenuPosition(dom);
    releaseFloatingMenuListenersIfIdle(state);
}

export function toggleSourceMenu(event, state, dom, isMobileView = false) {
    event.preventDefault();
    event.stopPropagation();
    if (state.sourceMenuOpen) {
        closeSourceMenu(state, dom);
    } else {
        openSourceMenu(state, dom, isMobileView);
    }
}

let outsideClickHandler = null;

export function ensureFloatingMenuListeners(state, dom, isMobileView = false) {
    if (!outsideClickHandler) {
        outsideClickHandler = (e) => {
            if (state.qualityMenuOpen && dom.playerQualityMenu && !dom.playerQualityMenu.contains(e.target)) {
                if (qualityMenuAnchor && qualityMenuAnchor.contains(e.target)) {
                    return;
                }
                closePlayerQualityMenu(state, dom);
            }
            if (state.sourceMenuOpen && dom.sourceMenu && dom.sourceSelectButton && 
                !dom.sourceMenu.contains(e.target) && !dom.sourceSelectButton.contains(e.target)) {
                closeSourceMenu(state, dom);
            }
        };
        window.requestAnimationFrame(() => {
            if (outsideClickHandler) {
                document.addEventListener("click", outsideClickHandler);
            }
        });
    }

    if (floatingMenuListenersAttached) {
        return;
    }
    window.addEventListener("resize", () => {
        if (state.sourceMenuOpen) scheduleSourceMenuPositionUpdate(dom);
        if (state.qualityMenuOpen) schedulePlayerQualityMenuPositionUpdate(state, dom, isMobileView);
    });
    window.addEventListener("scroll", () => {
        if (state.sourceMenuOpen) scheduleSourceMenuPositionUpdate(dom);
        if (state.qualityMenuOpen) schedulePlayerQualityMenuPositionUpdate(state, dom, isMobileView);
    }, { passive: true, capture: true });
    floatingMenuListenersAttached = true;
}

export function releaseFloatingMenuListenersIfIdle(state) {
    if (state.sourceMenuOpen || state.qualityMenuOpen) {
        return;
    }
    floatingMenuListenersAttached = false;
    if (outsideClickHandler) {
        document.removeEventListener("click", outsideClickHandler);
        outsideClickHandler = null;
    }
}

export async function selectPlaybackQuality(quality, state, dom, callbacks = {}) {
    const normalized = normalizeQuality(quality);
    if (normalized === state.playbackQuality) {
        closePlayerQualityMenu(state, dom);
        return;
    }

    state.playbackQuality = normalized;
    updateQualityLabel(state, dom);
    buildQualityMenu(state, dom);
    if (typeof callbacks.savePlayerState === "function") {
        callbacks.savePlayerState();
    }
    closePlayerQualityMenu(state, dom);

    const option = QUALITY_OPTIONS.find(item => item.value === normalized);
    window.__solaraDebugLog?.(`[音质配置] 已设为: ${option ? option.label : normalized} (${option?.description || ''})`);
    if (option && typeof callbacks.showNotification === "function") {
        callbacks.showNotification(`音质已切换为 ${option.label} (${option.description})`, "info", dom);
    }

    if (state.currentSong && typeof callbacks.reloadCurrentSong === "function") {
        const success = await callbacks.reloadCurrentSong();
        if (!success && typeof callbacks.showNotification === "function") {
            callbacks.showNotification("切换音质失败，请稍后重试", "error", dom);
        }
    }
}

export function handlePlayerQualitySelection(event, state, dom, callbacks = {}) {
    const option = event.target.closest(".player-quality-option");
    if (!option) return;
    event.preventDefault();
    event.stopPropagation();
    const { quality } = option.dataset;
    if (quality) {
        selectPlaybackQuality(quality, state, dom, callbacks);
    }
}

export function selectSearchSource(source, state, dom, callbacks = {}) {
    const normalized = normalizeSource(source);
    state.searchSource = normalized;
    safeSetLocalStorage("searchSource", normalized);
    updateSourceLabel(state, dom);
    buildSourceMenu(state, dom);
    closeSourceMenu(state, dom);

    const option = SOURCE_OPTIONS.find(item => item.value === normalized);
    if (option && typeof callbacks.showNotification === "function") {
        callbacks.showNotification(`已切换音源为 ${option.label}`, "info", dom);
    }

    if (typeof callbacks.onSourceChange === "function") {
        callbacks.onSourceChange(normalized);
    }
}

export function handleSourceSelection(event, state, dom, callbacks = {}) {
    const option = event.target.closest(".source-option, .source-menu-item");
    if (!option) return;
    event.preventDefault();
    event.stopPropagation();
    const { source } = option.dataset;
    if (source) {
        selectSearchSource(source, state, dom, callbacks);
    }
}
