*** Begin Patch
*** Update File: js/index.js
@@
 // auto-refresh panel every 5s
-setInterval(() => { refreshTaskPanel(); }, 5000);
+// We will use SSE when available. Fallback to polling.
+let sse = null;
+async function initQueueSync() {
+  // Try SSE first
+  try {
+    const health = await checkQueueHealth();
+    if (health) {
+      startSSE();
+      return;
+    }
+  } catch (e) {}
+
+  // Fallback: use polling with backoff
+  startPollingWithBackoff();
+}
+
+setInterval(() => { /* noop placeholder kept for compatibility */ }, 5000);
+
+// health check helper
+async function checkQueueHealth() {
+  try {
+    const res = await fetch('/api/queue/health', { credentials: 'same-origin' });
+    if (!res.ok) return false;
+    const j = await res.json();
+    return j && j.ok;
+  } catch (e) { return false; }
+}
+
+function startPollingWithBackoff() {
+  let delay = 2000;
+  let stopped = false;
+  async function probe() {
+    if (stopped) return;
+    try {
+      await refreshTaskPanel();
+      delay = 2000; // reset on success
+    } catch (e) {
+      delay = Math.min(delay * 2, 60000);
+    }
+    setTimeout(probe, delay);
+  }
+  probe();
+  return () => { stopped = true; };
+}
+
+function startSSE() {
+  try {
+    sse = new EventSource('/api/download/events');
+    sse.addEventListener('ping', () => {});
+    sse.addEventListener('added', () => { refreshTaskPanel(); });
+    sse.addEventListener('active', () => { refreshTaskPanel(); });
+    sse.addEventListener('completed', () => { refreshTaskPanel(); });
+    sse.addEventListener('failed', () => { refreshTaskPanel(); });
+    sse.onerror = () => {
+      if (sse) { sse.close(); sse = null; }
+      startPollingWithBackoff();
+    };
+  } catch (e) {
+    startPollingWithBackoff();
+  }
+}
+
+// kick off
+if (document.readyState === 'loading') {
+  document.addEventListener('DOMContentLoaded', () => { ensureTaskPanel(); refreshTaskPanel(); initQueueSync(); });
+} else {
+  ensureTaskPanel(); refreshTaskPanel(); initQueueSync();
+}
*** End Patch