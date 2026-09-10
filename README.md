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

- 🔍 **跨站曲库检索与无感记忆**：一键切换数据源（网易云/QQ/酷狗等），切换平台不再误触发自动请求；自动记忆检索关键词与最近搜索结果，重焦即刻恢复；支持分页浏览与批量导入播放队列。
- 🧭 **官方榜单音乐雷达**：重构为动态轮询网易云三大官方榜单（**热歌榜、飙升榜、新歌榜**）Top 20，并执行实时智能去重与随机注入，兼顾爆款流行与新鲜探索。
- 📻 **工业级播放器状态机**：
  - **防 API 连删风暴**：快速连删歌曲时引入防抖与 `AbortController` 请求熔断，只更新待播指针，杜绝并发请求压垮接口；
  - **杜绝幽灵播放**：清空列表或删完曲目时严格销毁音频实例并归零状态；
  - **就绪待播缓冲**：删除正在播放的单曲时立即停音并就绪下一首，绝不突兀爆音自动出声；
  - **精准单曲高亮**：严格的一致性状态比对，彻底根除多曲同时标记播放的 Bug。
- 🎨 **Apple Design 流体极光美学**：内置亮/暗模式与玻璃拟态界面。采用**前后端双重取色算法**（后端调色板分析 + 前端 Canvas 智能降级），全域无缝消除原生滚动条；重构登录界面，与主站流体极光和磨砂玻璃 100% 视觉对齐。
- 📱 **移动端深层性能优化**：精炼毛玻璃模糊管线，消除 iPhone Safari 多层 `backdrop-filter` 导致的电池发热与掉帧伪影；集成 `visualViewport` 自适应，彻底解决软键盘弹出时搜索面板挤压变形。
- 🚀 **智能边缘缓存**：基于 Cloudflare Cache API 实现。具备**智能过滤机制**，仅缓存有效搜索结果，自动识别并拦截“API 繁忙”导致的空结果或错误结果存入缓存，大幅提升二次搜索速度。
- ☁️ **轻量后端代理 & D1 跨端漫游**：通过 Cloudflare Pages Functions 统一聚合；原生支持 Cloudflare D1 分布式数据库，PC 端与移动端歌单、收藏夹实时漫游同步。
- 📝 **动态歌词视图**：逐行平滑滚动高亮，当前行自动聚焦，手动滚动后锁定视图并支持 3 秒自动回位。
- ❤️ **收藏列表独立管理**：搜索结果与播放列表均可一键收藏，收藏列表拥有独立的播放进度、播放模式与批量操作面板。
- 📥 **多码率自由切换**：支持 128K / 192K / 320K / FLAC 无损等高音质切换并直接获取音频。
- 🔒 **全平台锁屏控制**：锁屏界面自动同步高分辨率专辑封面与曲目信息，完美支持 MediaSession 标准。
- 🔄 **列表导入导出**：支持播放队列与收藏列表统一导入/导出，可一键迁移或恢复歌曲。
- 🛠️ **全功能调试悬浮窗**：支持桌面/移动端自由拖拽、一键/双击折叠为 38px 胶囊横条，全链路生命周期彩标药丸日志输出。

## 🚀 快速上手
支持多种部署方式，您可以根据自己的服务器环境选择最合适的一种：

