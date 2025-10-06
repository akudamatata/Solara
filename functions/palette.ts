import decodeJpeg from "./lib/vendor/jpeg-decoder.js";
import UPNG from "./lib/vendor/upng.js";

const MAX_DIMENSION = 96;
const TARGET_SAMPLE_COUNT = 2400;

type SupportedFormat = "jpeg" | "jpg" | "pjpeg" | "png" | "apng" | "x-png";

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

class UnsupportedImageFormatError extends Error {
  constructor(format: string) {
    super(`Unsupported image format: ${format}`);
    this.name = "UnsupportedImageFormatError";
  }
}

interface PaletteStop {
  gradient: string;
  colors: string[];
}

interface ThemeTokens {
  primaryColor: string;
  primaryColorDark: string;
}

interface PaletteResponse {
  source: string;
  baseColor: string;
  averageColor: string;
  accentColor: string;
  contrastColor: string;
  gradients: Record<"light" | "dark", PaletteStop>;
  tokens: Record<"light" | "dark", ThemeTokens>;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface AnalyzedColors {
  average: HslColor;
  accent: HslColor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function componentToHex(value: number): string {
  const clamped = clamp(Math.round(value), 0, 255);
  return clamped.toString(16).padStart(2, "0");
}

function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): HslColor {
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

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): RgbColor {
  const saturation = clamp(s, 0, 1);
  const lightness = clamp(l, 0, 1);

  const normalizedHue = ((h % 360) + 360) % 360 / 360;

  if (saturation === 0) {
    const value = lightness * 255;
    return { r: value, g: value, b: value };
  }

  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  const r = hueToRgb(p, q, normalizedHue + 1 / 3) * 255;
  const g = hueToRgb(p, q, normalizedHue) * 255;
  const b = hueToRgb(p, q, normalizedHue - 1 / 3) * 255;

  return { r, g, b };
}

function hslToHex(color: HslColor): string {
  const rgb = hslToRgb(color.h, color.s, color.l);
  return rgbToHex(rgb);
}

function relativeLuminance(r: number, g: number, b: number): number {
  const normalize = (value: number) => {
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

function pickContrastColor(color: RgbColor): string {
  const luminance = relativeLuminance(color.r, color.g, color.b);
  return luminance > 0.45 ? "#1f2937" : "#f8fafc";
}

function adjustSaturation(base: number, factor: number, offset = 0): number {
  return clamp(base * factor + offset, 0, 1);
}

function adjustLightness(base: number, offset: number, factor = 1): number {
  return clamp(base * factor + offset, 0, 1);
}

function analyzeImageColors(image: DecodedImage): AnalyzedColors {
  const { data } = image;
  const totalPixels = data.length / 4;
  const step = Math.max(1, Math.floor(totalPixels / TARGET_SAMPLE_COUNT));

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  let accent: { color: HslColor; score: number } | null = null;

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

function buildGradientStops(accent: HslColor): { light: PaletteStop; dark: PaletteStop } {
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

function buildThemeTokens(accent: HslColor): Record<"light" | "dark", ThemeTokens> {
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

function resizeImage(image: DecodedImage): DecodedImage {
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

async function decodeImage(arrayBuffer: ArrayBuffer, contentType: string): Promise<DecodedImage> {
  const subtype = contentType.split("/")[1]?.split(";")[0]?.toLowerCase() ?? "";
  const normalizedSubtype = subtype === "" ? "" : subtype.replace(/^x-/, "");

  const jpegFormats: SupportedFormat[] = ["jpeg", "jpg", "pjpeg"];
  const pngFormats: SupportedFormat[] = ["png", "apng", "x-png"];

  if (jpegFormats.includes(normalizedSubtype as SupportedFormat)) {
    const bytes = new Uint8Array(arrayBuffer);
    const decoded = decodeJpeg(bytes, {
      useTArray: true,
      formatAsRGBA: true,
    });

    const image: DecodedImage = {
      width: decoded.width,
      height: decoded.height,
      data: new Uint8ClampedArray(decoded.data),
    };

    return resizeImage(image);
  }

  if (pngFormats.includes(normalizedSubtype as SupportedFormat)) {
    const png = await UPNG.decode(arrayBuffer);
    const frames = await UPNG.toRGBA8(png);
    const frame = frames[0];

    if (!frame) {
      throw new Error("PNG decoding returned no frames");
    }

    const frameView = frame instanceof ArrayBuffer
      ? new Uint8Array(frame)
      : new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);

    const image: DecodedImage = {
      width: png.width,
      height: png.height,
      data: new Uint8ClampedArray(frameView),
    };

    return resizeImage(image);
  }

  throw new UnsupportedImageFormatError(subtype);
}

async function buildPalette(arrayBuffer: ArrayBuffer, contentType: string): Promise<PaletteResponse> {
  const imageData = await decodeImage(arrayBuffer, contentType);
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

function createCorsHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  headers.set("Access-Control-Allow-Origin", "*");
  return headers;
}

function createJsonHeaders(status: number): Headers {
  const headers = createCorsHeaders({
    "Content-Type": "application/json; charset=utf-8",
  });
  headers.set("Cache-Control", status === 200 ? "public, max-age=3600" : "no-store");
  return headers;
}

function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function onRequest({ request }: { request: Request }): Promise<Response> {
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: createJsonHeaders(405),
    });
  }

  const url = new URL(request.url);
  const imageParam = url.searchParams.get("image") ?? url.searchParams.get("url");

  if (!imageParam) {
    return new Response(JSON.stringify({ error: "Missing image parameter" }), {
      status: 400,
      headers: createJsonHeaders(400),
    });
  }

  let target: URL;
  try {
    target = new URL(imageParam);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid image URL" }), {
      status: 400,
      headers: createJsonHeaders(400),
    });
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      cf: {
        cacheTtl: 3600,
        cacheEverything: true,
        image: {
          width: MAX_DIMENSION,
          height: MAX_DIMENSION,
          fit: "scale-down",
          quality: 85,
          format: "jpeg",
        },
      },
    });
  } catch (error) {
    console.warn("Image resizing fetch failed, falling back to original", error);
    upstream = await fetch(target.toString(), {
      cf: {
        cacheTtl: 3600,
        cacheEverything: true,
      },
    });
  }

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `Upstream request failed with status ${upstream.status}` }), {
      status: upstream.status,
      headers: createJsonHeaders(upstream.status),
    });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return new Response(JSON.stringify({ error: "Unsupported content type" }), {
      status: 415,
      headers: createJsonHeaders(415),
    });
  }

  const buffer = await upstream.arrayBuffer();

  try {
    const palette = await buildPalette(buffer, contentType);
    palette.source = target.toString();

    const response = new Response(JSON.stringify(palette), {
      status: 200,
      headers: createJsonHeaders(200),
    });

    try {
      await cache.put(cacheKey, response.clone());
    } catch (cacheError) {
      console.warn("Failed to cache palette response", cacheError);
    }

    return response;
  } catch (error) {
    if (error instanceof UnsupportedImageFormatError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 415,
        headers: createJsonHeaders(415),
      });
    }
    console.error("Palette generation failed", error);
    return new Response(JSON.stringify({ error: "Failed to analyze image" }), {
      status: 500,
      headers: createJsonHeaders(500),
    });
  }
}

