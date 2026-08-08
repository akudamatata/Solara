const { downloadQueue } = require('../queue');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const router = express.Router();

// Enqueue download job
router.post('/', async (req, res) => {
  const { song, quality = '320' } = req.body;
  if (!song || !song.id || !song.source) {
    return res.status(400).json({ error: 'Missing song info' });
  }

  try {
    const job = await downloadQueue.add({ song, quality, requestedBy: req.ip }, { removeOnComplete: true });
    return res.json({ success: true, message: '已加入下载队列', taskId: job.id });
  } catch (err) {
    console.error('[Download enqueue]', err);
    return res.status(500).json({ error: '无法加入下载队列' });
  }
});

// Get job status
router.get('/status/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const job = await downloadQueue.getJob(id);
    if (!job) return res.status(404).json({ error: '任务不存在' });
    const state = await job.getState();
    const progress = job._progress || (typeof job.progress === 'function' ? await job.progress() : 0);
    let result = null;
    if (state === 'completed') {
      try { result = await job.finished(); } catch (e) { result = null; }
    }
    res.json({ id: job.id, state, progress, result });
  } catch (err) {
    console.error('[Download status]', err);
    res.status(500).json({ error: '无法获取任务状态' });
  }
});

// List recent jobs (waiting/active/completed/failed/delayed)
router.get('/list', async (req, res) => {
  try {
    const jobs = await downloadQueue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'], 0, 49);
    const mapped = await Promise.all(jobs.map(async (job) => {
      let state = 'unknown';
      try { state = await job.getState(); } catch (e) { state = 'unknown'; }
      let progress = job._progress || 0;
      try { progress = typeof job.progress === 'function' ? await job.progress() : progress; } catch (e) {}
      return {
        id: job.id,
        state,
        progress,
        data: job.data,
        timestamp: job.timestamp || null
      };
    }));
    res.json(mapped);
  } catch (err) {
    console.error('[Download list]', err);
    res.status(500).json({ error: '无法获取任务列表' });
  }
});

// Cancel a job if it's not active
router.post('/cancel/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const job = await downloadQueue.getJob(id);
    if (!job) return res.status(404).json({ error: '任务不存在' });
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      return res.json({ success: true, message: '已取消任务' });
    }
    return res.status(400).json({ error: `无法取消处于 ${state} 状态的任务` });
  } catch (err) {
    console.error('[Download cancel]', err);
    res.status(500).json({ error: '取消任务失败' });
  }
});

module.exports = router;
