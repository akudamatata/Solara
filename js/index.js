1| // js/index.js — enqueue NAS downloads, poll status and show task panel
2| 
3| // Global download locks
4| const downloadLocks = window.__downloadLocks || (window.__downloadLocks = new Set());
5| 
6| function getSongByIndexType(index, type) {
7|   if (type === "search") return state.searchResults[index];
8|   if (type === "online") return state.onlineSongs[index];
9|   if (type === "playlist") return state.playlistSongs[index];
10|   if (type === "favorites") return state.favoriteSongs[index];
11|   return null;
12| }
13| 
14| // --- Task Panel UI ---
15| function ensureTaskPanel() {
16|   if (document.getElementById('download-task-panel')) return;
17|   const panel = document.createElement('div');
18|   panel.id = 'download-task-panel';
19|   panel.style.position = 'fixed';
20|   panel.style.right = '12px';
21|   panel.style.bottom = '12px';
22|   panel.style.width = '320px';
23|   panel.style.maxHeight = '50vh';
24|   panel.style.overflow = 'auto';
25|   panel.style.background = 'rgba(255,255,255,0.95)';
26|   panel.style.border = '1px solid #ddd';
27|   panel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
28|   panel.style.padding = '8px';
29|   panel.style.zIndex = 100000;
30|   panel.innerHTML = `<div style="font-weight:600;margin-bottom:8px;">下载任务</div><div id="download-task-list"></div>`;
31|   document.body.appendChild(panel);
32| }
33| 
34| function renderTaskList(tasks) {
35|   ensureTaskPanel();
36|   const list = document.getElementById('download-task-list');
37|   list.innerHTML = '';
38|   tasks.forEach(t => {
39|     const item = document.createElement('div');
40|     item.style.borderTop = '1px solid #eee';
41|     item.style.padding = '6px 4px';
42|     const title = (t.data && t.data.song && t.data.song.name) ? t.data.song.name : '未知歌曲';
43|     const state = t.state || 'unknown';
44|     const progress = t.progress || 0;
45|     item.innerHTML = `<div style="font-size:13px;font-weight:500;">${title}</div>
46|       <div style="font-size:12px;color:#666;margin-top:4px;">状态: ${state} ${state==='active' || state==='waiting' ? ` - ${Math.min(100,progress)}%` : ''}</div>`;
47|     if (state === 'waiting' || state === 'delayed') {
48|       const btn = document.createElement('button');
49|       btn.textContent = '取消';
50|       btn.style.marginTop = '6px';
51|       btn.onclick = async () => {
52|         btn.disabled = true;
53|         try {
54|           const r = await fetch(`/api/download/cancel/${encodeURIComponent(t.id)}`, { method: 'POST', credentials: 'same-origin' });
55|           const j = await r.json();
56|           if (r.ok) {
57|             showNotification('任务已取消', 'success');
58|             refreshTaskPanel();
59|           } else {
60|             showNotification(j && j.error ? j.error : '取消失败', 'error');
61|           }
62|         } catch (e) {
63|           showNotification('取消请求失败', 'error');
64|         } finally {
65|           btn.disabled = false;
66|         }
67|       };
68|       item.appendChild(btn);
69|     }
70|     list.appendChild(item);
71|   });
72| }
73| 
74| async function refreshTaskPanel() {
75|   try {
76|     const res = await fetch('/api/download/list', { credentials: 'same-origin' });
77|     if (!res.ok) return;
78|     const data = await res.json();
79|     renderTaskList(data);
80|   } catch (e) {
81|     console.warn('refreshTaskPanel failed', e);
82|   }
83| }
84| 
85| // auto-refresh panel every 5s
86| setInterval(() => { refreshTaskPanel(); }, 5000);
87| 
88| // Polling utility
89| function pollDownloadStatus(taskId, { interval = 2000, timeout = 1000 * 60 * 15 } = {}, onTick) {
90|   return new Promise((resolve) => {
91|     const start = Date.now();
92|     let stopped = false;
93| 
94|     async function tick() {
95|       if (stopped) return;
96|       try {
97|         const res = await fetch(`/api/download/status/${encodeURIComponent(taskId)}`, { credentials: 'same-origin' });
98|         if (!res.ok) throw new Error('状态查询失败');
99|         const data = await res.json();
100|         onTick && onTick(data);
101|         if (data.state === 'completed') return resolve({ ok: true, result: data.result || null });
102|         if (data.state === 'failed') return resolve({ ok: false, error: data.result || 'failed' });
103|       } catch (err) {
104|         console.warn('pollDownloadStatus error', err);
105|       }
106| 
107|       if (Date.now() - start > timeout) {
108|         stopped = true;
109|         return resolve({ ok: false, error: 'timeout' });
110|       }
111| 
112|       setTimeout(tick, interval);
113|     }
114| 
115|     tick();
116|   });
117| }
118| 
119| // triggerDownload kept as before (fetch->blob fallback)
120| async function triggerDownload(url, filename) {
121|   try {
122|     const resp = await fetch(url, { mode: 'cors' });
123|     if (resp.ok) {
124|       const contentType = resp.headers.get('content-type') || '';
125|       if (contentType.includes('text/html') && !contentType.includes('audio')) {
126|         throw new Error('response is HTML');
127|       }
128|       const blob = await resp.blob();
129|       const href = URL.createObjectURL(blob);
130|       const a = document.createElement('a');
131|       a.href = href;
132|       a.download = filename || '';
133|       a.style.display = 'none';
134|       document.body.appendChild(a);
135|       a.click();
136|       a.remove();
137|       setTimeout(() => URL.revokeObjectURL(href), 10000);
138|       return true;
139|     } else {
140|       throw new Error('fetch failed');
141|     }
142|   } catch (err) {
143|     try {
144|       const a = document.createElement('a');
145|       a.href = url;
146|       a.target = '_blank';
147|       a.rel = 'noopener';
148|       if (filename) a.download = filename;
149|       a.style.display = 'none';
150|       document.body.appendChild(a);
151|       a.click();
152|       a.remove();
153|       return true;
154|     } catch (err2) {
155|       console.warn('triggerDownload fallback failed', err2);
156|       return false;
157|     }
158|   }
159| }
160| 
161| // downloadWithQualityToNas now enqueues and polls, and updates panel
162| async function downloadWithQualityToNas(event, index, type, quality) {
163|   event.stopPropagation();
164|   const song = getSongByIndexType(index, type);
165|   if (!song) return;
166| 
167|   const songKey = song.id ? String(song.id) : null;
168|   if (songKey && downloadLocks.has(songKey)) {
169|     showNotification('该歌曲正在下载中，请稍后', 'warning');
170|     return;
171|   }
172| 
173|   const dynamicMenu = document.querySelector('.dynamic-quality-menu');
174|   if (dynamicMenu) dynamicMenu.remove();
175| 
176|   if (songKey) downloadLocks.add(songKey);
177| 
178|   try {
179|     showNotification(`已向队列提交: ${song.name}`, 'info');
180|     const res = await fetch('/api/download', {
181|       method: 'POST',
182|       credentials: 'same-origin',
183|       headers: { 'Content-Type': 'application/json' },
184|       body: JSON.stringify({ song, quality })
185|     });
186| 
187|     if (!res.ok) throw new Error('入队失败');
188|     const data = await res.json();
189|     if (!data || !data.taskId) throw new Error(data && data.error ? data.error : '无效的入队响应');
190| 
191|     const taskId = data.taskId;
192|     showNotification(`已加入队列，任务ID: ${taskId}`, 'success');
193|     // refresh task panel immediately
194|     refreshTaskPanel();
195| 
196|     const result = await pollDownloadStatus(taskId, { interval: 2000, timeout: 1000 * 60 * 15 }, (status) => {
197|       if (status && (status.state === 'active' || status.state === 'waiting')) {
198|         refreshTaskPanel();
199|       }
200|     });
201| 
202|     if (!result.ok) {
203|       if (result.error === 'timeout') {
204|         showNotification('下载超时，请稍后到任务历史查看或重试', 'error');
205|       } else {
206|         showNotification(`下载失败: ${result.error}`, 'error');
207|       }
208|     } else {
209|       const final = result.result && result.result[0] ? result.result[0] : result.result;
210|       const filename = (final && final.filename) || (result.result && result.result.filename) || null;
211|       if (final && final.success) {
212|         showNotification(`下载完成: ${filename || song.name}`, 'success');
213|       } else if (filename) {
214|         showNotification(`下载完成: ${filename}`, 'success');
215|       } else {
216|         showNotification('下载完成（结果未知）', 'success');
217|       }
218|     }
219|   } catch (error) {
220|     console.error('下载到NAS失败:', error);
221|     showNotification('下载到NAS失败，请检查网络或稍后重试', 'error');
222|   } finally {
223|     if (songKey) downloadLocks.delete(songKey);
224|     refreshTaskPanel();
225|   }
226| }
227| 
228| // initialize panel on load
229| if (document.readyState === 'loading') {
230|   document.addEventListener('DOMContentLoaded', () => { ensureTaskPanel(); refreshTaskPanel(); });
231| } else {
232|   ensureTaskPanel(); refreshTaskPanel();
233| }
234| 
