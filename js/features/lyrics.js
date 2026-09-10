/**
 * Solara LRC 歌词解析引擎、时间轴平滑对齐与双端同步高亮
 */

import { API } from "../constants.js";

export function parseLyrics(lyricText, state) {
    const lines = lyricText.split('\n');
    const lyrics = [];

    lines.forEach(line => {
        const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const milliseconds = parseInt(match[3].padEnd(3, '0'));
            const time = minutes * 60 + seconds + milliseconds / 1000;
            const text = match[4].trim();

            if (text) {
                lyrics.push({ time, text });
            }
        }
    });

    state.lyricsData = lyrics.sort((a, b) => a.time - b.time);
}

export function setLyricsContentHtml(html, dom) {
    if (dom.lyricsContent) {
        dom.lyricsContent.innerHTML = html;
    }
    if (dom.mobileInlineLyricsContent) {
        dom.mobileInlineLyricsContent.innerHTML = html;
    }
}

export function clearLyricsContent(state, dom, isMobileView = false, closeMobileInlineLyrics = null) {
    setLyricsContentHtml("", dom);
    state.lyricsData = [];
    state.currentLyricLine = -1;
    if (isMobileView && typeof closeMobileInlineLyrics === "function") {
        closeMobileInlineLyrics({ force: true });
    }
}

export function clearLyricsIfLibraryEmpty(state, dom, isMobileView = false, closeMobileInlineLyrics = null) {
    const playlistEmpty = !Array.isArray(state.playlistSongs) || state.playlistSongs.length === 0;
    const favoritesEmpty = !Array.isArray(state.favoriteSongs) || state.favoriteSongs.length === 0;
    if (!playlistEmpty || !favoritesEmpty) {
        return;
    }

    const player = dom.audioPlayer;
    const hasActiveAudio = Boolean(player && player.src && !player.ended && !player.paused);
    if (hasActiveAudio) {
        return;
    }

    clearLyricsContent(state, dom, isMobileView, closeMobileInlineLyrics);
    if (dom.lyrics) {
        dom.lyrics.classList.add("empty");
        dom.lyrics.dataset.placeholder = "default";
    }
}

export function scrollToCurrentLyric(element, containerOverride, dom) {
    const container = containerOverride || dom?.lyricsScroll || dom?.lyrics;
    if (!container || !element) {
        return;
    }
    const containerHeight = container.clientHeight;
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const elementOffsetTop = elementRect.top - containerRect.top + container.scrollTop;
    const elementHeight = elementRect.height;

    const focalRatio = (container.id === "mobileInlineLyricsScroll" || container.classList?.contains("mobile-inline-lyrics__scroll")) ? 0.40 : 0.5;
    const targetScrollTop = elementOffsetTop - (containerHeight * focalRatio) + (elementHeight / 2);
    const maxScrollTop = container.scrollHeight - containerHeight;
    const finalScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

    if (Math.abs(container.scrollTop - finalScrollTop) > 1) {
        if (typeof container.scrollTo === "function") {
            container.scrollTo({
                top: finalScrollTop,
                behavior: 'smooth'
            });
        } else {
            container.scrollTop = finalScrollTop;
        }
    }
}

export function displayLyrics(state, dom) {
    const lyricsHtml = state.lyricsData.map((lyric, index) =>
        `<div data-time="${lyric.time}" data-index="${index}">${lyric.text}</div>`
    ).join("");
    setLyricsContentHtml(lyricsHtml, dom);
    if (dom.lyrics) {
        dom.lyrics.dataset.placeholder = "default";
    }
    if (state.isMobileInlineLyricsOpen) {
        syncLyrics(state, dom);
    }
}

export function syncLyrics(state, dom) {
    if (!state.lyricsData || state.lyricsData.length === 0) return;

    const currentTime = dom.audioPlayer ? dom.audioPlayer.currentTime : 0;
    let currentIndex = -1;

    for (let i = 0; i < state.lyricsData.length; i++) {
        if (currentTime >= state.lyricsData[i].time) {
            currentIndex = i;
        } else {
            break;
        }
    }

    if (currentIndex !== state.currentLyricLine) {
        state.currentLyricLine = currentIndex;

        const lyricTargets = [];
        if (dom.lyricsContent) {
            lyricTargets.push({
                elements: dom.lyricsContent.querySelectorAll("div[data-index]"),
                container: dom.lyricsScroll || dom.lyrics,
            });
        }
        if (dom.mobileInlineLyricsContent) {
            lyricTargets.push({
                elements: dom.mobileInlineLyricsContent.querySelectorAll("div[data-index]"),
                container: dom.mobileInlineLyricsScroll || dom.mobileInlineLyrics,
                inline: true,
            });
        }

        lyricTargets.forEach(({ elements, container, inline }) => {
            elements.forEach((element, index) => {
                if (index === currentIndex) {
                    element.classList.add("current");
                    const shouldScroll = !state.userScrolledLyrics && (!inline || state.isMobileInlineLyricsOpen);
                    if (shouldScroll) {
                        scrollToCurrentLyric(element, container, dom);
                    }
                } else {
                    element.classList.remove("current");
                }
            });
        });
    }
}

