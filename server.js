import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import decodeJpeg from "./functions/lib/vendor/jpeg-decoder.js";

const API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$/i;
const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "accept-ranges",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
  "expires",
];

const MAX_PALETTE_CACHE_AGE = 60 * 60 * 1000; // 1 hour

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(__dirname));

app.options("/proxy", handleProxyOptions);
app.get("/proxy", handleProxyRequest);
app.head("/proxy", handleProxyRequest);

app.options("/palette", handlePaletteOptions);
app.get("/palette", handlePaletteRequest);

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    });
    return res.status(204).end();
  }
  return next();
});

app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return next();
  }
  res.status(405).json({ error: "Method not allowed" });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const server = app.listen(process.env.PORT || 8788, () => {
  const address = server.address();
  if (address && typeof address === "object") {
    console.log(`Solara server listening on http://localhost:${address.port}`);
  }
});

function handleProxyOptions(req, res) {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  });
  res.status(204).end();
}

async function handleProxyRequest(req, res) {
  try {
    const target = req.query.target;
    if (target) {
      await proxyKuwoAudio(target, req, res);
      return;
    }

    await proxyApiRequest(req, res);
  } catch (error) {
    console.error("Proxy error", error);
    if (!res.headersSent) {
      sendJson(res, 502, { error: "Upstream request failed" }, { cacheControl: "no-store" });
    } else {
      res.end();
    }
  }
}

function sendJson(res, status, body, { cacheControl } = {}) {
  if (cacheControl) {
    res.set("Cache-Control", cacheControl);
  } else if (!res.get("Cache-Control")) {
    res.set("Cache-Control", status === 200 ? "public, max-age=3600" : "no-store");
  }
  res.set("Access-Control-Allow-Origin", "*");
  if (!res.get("Content-Type")) {
    res.type("application/json");
  }
  res.status(status);
  if (typeof body === "string") {
    res.send(body);
  } else {
    res.send(JSON.stringify(body));
  }
}

function createCorsHeadersFrom(upstreamHeaders) {
  const headers = {};
  for (const header of SAFE_RESPONSE_HEADERS) {
    const value = upstreamHeaders.get(header);
    if (value) {
      headers[header] = value;
    }
  }
  headers["Access-Control-Allow-Origin"] = "*";
  return headers;
}

function isAllowedKuwoHost(hostname) {
  if (!hostname) return false;
  return KUWO_HOST_PATTERN.test(hostname);
}

function normalizeKuwoUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!isAllowedKuwoHost(parsed.hostname)) {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.protocol = "http:";
    return parsed;
  } catch (error) {
    return null;
  }
}

async function proxyKuwoAudio(targetUrl, req, res) {
  const normalized = normalizeKuwoUrl(targetUrl);
  if (!normalized) {
    sendJson(res, 400, { error: "Invalid target" }, { cacheControl: "no-store" });
    return;
  }

  const headers = {
    "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
    Referer: "https://www.kuwo.cn/",
  };

  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  const upstream = await fetch(normalized, {
    method: req.method,
    headers,
  });

  const filteredHeaders = createCorsHeadersFrom(upstream.headers);
  if (!filteredHeaders["cache-control"]) {
    filteredHeaders["cache-control"] = "public, max-age=3600";
  }

  res.status(upstream.status);
  for (const [name, value] of Object.entries(filteredHeaders)) {
    res.set(name, value);
  }

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  if (!upstream.body) {
    res.end();
    return;
  }

  upstream.body.pipe(res);
  upstream.body.on("error", (error) => {
    console.error("Streaming error", error);
    if (!res.headersSent) {
      sendJson(res, 502, { error: "Streaming interrupted" }, { cacheControl: "no-store" });
    } else {
      res.end();
    }
  });
}

async function proxyApiRequest(req, res) {
  const incoming = new URL(req.originalUrl, `http://${req.headers.host}`);
  const apiUrl = new URL(API_BASE_URL);

  incoming.searchParams.forEach((value, key) => {
    if (key === "target" || key === "callback") {
      return;
    }
    apiUrl.searchParams.set(key, value);
  });

  if (!apiUrl.searchParams.has("types")) {
    sendJson(res, 400, { error: "Missing types" }, { cacheControl: "no-store" });
    return;
  }

  const upstream = await fetch(apiUrl, {
    headers: {
      "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
      Accept: "application/json",
    },
  });

  const filteredHeaders = createCorsHeadersFrom(upstream.headers);
  if (!filteredHeaders["content-type"]) {
    filteredHeaders["content-type"] = "application/json; charset=utf-8";
  }
  if (!filteredHeaders["cache-control"]) {
    filteredHeaders["cache-control"] = "no-store";
  }

  const body = await upstream.text();
  res.status(upstream.status);
  for (const [name, value] of Object.entries(filteredHeaders)) {
    res.set(name, value);
  }
  res.send(body);
}

