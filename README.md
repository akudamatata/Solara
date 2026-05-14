# 🎶 Solara（光域）

> 🌐 由轻量后端服务支撑的现代化网页音乐播放器，整合多种音乐聚合接口，覆盖搜索、播放与音频下载全流程。

![Review-ezgif com-optimize](https://github.com/user-attachments/assets/487157de-bf71-4bc9-9e49-16a4f0a14472)
| | | |
|:--:|:--:|:--:|
| <img src="https://github.com/user-attachments/assets/7fcfd485-bcd4-46f9-887a-0a972dce3be3" height="700"/> | <img src="https://github.com/user-attachments/assets/bb092569-0a7f-47f6-b7e9-c07ea56949cf" height="700"/> | <img src="https://github.com/user-attachments/assets/02b830e3-292f-4880-91f2-86ec818b877a" height="700"/> |


## 🤝 参与贡献
感谢 GD音乐台(music.gdstudio.xyz)提供的免费API

感谢 来自Linux.do 牛就是牛@ufoo 大佬 https://linux.do/t/topic/942415 提供的灵感


## 🌟 主要特性

- 🔍 跨站曲库检索：一键切换数据源，支持分页浏览并批量导入播放队列。
- 🚀 智能边缘缓存：基于 Cloudflare Cache API 实现。具备**智能过滤机制**，仅缓存有效搜索结果，自动识别并拦截“API 繁忙”导致的空结果或错误结果存入缓存，大幅提升二次搜索速度。
- ☁️ 轻量后端代理：通过 Cloudflare Pages Functions 统一聚合，并对搜索关键词进行 **URL 签名剥离**，最大化缓存命中率。
- 🎨 主题美学：内置亮/暗模式与玻璃拟态界面。采用**前后端双重取色算法**：优先通过后端进行封面调色板分析，若失败则自动降级到前端 Canvas API 提取颜色，确保 100% 沉浸式背景覆盖。
- 📱 竖屏移动端：全新竖屏布局匹配移动端手势与屏幕比例。针对单手操作深度优化，支持双击 Logo 或点击设置按钮打开高级设置。
- 📝 动态歌词视图：逐行滚动高亮，当前行自动聚焦，手动滚动后锁定视图并支持 3 秒自动回位。
- ❤️ 收藏列表：搜索结果与播放列表均可一键收藏，收藏列表拥有独立的播放进度、播放模式与批量操作面板。
- 📻 队列管理灵活：新增、删除、清空操作即时生效，具备**状态自洽性校验**，防止播放列表为空时的“幽灵播放”现象，并自动持久化。
- 📥 多码率下载：可挑选 128K / 192K / 320K / FLAC 等品质并直接获取音频文件。
- 🔒 锁屏播放控制：锁屏界面自动显示专辑封面与播放控件，支持 MediaSession 标准。
- 🔄 列表导入导出：支持播放队列与收藏列表统一导入/导出，可一键迁移或恢复歌曲。
- 🛠️ 调试控制台：按下 **Ctrl + D** 呼出实时中文日志面板，支持监控核心中间件状态。

## 🚀 快速上手
支持多种部署方式，您可以根据自己的服务器环境选择最合适的一种：

- [🐳 Docker 一键部署 (适合私有服务器)](#-docker-一键部署-适合私有服务器)
- [✅ Cloudflare Pages 部署 (适合免服务器托管)](#-cloudflare-pages-部署-适合免服务器托管)

---

### 🐳 Docker 一键部署 (适合私有服务器)
无需下载和编译源码，只需在您的服务器上新建一个空白目录，创建 `docker-compose.yml` 文件，并复制填入以下内容：

```yaml
version: '3.8'

services:
  solara:
    image: ghcr.io/akudamatata/solara:latest
    container_name: solara
    restart: always
    ports:
      - "80:8787"
    environment:
      # 在这里配置你的 Solara 登录口令
      - PASSWORD=your_secure_password_here
    volumes:
      # 持久化存储 D1 数据库（收藏夹和播放数据）
      - ./data:/app/data
```

保存文件后，在同一目录下打开终端，依次执行以下两条命令：
```bash
docker compose pull
docker compose up -d
```
启动成功后，通过 `http://服务器IP:8787` 即可立即访问你的专属音乐播放器。

---

### ✅ Cloudflare Pages 部署 (适合免服务器托管)
如果您没有自己的服务器，可以直接使用 Cloudflare 免费部署：
1. Fork 或克隆本仓库到您自己的 GitHub 账号下。
2. 登录 Cloudflare 控制台，按照 Cloudflare Pages 文档创建站点，并将本仓库作为构建来源或直接上传静态资源。
3. 部署完成后，通过 Cloudflare Pages 分配的域名访问站点即可。

## ⚙️ 配置提示
- API 基地址定义在 functions/proxy.ts 中的第1行，可替换为自建接口域名。
- 默认主题、播放模式等偏好可在 `state` 初始化逻辑中按需调整。

### ☁️ Cloudflare D1 绑定与建表
1. 在 Cloudflare Dashboard 的 **Workers & Pages → D1 → Create** 中新建数据库，建议命名为 `solara-db`（名称可自定）。
2. 打开 Pages 项目设置，依次进入 **Settings → Functions → Bindings → Add binding → D1 Database**：
   - **Binding name** 填写 `DB`（必须与 `functions/api/storage.ts` 中的环境变量一致）。
   - **D1 Database** 选择上一步创建的数据库并保存。
3. 在数据库详情页切换到 **Query** 标签页，执行下方建表语句初始化两个独立的键值存储表（播放数据与收藏数据分离）：
   ```sql
   CREATE TABLE IF NOT EXISTS playback_store (
     key TEXT PRIMARY KEY,
     value TEXT,
     updated_at TEXT DEFAULT CURRENT_TIMESTAMP
   );

   CREATE TABLE IF NOT EXISTS favorites_store (
     key TEXT PRIMARY KEY,
     value TEXT,
     updated_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   ```
4. 重新部署或预览站点。前端会优先检测 D1 绑定：播放状态、播放列表等写入 `playback_store`，收藏相关写入 `favorites_store`；未绑定时自动退回浏览器 localStorage。

## 🧭 探索雷达
- 探索雷达会在「流行、摇滚、古典音乐、民谣、电子、爵士、说唱、乡村、蓝调、R&B、金属、嘻哈、轻音乐」等分类中随机挑选关键词，自动为播放列表补充新歌。
- 您可以**双击左上角 Logo** 或**点击侧边栏设置按钮**进入设置界面，自由勾选想要开启或排除的音乐分类，配置将实时保存并生效。

## 🔐 访问控制设置
- **Cloudflare Pages：** 在项目的 **Settings → Functions → Environment variables** 中新增名为 `PASSWORD` 的环境变量，值为希望设置的访问口令。
- 部署完成后，未登录的访问者会被自动重定向到 `/login` 页面并需输入该口令；若想关闭访问口令，删除该环境变量并重新部署即可。

## 🌐 多语言设置 (English Version)
- **Cloudflare Pages：** 在项目的 **Settings → Functions → Environment variables** 中新增名为 `LANGUAGE` 的环境变量，值为 `ENG`。
- 部署完成后，站点将会自动切换为全英文界面。若想恢复中文界面，删除该环境变量或修改为其他值后重新部署即可。

## 🎵 使用流程
1. 输入关键词并选择想要的曲库后发起搜索。
2. 在结果列表中可试听、播放、下载或加入播放队列。
3. 点击列表中的心形图标即可收藏歌曲，收藏列表支持快捷下载、添加至播放列表或批量清空。
4. 右侧播放/收藏列表展示当前曲目，可拖动播放、移除或一键清空。
5. 底部控制栏提供播放控制、播放模式切换、进度条与音量滑块。
6. 打开歌词面板即可查看实时滚动的高亮歌词。

## 📱 移动端体验提示
- 将网页添加到手机主屏或通过移动浏览器访问，即可自动切换至竖屏布局；
- 底栏控件重新排布，保证竖向滑动不遮挡核心信息；
- 点击封面可以切换到歌词面板，可通过点击展开/收起。

## ❓ 常见问题解答
- **搜索没有结果怎么办？** 检查浏览器控制台日志，如接口被阻挡可尝试切换数据源或更新 `API.baseUrl` 至可用服务，很有可能是免费API炸了。
- **如何重置本地数据？** 在浏览器开发者工具的 Application / Storage 面板清理 `localStorage`，即可恢复默认播放列表和配置。
- **收藏或播放列表如何备份？** 使用播放队列或收藏列表顶部的「导出」按钮生成 JSON 文件，日后可通过对应列表的「导入」按钮恢复，同时可一键将收藏歌曲添加回播放列表。

## 🛠️ 调试模式
按下键盘上的 **Ctrl + D** 即可呼出实时中文调试日志面板。该面板可帮助您监控播放器的核心运行状态，各项标签含义如下：

| 调试标签 | 状态/含义 | 说明 |
| :--- | :--- | :--- |
| **[边缘缓存]** | `HIT` (命中) | 请求直接从 Cloudflare 边缘节点缓存获取，速度极快。 |
| | `MISS` (穿透) | 缓存未命中，请求已转发至源服务器并存入缓存。 |
| | `BYPASS` (跳过) | 接口配置为不缓存，直接拉取实时数据。 |
| **[回源拉取]** | 接口详情 | 显示当前请求的具体 API 类型（如 `netease`, `kuwo` 等）。 |
| **[背景取色]** | `Backend` | 成功通过后端云函数完成封面调色板分析。 |
| | `Canvas` | 后端取色失败，自动降级至浏览器前端提取颜色。 |
| **[URL 签名]** | 剥离详情 | 显示对 API 请求中冗余签名的清理过程，以提高缓存命中率。 |


## 🗂️ 项目结构
```
Music-Player/
├── css/
│   ├── desktop.css   # 桌面端布局与组件样式
│   ├── mobile.css    # 移动端适配样式
│   └── style.css     # 公共主题与变量定义
├── functions/
│   ├── _middleware.ts # Cloudflare Pages Functions 中间件
│   ├── api/           # 各曲库代理函数入口
│   ├── lib/           # 请求封装与工具模块
│   ├── palette.ts     # 封面取色算法
│   └── proxy.ts       # 音频直链代理
├── js/
│   ├── index.js       # 播放器核心逻辑、状态管理与探索雷达分类
│   └── mobile.js      # 移动端交互与事件处理
├── favicon.png
├── favicon.svg
├── index.html         # 主界面结构、资源引入与配置项
├── login.html         # 访问控制登录页
└── README.md          # 项目说明
```

## 📄 许可证
本项目采用 CC BY-NC-SA 协议，禁止任何商业化行为，任何衍生项目必须保留本项目地址并以相同协议开源。