- [🐳 Docker 一键部署 (适合私有服务器)](#-docker-一键部署-适合私有服务器)
- [✅ Cloudflare Pages 部署 (适合免服务器托管)](#-cloudflare-pages-部署-适合免服务器托管)

---

### 🐳 Docker 一键部署 (适合私有服务器)
无需下载和编译源码，只需在您的服务器上新建一个空白目录，创建 `docker-compose.yml` 文件，并配置相应的端口映射（默认推荐宿主机端口为 `8080`，可根据需要自行修改，配合 Nginx 等反向代理或直接外网访问）：

> [!NOTE]
> **Docker 版高性能优化**：
> 本镜像已切换为 **Express + Wrangler 混合双引擎架构**，由 Express 前台代理高频数据读写与音频流式管道传输（支持切歌时连接立即自动中止释放，防 Socket 泄漏），由后台 Wrangler 专职负责微量 API 代理（利用 BoringSSL 指纹完美绕过 Cloudflare 验证），从而兼顾极佳的性能、稳定性与 CF 验证通过率。

```yaml
services:
  solara:
    image: ghcr.io/akudamatata/solara:latest
    container_name: solara
    restart: always
    init: true # 解决容器停止时 Node/Wrangler 进程无法优雅响应 SIGTERM 导致卡顿的问题
    ports:
      - "8080:8787" # 宿主机端口:容器内端口（可将 8080 修改为其他未占用的宿主机端口）
    environment:
      # 在这里配置你的 Solara 登录口令
      - PASSWORD=your_secure_password_here
      # 音乐聚合 API 地址（当默认 API 被 Cloudflare 屏蔽/Challenge 时，可更换为备用地址）
      - API_BASE_URL=https://music-api.gdstudio.xyz/api.php
      # 界面语言（默认中文，填 ENG 切换为英文）
      # - language=ENG
    volumes:
      # 持久化 SQLite 数据库（收藏夹和播放记录）
      - ./data:/data
```

---

保存文件后，在同一目录下打开终端，依次执行以下两条命令：
```bash
docker compose pull
docker compose up -d
```

---

### ✅ Cloudflare Pages 部署 (适合免服务器托管)
如果您没有自己的服务器，可以直接使用 Cloudflare 免费部署：
1. Fork 或克隆本仓库到您自己的 GitHub 账号下。
2. 登录 Cloudflare 控制台，按照 Cloudflare Pages 文档创建站点，并将本仓库作为构建来源或直接上传静态资源。
3. 部署完成后，通过 Cloudflare Pages 分配的域名访问站点即可。

## ⚙️ 配置提示
- API 基地址定义在 `functions/proxy.ts` 中，可替换为自建接口域名。
- 默认主题、播放模式等偏好可在 `js/state.js` 初始化逻辑中按需调整。

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

## 🧭 音乐雷达 (Official Top Charts Radar)
- **权威官方榜单联动**：雷达每次触发时，会自动从网易云官方三大顶尖榜单——**热歌榜**（3778678）、**新歌榜**（3779629）、**飙升榜**（19723756）中轮询抽取并解析前 20 首曲目。
- **智能去重与随机注入**：自动过滤当前播放列表中已存在的歌曲，经随机乱序后无缝加入队列，让每一次雷达探索既能听到当下最火热的高品质音乐，又能发现宝藏冷门新歌。

## 🔐 访问控制设置
- **Cloudflare Pages：** 在项目的 **Settings → Functions → Environment variables** 中新增名为 `PASSWORD` 的环境变量，值为希望设置的访问口令。
- **Docker 部署：** 在 `docker-compose.yml` 的 `environment` 中设置 `PASSWORD` 环境变量，例如 `- PASSWORD=your_password`。如果不需要密码，可不配置该变量。
- 部署完成后，未登录的访问者会被自动重定向到 `/login` 页面并需输入该口令；若想关闭访问口令，删除该环境变量并重新部署或重启容器即可。

## 🌐 多语言设置 (English Version)
- **Cloudflare Pages：** 在项目的 **Settings → Functions → Environment variables** 中新增名为 `LANGUAGE` 的环境变量，值为 `ENG`。
- **Docker 部署：** 在 `docker-compose.yml` 的 `environment` 中设置 `language` 环境变量为 `ENG`，即 `- language=ENG`（注意：Docker 环境下环境变量名是小写 `language`，以与 wrangler 本地开发环境一致）。
- 部署完成后，站点将会自动切换为全英文界面。若想恢复中文界面，删除该环境变量或修改为其他值后重新部署或重启容器即可。

## 🎵 使用流程
1. 输入关键词并选择想要的曲库后发起搜索（切换曲库不自动清空和刷新）。
2. 在结果列表中可试听、播放、下载或加入播放队列。
3. 点击列表中的心形图标即可收藏歌曲，收藏列表支持快捷下载、添加至播放列表或批量清空。
4. 右侧播放/收藏列表展示当前曲目，可拖动播放、移除或一键清空（连删均有安全防抖保护）。
5. 底部控制栏提供播放控制、播放模式切换、进度条与音量滑块。
6. 打开歌词面板即可查看实时滚动的高亮歌词。

## 📱 移动端体验提示
- 将网页添加到手机主屏（PWA 体验）或通过移动浏览器访问，自动切换至竖屏极简布局；
- 底栏控件重新排布，保证竖向滑动不遮挡核心信息；
- 虚拟键盘唤起时自适应视口高度，保证搜索面板操作不被遮挡；
- 点击封面可切换到沉浸式歌词面板，支持丝滑手势展开/收起。

## ❓ 常见问题解答
- **搜索没有结果怎么办？** 检查浏览器控制台日志，如接口被阻挡可尝试切换数据源或更新 `API.baseUrl` 至可用服务，很有可能是免费 API 临时波动。
- **如何重置本地数据？** 在浏览器开发者工具的 Application / Storage 面板清理 `localStorage`，即可恢复默认播放列表和配置。
- **收藏或播放列表如何备份？** 使用播放队列或收藏列表顶部的「导出」按钮生成 JSON 文件，日后可通过对应列表的「导入」按钮恢复，同时可一键将收藏歌曲添加回播放列表。

## 🛠️ 调试控制台 (Debug Console)
* **呼出方式**：PC 端按下快捷键 **Ctrl + D**；移动端可在「设置」面板中一键开启。
* **自由拖拽**：按住控制台顶部标题栏可自由拖拽至屏幕任意角落，具备可视窗口边缘碰撞保护，防止拖出屏幕。
* **胶囊横条折叠**：点击右上角折叠按钮（`－` / `＋`）或**双击标题栏**，面板即刻平滑收缩为 38px 高度的单行胶囊横条，不遮挡界面，且在折叠状态下依然支持拖动停靠。
* **全链路彩标药丸日志**：

| 日志徽标 | 监控范围 | 核心记录指标 |
| :--- | :--- | :--- |
| `[音频播放]` | 播放核心 | 切歌事件、码率音质选择（128k/320k/999k）、音频直链/代理耗时、解码就绪与异常重试 |
| `[歌曲搜索]` | 检索链路 | 发起搜索、音源平台、请求关键词、分页页码、API 返回曲目数量与缓存状态 |
| `[音乐雷达]` | 榜单抓取 | 官方榜单名称/ID、抓取 Top 20 进度、智能去重增量曲目数 |
| `[歌词解析]` | 歌词引擎 | 歌词请求 URL、成功解析有效行数统计、暂无歌词/错误降级 |
| `[极光背景]` | 视觉渲染 | 封面图片地址、本地色盘缓存命中、内存复用、云端后端/前端 Canvas 取色 |
| `[播放列表]` | 队列状态 | 单曲增删（实时剩余数追踪）、列表清空、收藏增删、循环播放模式切换 |
| `[异常错误]` | 容灾防线 | 网络断开、API 鉴权失败、音频上下文被阻断拦截警告 |

---

## 🗂️ 项目结构 (现代化模块解耦架构)
```
Music-Player/
├── css/
│   ├── tokens/
│   │   └── theme.css          # 设计系统色彩、阴影、间距与全局变量 Token
│   ├── components/
│   │   ├── controls.css       # 播放器底栏、控制台悬浮窗（拖拽/折叠）样式
│   │   ├── modals.css         # 弹窗、HUD 提示与设置面板样式
│   │   ├── player-stage.css   # 主播放舞台、封面与专辑旋转动效
│   │   └── search.css         # 搜索面板、音源下拉菜单与结果列表
│   ├── layout/
│   │   ├── base.css           # 全域基础排版与无滚动条沉浸式样式
│   │   └── stage.css          # 页面主体栅格与响应式布局
│   └── mobile/                # 移动端专用设计规范与底部抽屉样式
│       ├── base.css / controls.css / modals.css / search.css / sheet.css / stage.css
├── js/
│   ├── app.js                 # 主应用调度中心，负责模块装配与事件聚合
│   ├── state.js               # 全局响应式状态机
│   ├── constants.js           # 系统常量与官方榜单配置
│   ├── dom.js                 # DOM 元素缓存池
│   ├── core/                  # 核心基础设施层
│   │   ├── audio.js           # 播放器底层状态机、防抖与请求熔断器
│   │   ├── quality.js         # 音质码率协商与流地址解析
│   │   ├── storage.js         # 本地持久化与 Cloudflare D1 漫游驱动
│   │   └── media-session.js   # 全平台锁屏控制器与元数据同步
│   ├── features/              # 业务特性层
│   │   ├── search.js          # 搜索引擎、结果缓存与防抖
│   │   ├── playlist.js        # 播放队列管理（防幽灵播放、删歌指针重定位）
│   │   ├── favorites.js       # 收藏夹独立管理与持久化
│   │   ├── lyrics.js          # 动态歌词解析与高亮滚动引擎
│   │   └── settings.js        # 个性化设置与参数配置
│   ├── visual/                # 视觉与动效层
│   │   ├── aurora.js          # 流体极光色彩渲染器与 GPU 降负载优化
│   │   ├── palette.js         # 智能双通道封面取色算法
│   │   └── spotlight.js       # 调试控制台（支持自由拖拽、胶囊折叠、彩色日志）
│   └── mobile/                # 移动端手势与抽屉交互
│       ├── gestures.js / sheet.js / stage.js / search.js / toolbar.js
├── functions/                 # Cloudflare Pages Functions 边缘服务
│   ├── _middleware.ts         # 统一认证与路由中间件
│   ├── api/                   # 各曲库代理入口与 D1 存储路由
│   ├── palette.ts             # 边缘端封面取色分析
│   └── proxy.ts               # 音频流直链签名剥离与流式代理
├── server/                    # Docker 混合引擎宿主（Express + SQLite）
│   ├── routes/                # 代理路由与取色分析
│   ├── index.js               # Express 服务入口
│   └── db.js                  # 高性能 SQLite 数据库驱动 (WAL 模式)
├── index.html                 # 播放器主应用入口
├── login.html                 # Apple Design 风格登录页
├── Dockerfile                 # 容器构建配置
└── README.md                  # 项目文档
```

## 📄 许可证
本项目采用 CC BY-NC-SA 协议，禁止任何商业化行为，任何衍生项目必须保留本项目地址并以相同协议开源。