function handlePaletteOptions(req, res) {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  });
  res.status(204).end();
}

const paletteCache = new Map();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function componentToHex(value) {
  const clamped = clamp(Math.round(value), 0, 255);
  return clamped.toString(16).padStart(2, "0");
}

function rgbToHex(rgb) {
  return `#${componentToHex(rgb.r)}${componentToHex(rgb.g)}${componentToHex(rgb.b)}`;
}

function rgbToHsl(r, g, b) {
  const rNorm = clamp(r / 255, 0, 1);
  const gNorm = clamp(g / 255, 0, 1);
  const bNorm = clamp(b / 255, 0, 1);

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s, l };
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  const saturation = clamp(s, 0, 1);
  const lightness = clamp(l, 0, 1);
  const normalizedHue = (((h % 360) + 360) % 360) / 360;

  if (saturation === 0) {
    const value = lightness * 255;
    return { r: value, g: value, b: value };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  const r = hueToRgb(p, q, normalizedHue + 1 / 3) * 255;
  const g = hueToRgb(p, q, normalizedHue) * 255;
  const b = hueToRgb(p, q, normalizedHue - 1 / 3) * 255;

  return { r, g, b };
}

function hslToHex(color) {
  const rgb = hslToRgb(color.h, color.s, color.l);
  return rgbToHex(rgb);
}

function relativeLuminance(r, g, b) {
  const normalize = (value) => {
    const channel = clamp(value / 255, 0, 1);
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  };

  const rLin = normalize(r);
  const gLin = normalize(g);
  const bLin = normalize(b);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function pickContrastColor(color) {
  const luminance = relativeLuminance(color.r, color.g, color.b);
  return luminance > 0.45 ? "#1f2937" : "#f8fafc";
}

function adjustSaturation(base, factor, offset = 0) {
  return clamp(base * factor + offset, 0, 1);
}

function adjustLightness(base, offset, factor = 1) {
  return clamp(base * factor + offset, 0, 1);
}

function analyzeImageColors(image) {
  const { data } = image;
  const totalPixels = data.length / 4;
  const TARGET_SAMPLE_COUNT = 2400;
  const step = Math.max(1, Math.floor(totalPixels / TARGET_SAMPLE_COUNT));

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;
  let accent = null;

  for (let index = 0; index < data.length; index += step * 4) {
    const alpha = data[index + 3];
    if (alpha < 48) {
      continue;
    }

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];

    totalR += r;
    totalG += g;
    totalB += b;
    count++;

    const hsl = rgbToHsl(r, g, b);
    const vibrance = hsl.s;
    const balance = 1 - Math.abs(hsl.l - 0.5);
    const score = vibrance * 0.65 + balance * 0.35;

    if (!accent || score > accent.score) {
      accent = { color: hsl, score };
    }
  }

  if (count === 0) {
    throw new Error("No opaque pixels available for analysis");
  }

  const averageR = totalR / count;
  const averageG = totalG / count;
  const averageB = totalB / count;
  const average = rgbToHsl(averageR, averageG, averageB);
  const accentColor = accent ? accent.color : average;

  return {
    average,
    accent: accentColor,
  };
}

function buildGradientStops(accent) {
  const lightColors = [
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.4, 0.08), l: adjustLightness(accent.l, 0.42, 0.52) }),
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.52, 0.05), l: adjustLightness(accent.l, 0.26, 0.62) }),
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.65), l: adjustLightness(accent.l, 0.12, 0.72) }),
  ];

  const darkColors = [
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.55, 0.04), l: adjustLightness(accent.l, 0.14, 0.38) }),
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.62, 0.02), l: adjustLightness(accent.l, 0.04, 0.3) }),
    hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.72), l: adjustLightness(accent.l, -0.04, 0.22) }),
  ];

  return {
    light: {
      colors: lightColors,
      gradient: `linear-gradient(140deg, ${lightColors[0]} 0%, ${lightColors[1]} 45%, ${lightColors[2]} 100%)`,
    },
    dark: {
      colors: darkColors,
      gradient: `linear-gradient(135deg, ${darkColors[0]} 0%, ${darkColors[1]} 55%, ${darkColors[2]} 100%)`,
    },
  };
}

