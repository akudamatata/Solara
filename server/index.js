*** Begin Patch
*** Update File: server/index.js
@@
-const createDownloadRouter  = require('./routes/download');
+const createDownloadRouter  = require('./routes/download');
+const createQueueHealthRouter = require('./routes/queue_health');
+const createDownloadEventsRouter = require('./routes/download_events');
@@
-app.use('/api/storage', createStorageRouter());
-app.use('/proxy',       createProxyRouter());
-app.use('/palette',     createPaletteRouter());
-// Mount download router (handles POST / and GET /status/:id)
-app.use('/api/download', createDownloadRouter());
-// Also mount the queue helper routes (list / cancel) so frontend can call /api/download/list etc.
-app.use('/api/download', downloadQueueRoutes);
+app.use('/api/storage', createStorageRouter());
+app.use('/proxy',       createProxyRouter());
+app.use('/palette',     createPaletteRouter());
+// Mount download router (handles POST / and GET /status/:id)
+app.use('/api/download', createDownloadRouter());
+// queue health (GET /api/queue/health)
+app.use('/api/queue', createQueueHealthRouter());
+// download events (SSE) mounted under /api/download/events
+app.use('/api/download', createDownloadEventsRouter(require('./queue').downloadQueue));
+// Also mount the queue helper routes (list / cancel) so frontend can call /api/download/list etc.
+app.use('/api/download', downloadQueueRoutes);
*** End Patch