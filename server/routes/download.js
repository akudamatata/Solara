const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const NAS_DOWNLOAD_DIR = process.env.NAS_DOWNLOAD_DIR || '/app/downloads';
const API_BASE_URL = process.env.API_BASE_URL || 'https://music-api.gdstudio.xyz/api.php';
const FETCH_TIMEOUT_MS = Number(process.env.DOWNLOAD_FETCH_TIMEOUT_MS || 30000);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFilename(name) {
  if (!name) return 'unknown';
  return name.replace(/[<>:\"/\\|?*\x00-\x1f]/g, '_').trim();
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
    return { ok: res.ok, status: res.status, body: json };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSongUrl(songId, source, quality) {
  const url = new URL(API_BASE_URL);
  url.searchParams.set('types', 'url');
  url.searchParams.set('id', songId);
  url.searchParams.set('source', source);
  url.searchParams.set('br', quality);

  const { ok, status, body } = await fetchJsonWithTimeout(url.toString(), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!ok) {
    const err = new Error(` upstream returned ${status}`);
    err.payload = body;
    throw err;
  }

  // Normalize common response shapes to find a URL
  if (!body) return null;
  // Common patterns: { url: '...' }  OR { data: [{ url: '...'}] } OR { data: { url: '...'} } OR [{ url: '...'}]
  if (typeof body === 'string') {
    return { url: body };
  }
  if (body.url && typeof body.url === 'string') return { url: body.url };
  if (Array.isArray(body) && body.length > 0 && body[0] && body[0].url) return { url: body[0].url };
  if (body.data) {
    if (Array.isArray(body.data) && body.data.length > 0 && body.data[0] && body.data[0].url) return { url: body.data[0].url };
    if (typeof body.data === 'object' && body.data.url) return { url: body.data.url };
  }

  // Some providers embed the real url in body.data[0].url or body.data[0].src
  const maybe = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.url && typeof obj.url === 'string') return obj.url;
    if (obj.src && typeof obj.src === 'string') return obj.src;
    return null;
  };

  if (Array.isArray(body)) {
    for (const el of body) {
      const candidate = maybe(el);
      if (candidate) return { url: candidate };
    }
  }

  if (body.data && Array.isArray(body.data)) {
    for (const el of body.data) {
      const candidate = maybe(el);
      if (candidate) return { url: candidate };
    }
  }

  return null;
}

module.exports = function createDownloadRouter() {
  const router = Router();

  router.post('/', async (req, res) => {
    const { song, quality = '320' } = req.body || {};
    if (!song || !song.id || !song.source) {
      return res.status(400).json({ error: 'Missing song info' });
    }

    try {
      ensureDir(NAS_DOWNLOAD_DIR);

      const audioData = await fetchSongUrl(song.id, song.source, quality);
      if (!audioData || !audioData.url) {
        return res.status(502).json({ error: '无法获取音频地址' });
      }

      let ext = 'mp3';
      if (quality === '999') ext = 'flac';
      else if (quality === '740') ext = 'ape';
      try {
        const match = new URL(audioData.url).pathname.match(/\.([a-z0-9]+)$/i);
        if (match) ext = match[1];
      } catch (e) {}

      const artist = Array.isArray(song.artist) ? song.artist.join(', ') : (song.artist || '未知艺术家');
      const filename = `${sanitizeFilename(song.name)} - ${sanitizeFilename(artist)}.${ext}`;
      const filepath = path.join(NAS_DOWNLOAD_DIR, filename);

      if (fs.existsSync(filepath)) {
        return res.json({ success: true, message: '文件已存在', filename });
      }

      // Download with timeout and streaming
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let response;
      try {
        response = await fetch(audioData.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal });
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          return res.status(504).json({ error: '下载请求超时' });
        }
        console.error('[Download fetch error]', fetchErr);
        return res.status(502).json({ error: '下载音频失败' });
      } finally {
        clearTimeout(timer);
      }

      if (!response || !response.ok) return res.status(502).json({ error: '下载音频失败' });

      // Stream to file
      await pipeline(response.body, fs.createWriteStream(filepath));

      res.json({ success: true, message: '下载成功', filename });

    } catch (error) {
      console.error('[Download to NAS]', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
