/**
 * Solara MediaSession 锁屏与系统级多媒体控制集成 (Safari / iOS Lock Screen / Windows Media Controls)
 */

import { preferHttpsUrl, toAbsoluteUrl } from "./storage.js";

export function getArtworkMime(url) {
    if (!url) {
        return 'image/png';
    }

    const normalized = url.split('?')[0].toLowerCase();
    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
        return 'image/jpeg';
    }
    if (normalized.endsWith('.webp')) {
        return 'image/webp';
    }
    if (normalized.endsWith('.gif')) {
        return 'image/gif';
    }
    if (normalized.endsWith('.bmp')) {
        return 'image/bmp';
    }
    if (normalized.endsWith('.svg')) {
        return 'image/svg+xml';
    }
    return 'image/png';
}

export function getArtworkList(url) {
    const src = (typeof preferHttpsUrl === 'function') ? preferHttpsUrl(url) : (url || '');
    const fallback = '/favicon.png';
    const baseSrc = src || fallback;
    const base = toAbsoluteUrl(baseSrc);
    const type = getArtworkMime(base);
    return [
        { src: base, sizes: '1024x1024', type },
        { src: base, sizes: '640x640', type },
        { src: base, sizes: '512x512', type },
        { src: base, sizes: '384x384', type },
        { src: base, sizes: '256x256', type },
        { src: base, sizes: '192x192', type },
        { src: base, sizes: '128x128', type },
        { src: base, sizes: '96x96',  type }
    ];
}

