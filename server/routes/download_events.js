const express = require('express');

function sseHeaders(res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders && res.flushHeaders();
}

module.exports = function(downloadQueue) {
  const router = express.Router();

  router.get('/events', (req, res) => {
    sseHeaders(res);
    res.write(`event: ping\ndata: ${JSON.stringify({ time: Date.now() })}\n\n`);

    const sendEvent = (event, data) => {
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch (err) {
        // ignore write errors
      }
    };

    const onAdded = (jobId) => sendEvent('added', { id: jobId });
    const onActive = (jobId) => sendEvent('active', { id: jobId });
    const onCompleted = (jobId, result) => sendEvent('completed', { id: jobId, result });
    const onFailed = (jobId, err) => sendEvent('failed', { id: jobId, error: String(err) });

    downloadQueue.on('global:added', onAdded);
    downloadQueue.on('global:active', onActive);
    downloadQueue.on('global:completed', onCompleted);
    downloadQueue.on('global:failed', onFailed);

    const heartbeat = setInterval(() => sendEvent('ping', { time: Date.now() }), 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      try {
        downloadQueue.removeListener('global:added', onAdded);
        downloadQueue.removeListener('global:active', onActive);
        downloadQueue.removeListener('global:completed', onCompleted);
        downloadQueue.removeListener('global:failed', onFailed);
      } catch (_) {}
      res.end();
    });
  });

  return router;
};
