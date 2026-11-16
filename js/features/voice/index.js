/**
 * Solara 语音控制总装 (阶段一：点按麦克风说出指令)
 * 状态：off（未开启）→ idle（已开启待命）→ commandWindow（聆听中）→ running（执行指令）→ idle
 */

import { safeGetLocalStorage, safeSetLocalStorage } from "../../core/storage.js";
import { parseCommand } from "./commands.js";
import { createRecognizer, isSpeechSupported, isSecureEnough, checkOnDevice } from "./recognizer.js";

// 仅保存在本机：麦克风权限与识别语言因设备而异，不加入云端同步列表
const VOICE_SETTINGS_KEY = "voiceSettings";
const COMMAND_WINDOW_MS = 6000;
const VALID_LANGS = ["auto", "zh-CN", "en-US"];
const DEFAULT_VOICE_SETTINGS = { enabled: false, wakeWord: false, lang: "auto", preferOnDevice: true };

const INTENT_LABELS = {
    next: "下一首",
    previous: "上一首",
    pause: "暂停",
    resume: "继续播放",
};

const ERROR_MESSAGES = {
    "not-allowed": "麦克风权限被拒绝，请在浏览器设置中允许访问麦克风",
    "no-microphone": "未检测到可用的麦克风",
    "network": "语音识别服务连接失败，请检查网络",
    "language-not-supported": "当前浏览器不支持该识别语言",
    "unsupported": "当前浏览器不支持语音识别",
    "unknown": "语音识别出错，请稍后重试",
};