function buildThemeTokens(accent) {
  return {
    light: {
      primaryColor: hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.6, 0.06), l: adjustLightness(accent.l, 0.22, 0.6) }),
      primaryColorDark: hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.72, 0.02), l: adjustLightness(accent.l, 0.06, 0.52) }),
    },
    dark: {
      primaryColor: hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.58, 0.04), l: adjustLightness(accent.l, 0.16, 0.42) }),
      primaryColorDark: hslToHex({ h: accent.h, s: adjustSaturation(accent.s, 0.68), l: adjustLightness(accent.l, 0.02, 0.32) }),
    },
  };
}

function resizeImage(image) {
  const MAX_DIMENSION = 96;
  const maxSide = Math.max(image.width, image.height);
  if (maxSide <= MAX_DIMENSION) {
    return image;
  }

  const scale = MAX_DIMENSION / maxSide;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const resized = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const srcY = Math.min(image.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const srcX = Math.min(image.width - 1, Math.floor(x / scale));
      const srcIndex = (srcY * image.width + srcX) * 4;
      const destIndex = (y * width + x) * 4;

      resized[destIndex] = image.data[srcIndex];
      resized[destIndex + 1] = image.data[srcIndex + 1];
      resized[destIndex + 2] = image.data[srcIndex + 2];
      resized[destIndex + 3] = image.data[srcIndex + 3];
    }
  }

  return {
    width,
    height,
    data: resized,
  };
}

function decodeImage(arrayBuffer, contentType) {
  const subtype = contentType.split("/")[1]?.split(";")[0]?.toLowerCase() ?? "";
  const supported = ["jpeg", "jpg", "pjpeg"];
  if (!supported.includes(subtype)) {
    const error = new Error(`Unsupported image format: ${subtype}`);
    error.name = "UnsupportedImageFormatError";
    throw error;
  }

  const bytes = new Uint8Array(arrayBuffer);
  const decoded = decodeJpeg(bytes, {
    useTArray: true,
    formatAsRGBA: true,
  });

  const image = {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  };

  return resizeImage(image);
}

async function buildPalette(arrayBuffer, contentType) {
  const imageData = decodeImage(arrayBuffer, contentType);
  const analyzed = analyzeImageColors(imageData);
  const gradientStops = buildGradientStops(analyzed.accent);
  const tokens = buildThemeTokens(analyzed.accent);
  const accentRgb = hslToRgb(analyzed.accent.h, analyzed.accent.s, analyzed.accent.l);

  return {
    source: "",
    baseColor: hslToHex(analyzed.accent),
    averageColor: hslToHex(analyzed.average),
    accentColor: hslToHex(analyzed.accent),
    contrastColor: pickContrastColor(accentRgb),
    gradients: {
      light: gradientStops.light,
      dark: gradientStops.dark,
    },
    tokens,
  };
}

async function handlePaletteRequest(req, res) {
  const imageParam = req.query.image || req.query.url;
  if (!imageParam) {
    sendJson(res, 400, { error: "Missing image parameter" }, { cacheControl: "no-store" });
    return;
  }

  let target;
  try {
    target = new URL(imageParam);
  } catch (error) {
    sendJson(res, 400, { error: "Invalid image URL" }, { cacheControl: "no-store" });
    return;
  }

  const cacheKey = target.toString();
  const cached = paletteCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json; charset=utf-8",
    });
    res.send(cached.payload);
    return;
  }

  let upstream;
  try {
    upstream = await fetch(target);
  } catch (error) {
    console.error("Palette fetch failed", error);
    sendJson(res, 502, { error: "Failed to fetch image" }, { cacheControl: "no-store" });
    return;
  }

  if (!upstream.ok) {
    sendJson(
      res,
      upstream.status,
      { error: `Upstream request failed with status ${upstream.status}` },
      { cacheControl: "no-store" }
    );
    return;
  }

  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    sendJson(res, 415, { error: "Unsupported content type" }, { cacheControl: "no-store" });
    return;
  }

  const buffer = await upstream.arrayBuffer();

  try {
    const palette = await buildPalette(buffer, contentType);
    palette.source = target.toString();
    const payload = JSON.stringify(palette);

    paletteCache.set(cacheKey, {
      payload,
      expires: Date.now() + MAX_PALETTE_CACHE_AGE,
    });

    res.set({
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json; charset=utf-8",
    });
    res.send(payload);
  } catch (error) {
    if (error && error.name === "UnsupportedImageFormatError") {
      sendJson(res, 415, { error: error.message }, { cacheControl: "no-store" });
      return;
    }
    console.error("Palette generation failed", error);
    sendJson(res, 500, { error: "Failed to analyze image" }, { cacheControl: "no-store" });
  }
}