export function initMediaSession(state, dom, actions = {}) {
    const audio = dom.audioPlayer;
    if (!('mediaSession' in navigator) || !audio) return;

    let handlersBound = false;
    let lastPositionUpdateTime = 0;
    const MEDIA_SESSION_ENDED_FLAG = '__solaraMediaSessionHandledEnded';

    const preferLockScreenTrackControls = (() => {
        if (typeof navigator === 'undefined') {
            return false;
        }
        const ua = navigator.userAgent || '';
        const platform = navigator.platform || '';
        const isIOS = /iP(ad|hone|od)/.test(ua);
        const isTouchMac = !isIOS && platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
        return isIOS || isTouchMac;
    })();
    const allowLockScreenScrubbing = typeof navigator.mediaSession.setPositionState === 'function' && !preferLockScreenTrackControls;

    function updateMediaMetadata() {
        if (!state.currentSong) {
            try {
                navigator.mediaSession.metadata = null;
                navigator.mediaSession.playbackState = 'none';
            } catch (_) {}
            return;
        }

        const song = state.currentSong;
        const title = song.name || dom.currentSongTitle?.textContent || 'Solara';
        const artist = song.artist || dom.currentSongArtist?.textContent || '';
        const artworkUrl = state.currentArtworkUrl || '';

        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title,
                artist,
                album: song.album || '',
                artwork: getArtworkList(artworkUrl)
            });
        } catch (e) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({ title, artist });
            } catch (_) {}
        }
    }

    function triggerMediaSessionMetadataRefresh() {
        updateMediaMetadata();
    }

    window.__SOLARA_UPDATE_MEDIA_METADATA = updateMediaMetadata;

    function updatePositionState() {
        if (!allowLockScreenScrubbing) return;
        const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        const playbackRate = Number.isFinite(audio.playbackRate) ? audio.playbackRate : 1;
        try {
            navigator.mediaSession.setPositionState({ duration, position, playbackRate });
        } catch (_) {}
    }

    ['currentSong', 'currentArtworkUrl'].forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(state, key)) {
            return;
        }
        let internalValue = state[key];
        Object.defineProperty(state, key, {
            configurable: true,
            enumerable: true,
            get() {
                return internalValue;
            },
            set(nextValue) {
                internalValue = nextValue;
                triggerMediaSessionMetadataRefresh();
            }
        });
    });

    function bindActionHandlersOnce() {
        if (handlersBound) return;
        handlersBound = true;

        try {
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                const prevFn = actions.playPrevious || window.playPrevious;
                if (typeof prevFn === 'function') {
                    const result = prevFn();
                    if (result && typeof result.then === 'function') {
                        result.finally(triggerMediaSessionMetadataRefresh);
                    } else {
                        triggerMediaSessionMetadataRefresh();
                    }
                }
            });

            navigator.mediaSession.setActionHandler('nexttrack', () => {
                const nextFn = actions.playNext || window.playNext;
                if (typeof nextFn === 'function') {
                    const result = nextFn();
                    if (result && typeof result.then === 'function') {
                        result.finally(triggerMediaSessionMetadataRefresh);
                    } else {
                        triggerMediaSessionMetadataRefresh();
                    }
                }
            });

            navigator.mediaSession.setActionHandler('seekbackward', null);
            navigator.mediaSession.setActionHandler('seekforward', null);

            if (allowLockScreenScrubbing) {
                navigator.mediaSession.setActionHandler('seekto', (e) => {
                    if (!e || typeof e.seekTime !== 'number') return;
                    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, e.seekTime));
                    if (e.fastSeek && typeof audio.fastSeek === 'function') {
                        audio.fastSeek(audio.currentTime);
                    }
                    updatePositionState();
                });
            } else {
                try {
                    navigator.mediaSession.setActionHandler('seekto', null);
                } catch (_) {}
            }

            navigator.mediaSession.setActionHandler('play', async () => {
                try { await audio.play(); } catch(_) {}
            });
            navigator.mediaSession.setActionHandler('pause', () => audio.pause());
        } catch (_) {}
    }

    audio.addEventListener('loadedmetadata', () => {
        triggerMediaSessionMetadataRefresh();
        updatePositionState();
        lastPositionUpdateTime = Date.now();
        bindActionHandlersOnce();
    });

    audio.addEventListener('play', () => {
        navigator.mediaSession.playbackState = 'playing';
        updatePositionState();
        lastPositionUpdateTime = Date.now();
    });

    audio.addEventListener('pause', () => {
        navigator.mediaSession.playbackState = 'paused';
        updatePositionState();
        lastPositionUpdateTime = Date.now();
    });

    audio.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - lastPositionUpdateTime >= 1000) {
            lastPositionUpdateTime = now;
            updatePositionState();
        }
    });

    audio.addEventListener('durationchange', updatePositionState);
    audio.addEventListener('ratechange', updatePositionState);
    audio.addEventListener('seeking', updatePositionState);
    audio.addEventListener('seeked', updatePositionState);

    audio.addEventListener('ended', () => {
        navigator.mediaSession.playbackState = 'paused';
        updatePositionState();
        const refresh = () => {
            triggerMediaSessionMetadataRefresh();
            audio[MEDIA_SESSION_ENDED_FLAG] = false;
        };

        const autoPlayFn = actions.autoPlayNext || window.autoPlayNext;
        if (typeof autoPlayFn === 'function') {
            try {
                audio[MEDIA_SESSION_ENDED_FLAG] = 'handling';
                autoPlayFn();
                audio[MEDIA_SESSION_ENDED_FLAG] = 'skip';
                Promise.resolve().then(refresh);
                return;
            } catch (error) {
                console.warn('自动播放下一首失败:', error);
            }
        }

        audio[MEDIA_SESSION_ENDED_FLAG] = 'skip';
        const nextFn = actions.playNext || window.playNext;
        if (typeof nextFn === 'function') {
            try {
                const result = nextFn();
                if (typeof actions.updatePlayPauseButton === 'function') {
                    actions.updatePlayPauseButton();
                }
                if (result && typeof result.then === 'function') {
                    result.finally(refresh);
                } else {
                    Promise.resolve().then(refresh);
                }
                return;
            } catch (error) {
                console.warn('自动播放下一首失败:', error);
            }
        }
        refresh();
    });

    return {
        updateMediaMetadata,
        updatePositionState
    };
}