function loadVoiceSettings() {
    const settings = { ...DEFAULT_VOICE_SETTINGS };
    try {
        const raw = safeGetLocalStorage(VOICE_SETTINGS_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === "object") {
            if (typeof parsed.enabled === "boolean") settings.enabled = parsed.enabled;
            if (typeof parsed.wakeWord === "boolean") settings.wakeWord = parsed.wakeWord;
            if (VALID_LANGS.includes(parsed.lang)) settings.lang = parsed.lang;
            if (typeof parsed.preferOnDevice === "boolean") settings.preferOnDevice = parsed.preferOnDevice;
        }
    } catch (_) {}
    return settings;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function initVoiceControl({ dom, actions = {}, notify, t = (s) => s, debugLog } = {}) {
    const settings = loadVoiceSettings();
    const supported = isSpeechSupported();
    const secure = isSecureEnough();
    const available = supported && secure;

    const micButtons = [dom.voiceToggleBtn, dom.mobileVoiceToggle].filter(Boolean);
    const langInputs = dom.voiceLangList
        ? Array.from(dom.voiceLangList.querySelectorAll("input[name='voiceLang']"))
        : [];

    let phase = settings.enabled && available ? "idle" : "off";
    let recognizer = null;
    let windowTimer = null;
    let handled = false;
    let ducked = false;
    let lastMode = null;

    const log = (message) => {
        if (typeof debugLog === "function") debugLog(`[语音控制] ${message}`);
    };
    const toast = (message, type = "info") => {
        if (typeof notify === "function") notify(message, type);
    };
    const restingPhase = () => (settings.enabled && available ? "idle" : "off");

    const resolveLang = () => {
        if (settings.lang !== "auto") return settings.lang;
        return window.SITE_LANGUAGE === "ENG" ? "en-US" : "zh-CN";
    };

    const saveSettings = () => {
        safeSetLocalStorage(VOICE_SETTINGS_KEY, JSON.stringify(settings));
    };

    // 闪避：仅调整 audio 元素音量，不写入 state.volume 与本地存储
    const duck = () => {
        if (ducked) return;
        ducked = true;
        try { if (typeof actions.duck === "function") actions.duck(); } catch (_) {}
    };
    const unduck = () => {
        if (!ducked) return;
        ducked = false;
        try { if (typeof actions.unduck === "function") actions.unduck(); } catch (_) {}
    };

    const clearWindowTimer = () => {
        if (windowTimer) {
            clearTimeout(windowTimer);
            windowTimer = null;
        }
    };

    const statusText = () => {
        if (!secure) return "语音控制需要通过 HTTPS 或 localhost 访问";
        if (!supported) return "当前浏览器不支持语音识别，请使用 Chrome、Edge 或 Safari";
        if (lastMode === "on-device") return "上次识别在本设备上完成";
        if (lastMode === "cloud") return "上次识别使用了浏览器厂商的云端语音服务";
        return "";
    };

    const render = () => {
        const visible = available && settings.enabled;
        const listening = phase === "commandWindow";
        const micLabel = t(listening ? "停止聆听" : "语音指令");
        micButtons.forEach((btn) => {
            btn.hidden = !visible;
            btn.dataset.voiceState = listening ? "listening" : "idle";
            btn.setAttribute("aria-pressed", listening ? "true" : "false");
            btn.title = micLabel;
            btn.setAttribute("aria-label", micLabel);
        });

        if (dom.voiceEnableBtn) {
            const active = available && settings.enabled;
            dom.voiceEnableBtn.disabled = !available;
            dom.voiceEnableBtn.classList.toggle("is-active", active);
            dom.voiceEnableBtn.setAttribute("aria-pressed", active ? "true" : "false");
        }
        if (dom.voiceEnableText) {
            dom.voiceEnableText.textContent = t(settings.enabled && available ? "关闭语音控制" : "开启语音控制");
        }
        langInputs.forEach((input) => {
            input.checked = input.value === settings.lang;
            input.disabled = !available;
        });
        if (dom.voiceStatusHint) {
            const text = statusText();
            dom.voiceStatusHint.textContent = text ? t(text) : "";
            dom.voiceStatusHint.hidden = !text;
        }
    };

    const setPhase = (next) => {
        phase = next;
        render();
    };

    const notifyMiss = (heard) => {
        if (heard) {
            toast(`${t("没听清")} · “${escapeHtml(heard)}”`, "warning");
        } else {
            toast(t("没听清"), "info");
        }
    };

    const runAction = async (intent, heard) => {
        setPhase("running");
        log(`执行指令: ${intent} ← "${heard}"`);
        toast(`${t("语音指令")} · ${t(INTENT_LABELS[intent])} · “${escapeHtml(heard)}”`, "success");
        try {
            const fn = actions[intent];
            if (typeof fn === "function") await fn();
        } catch (error) {
            console.warn("语音指令执行失败:", error);
            toast(t("语音指令执行失败"), "error");
        } finally {
            if (phase === "running") setPhase(restingPhase());
        }
    };

    const handleResult = (alternatives) => {
        if (phase !== "commandWindow") return;
        handled = true;
        clearWindowTimer();
        unduck();
        log(`识别候选: ${JSON.stringify(alternatives)}`);
        const command = parseCommand(alternatives);
        if (command) {
            runAction(command.intent, command.text);
        } else {
            setPhase(restingPhase());
            notifyMiss(alternatives[0]);
        }
    };

    const handleError = (type, rawCode) => {
        if (type === "aborted") return;
        log(`识别错误: ${rawCode || type}`);
        if (phase !== "commandWindow") return;
        handled = true;
        if (type === "no-speech") {
            notifyMiss();
            return;
        }
        toast(t(ERROR_MESSAGES[type] || ERROR_MESSAGES.unknown), "error");
        if (type === "not-allowed") {
            // 麦克风权限丢失：退回关闭状态，需用户重新开启
            settings.enabled = false;
            saveSettings();
        }
    };

    const handleEnd = () => {
        clearWindowTimer();
        unduck();
        recognizer = null;
        if (phase === "commandWindow") {
            if (!handled) notifyMiss();
            setPhase(restingPhase());
        }
    };

    const startListening = () => {
        if (phase !== "idle" || document.hidden) return;
        handled = false;
        const lang = resolveLang();
        recognizer = createRecognizer({
            lang,
            preferOnDevice: settings.preferOnDevice,
            onResult: handleResult,
            onError: handleError,
            onEnd: handleEnd,
        });
        setPhase("commandWindow");
        duck();
        try {
            const { onDevice } = recognizer.start();
            lastMode = onDevice ? "on-device" : "cloud";
            log(`开始聆听 (${lang}，${onDevice ? "设备端识别" : "云端识别"})`);
        } catch (error) {
            console.warn("启动语音识别失败:", error);
            handleEnd();
            return;
        }
        render();
        windowTimer = setTimeout(() => {
            windowTimer = null;
            if (phase !== "commandWindow") return;
            log("聆听超时");
            handled = true;
            if (recognizer) recognizer.abort();
            notifyMiss();
            unduck();
            setPhase(restingPhase());
        }, COMMAND_WINDOW_MS);
    };

    const cancelListening = () => {
        clearWindowTimer();
        if (phase === "commandWindow") {
            handled = true;
            if (recognizer) recognizer.abort();
            setPhase(restingPhase());
        }
        unduck();
    };

    const handleMicClick = (event) => {
        if (event) event.stopPropagation();
        if (phase === "commandWindow") {
            log("手动停止聆听");
            cancelListening();
        } else {
            startListening();
        }
    };

    const prewarmOnDevice = () => {
        if (!available || !settings.enabled || !settings.preferOnDevice) return;
        checkOnDevice(resolveLang()).catch(() => {});
    };

    const enable = () => {
        if (!available) {
            toast(t(statusText()), "warning");
            render();
            return;
        }
        settings.enabled = true;
        saveSettings();
        if (phase === "off") setPhase("idle");
        else render();
        prewarmOnDevice();
        log("已开启");
    };

    const disable = () => {
        cancelListening();
        settings.enabled = false;
        saveSettings();
        setPhase("off");
        log("已关闭");
    };

    const handleEnableClick = () => {
        if (settings.enabled && available) {
            disable();
            toast(t("已关闭语音控制"), "info");
        } else {
            enable();
            if (settings.enabled && available) toast(t("已开启语音控制，点击麦克风按钮说出指令"), "success");
        }
    };

    const handleLangChange = (event) => {
        const value = event.target && event.target.value;
        if (!VALID_LANGS.includes(value)) return;
        settings.lang = value;
        saveSettings();
        prewarmOnDevice();
        render();
    };

    // 页面隐藏或离开时立即停止聆听并恢复音量
    const handleVisibility = () => {
        if (document.hidden) cancelListening();
    };
    const handlePageHide = () => cancelListening();

    micButtons.forEach((btn) => btn.addEventListener("click", handleMicClick));
    if (dom.voiceEnableBtn) dom.voiceEnableBtn.addEventListener("click", handleEnableClick);
    langInputs.forEach((input) => input.addEventListener("change", handleLangChange));
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);

    render();
    prewarmOnDevice();

    const destroy = () => {
        cancelListening();
        micButtons.forEach((btn) => btn.removeEventListener("click", handleMicClick));
        if (dom.voiceEnableBtn) dom.voiceEnableBtn.removeEventListener("click", handleEnableClick);
        langInputs.forEach((input) => input.removeEventListener("change", handleLangChange));
        document.removeEventListener("visibilitychange", handleVisibility);
        window.removeEventListener("pagehide", handlePageHide);
    };

    return { enable, disable, destroy };
}
