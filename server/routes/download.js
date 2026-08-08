const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const NAS_DOWNLOAD_DIR = process.env.NAS_DOWNLOAD_DIR || '/app/downloads';
const API_BASE_URL = process.env.API_BASE_URL || 'https://music-api.gdstudio.xyz/api.php';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFilename(name) {
  if (!name) return 'unknown';
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}

async function fetchSongUrl(songId, source, quality) {
  const url = new URL(API_BASE_URL);
  url.searchParams.set('types', 'url');
  url.searchParams.set('id', songId);
  url.searchParams.set('source', source);
  url.searchParams.set('br', quality);
  const res = await fetch(url.toString(), { headers: { 'User-Agent': 'Mozilla/5.0' } });
  return res.json();
}

module.exports = function createDownloadRouter() {
  const router = Router();

  router.post('/', async (req, res) => {
    const { song, quality = '320' } = req.body;
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
      } catch(e) {}

      const artist = Array.isArray(song.artist) ? song.artist.join(', ') : (song.artist || '未知艺术家');
      const filename = `${sanitizeFilename(song.name)} - ${sanitizeFilename(artist)}.${ext}`;
      const filepath = path.join(NAS_DOWNLOAD_DIR, filename);

      if (fs.existsSync(filepath)) {
        return res.json({ success: true, message: '文件已存在', filename });
      }

      const response = await fetch(audioData.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!response.ok) return res.status(502).json({ error: '下载音频失败' });

      // response.body 可能是 WHATWG ReadableStream（在 Node fetch 中）或 Node Readable
      let sourceStream = response.body;
      if (!sourceStream || typeof sourceStream.pipe !== 'function') {
        if (typeof Readable.fromWeb === 'function' && sourceStream && typeof sourceStream.getReader === 'function') {
          sourceStream = Readable.fromWeb(sourceStream);
        } else {
          sourceStream = Readable.from(sourceStream);
        }
      }

      // 原子写入：先写入临时文件，下载成功后重命名为最终文件；失败时清理临时文件
      const tempPath = filepath + '.part';
      try {
        await pipeline(sourceStream, fs.createWriteStream(tempPath));

        // 如果目标文件在此期间被创建，则移除临时文件并返回已存在
        if (fs.existsSync(filepath)) {
          await fs.promises.unlink(tempPath).catch(() => {});
          return res.json({ success: true, message: '文件已存在', filename });
        }

        // 将临时文件原子重命名为最终文件
        try {
          await fs.promises.rename(tempPath, filepath);
        } catch (renameErr) {
          // 如果目标已存在（race），删除临时文件并返回已存在
          if (renameErr && renameErr.code === 'EEXIST') {
            await fs.promises.unlink(tempPath).catch(() => {});
            return res.json({ success: true, message: '文件已存在', filename });
          }
          throw renameErr;
        }

        return res.json({ success: true, message: '下载成功', filename });
      } catch (streamErr) {
        // 清理临时文件
        try { if (fs.existsSync(tempPath)) await fs.promises.unlink(tempPath); } catch(e) {}
        throw streamErr;
      }

    } catch (error) {
      console.error('[Download to NAS]', error);
      if (error.name === 'AbortError') return res.status(504).json({ error: '下载请求超时' });
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
