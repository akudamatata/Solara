const { downloadQueue } = require('../queue');
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
  return name.replace(/[<>:\"/\\|?*\x00-\x1f]/g, '_').trim();
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

// Processor
downloadQueue.process(async (job) => {
  const { song, quality = '320' } = job.data;
  job.progress(5);

  if (!song || !song.id || !song.source) {
    throw new Error('Missing song info');
  }

  ensureDir(NAS_DOWNLOAD_DIR);

  const audioData = await fetchSongUrl(song.id, song.source, quality);
  if (!audioData || !audioData.url) {
    throw new Error('无法获取音频地址');
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
    job.progress(100);
    return { success: true, message: '文件已存在', filename };
  }

  const response = await fetch(audioData.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error('下载音频失败');

  // normalize stream
  let sourceStream = response.body;
  if (!sourceStream || typeof sourceStream.pipe !== 'function') {
    if (typeof Readable.fromWeb === 'function' && sourceStream && typeof sourceStream.getReader === 'function') {
      sourceStream = Readable.fromWeb(sourceStream);
    } else {
      sourceStream = Readable.from(sourceStream);
    }
  }

  const tempPath = filepath + '.part';
  try {
    await pipeline(sourceStream, fs.createWriteStream(tempPath));

    // race check
    if (fs.existsSync(filepath)) {
      await fs.promises.unlink(tempPath).catch(() => {});
      job.progress(100);
      return { success: true, message: '文件已存在', filename };
    }

    await fs.promises.rename(tempPath, filepath);

    job.progress(100);
    return { success: true, message: '下载成功', filename };
  } catch (err) {
    try { if (fs.existsSync(tempPath)) await fs.promises.unlink(tempPath); } catch(e) {}
    throw err;
  }
});

// simple listener for logging
downloadQueue.on('completed', (job, result) => {
  console.log(`[downloadQueue] completed job ${job.id}`, result);
});

downloadQueue.on('failed', (job, err) => {
  console.error(`[downloadQueue] job ${job.id} failed`, err);
});

console.log('Download worker started (connected to queue)');