const lyricsMemoryCache = new Map();

export async function loadLyrics(song, state, dom, debugLogger = null) {
    const log = (msg) => {
        if (typeof debugLogger === "function") debugLogger(msg);
        else if (typeof window !== "undefined" && typeof window.__solaraDebugLog === "function") window.__solaraDebugLog(msg);
    };

    if (!song) return;
    const cacheKey = `${song.source || 'netease'}_${song.lyric_id || song.id}`;

    // 1. 优先命中前端内存缓存（0 网络请求）
    if (lyricsMemoryCache.has(cacheKey)) {
        const cachedLyric = lyricsMemoryCache.get(cacheKey);
        log(`[歌词缓存] 命中内存缓存，无需请求网络`);
        parseLyrics(cachedLyric, state);
        if (dom.lyrics) {
            dom.lyrics.classList.remove("empty");
            dom.lyrics.dataset.placeholder = "default";
        }
        displayLyrics(state, dom);
        return;
    }

    try {
        const lyricUrl = API.getLyric(song);
        log(`[歌词请求] 解析接口: ${lyricUrl}`);

        const lyricData = await API.fetchJson(lyricUrl);

        if (lyricData && lyricData.lyric) {
            lyricsMemoryCache.set(cacheKey, lyricData.lyric);
            parseLyrics(lyricData.lyric, state);
            if (dom.lyrics) {
                dom.lyrics.classList.remove("empty");
                dom.lyrics.dataset.placeholder = "default";
            }
            displayLyrics(state, dom);
            log(`[歌词解析] 加载成功，共 ${state.lyricsData.length} 行歌词`);
        } else {
            setLyricsContentHtml("<div>暂无歌词</div>", dom);
            if (dom.lyrics) {
                dom.lyrics.classList.add("empty");
                dom.lyrics.dataset.placeholder = "message";
            }
            state.lyricsData = [];
            state.currentLyricLine = -1;
            log("[歌词解析] 接口返回空，暂无歌词数据");
        }
    } catch (error) {
        console.error("加载歌词失败:", error);
        setLyricsContentHtml("<div>歌词加载失败</div>", dom);
        if (dom.lyrics) {
            dom.lyrics.classList.add("empty");
            dom.lyrics.dataset.placeholder = "message";
        }
        state.lyricsData = [];
        state.currentLyricLine = -1;
        log(`[歌词异常] 解析出错: ${error?.message || error}`);
    }
}

/**
 * 初始化电脑端歌词舞台交互（点词即播 Click-to-Seek 与滚轮防打扰）
 */
export function initDesktopLyricsInteractions(state, dom) {
    if (!dom.lyricsContent) return;

    // 1. 点词即播 (Click to Seek)
    dom.lyricsContent.addEventListener("click", (e) => {
        const line = e.target.closest("div[data-time]");
        if (!line) return;

        const time = parseFloat(line.getAttribute("data-time"));
        if (Number.isFinite(time) && dom.audioPlayer) {
            state.userScrolledLyrics = false;
            dom.audioPlayer.currentTime = time;
            if (dom.audioPlayer.paused) {
                dom.audioPlayer.play().catch(() => {});
            }
            syncLyrics(state, dom);
        }
    });

    // 2. 滚轮防打扰机制（用户手动翻看歌词时暂停自动居中跟随 3.5 秒）
    const scrollContainer = dom.lyricsScroll || dom.lyrics;
    if (scrollContainer) {
        scrollContainer.addEventListener("wheel", () => {
            state.userScrolledLyrics = true;
            if (state.lyricsScrollTimeout) {
                clearTimeout(state.lyricsScrollTimeout);
            }
            state.lyricsScrollTimeout = setTimeout(() => {
                state.userScrolledLyrics = false;
            }, 3500);
        }, { passive: true });
    }
}
