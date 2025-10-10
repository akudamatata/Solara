# 🎶 Solara（光域）

> 🌐 由轻量后端服务支撑的现代化网页音乐播放器，整合多种音乐聚合接口，覆盖搜索、播放、歌词同步与音频下载全流程。

![Review-ezgif com-optimize](https://github.com/user-attachments/assets/487157de-bf71-4bc9-9e49-16a4f0a14472)
| | | |
|:--:|:--:|:--:|
| <img src="https://github.com/user-attachments/assets/54d1ed31-da1d-427f-ad11-66a26788c838" height="700"/> | <img src="https://github.com/user-attachments/assets/bb092569-0a7f-47f6-b7e9-c07ea56949cf" height="700"/> | <img src="https://github.com/user-attachments/assets/02b830e3-292f-4880-91f2-86ec818b877a" height="700"/> |


## 🤝 参与贡献
感谢 GD音乐台(music.gdstudio.xyz)提供的免费API

感谢 来自Linux.do 牛就是牛@ufoo 大佬 https://linux.do/t/topic/942415提供的灵感


## 🌟 主要特性

- 🔍 跨站曲库检索：一键切换数据源，支持分页浏览并批量导入播放队列。
- 📻 队列管理灵活：新增、删除、清空操作即时生效，并自动持久化到浏览器 localStorage。
- 🔁 丰富的播放模式：列表循环、单曲循环与随机播放随手切换，记忆上次偏好。
- 📱 竖屏移动端：全新竖屏布局匹配移动端手势与屏幕比例，按钮、列表与歌词均针对单手操作优化。
- 📝 动态歌词视图：逐行滚动高亮，当前行自动聚焦，手动滚动后短暂锁定视图。
- 📥 多码率下载：可挑选 128K / 192K / 320K / FLAC 等品质并直接获取音频文件。
- ☁️ 轻量后端代理：通过 Cloudflare Pages Functions 统一聚合各数据源并处理音频跨域，摆脱浏览器直接访问的限制。
- 🧭 Cloudflare 日志查询：访问 `/logs.html` 即可筛选、分页查看代理请求记录，辅助定位问题。
- 🎨 主题美学：内置亮/暗模式与玻璃拟态界面，桌面与移动端均具备沉浸体验。
- 📱 竖屏移动端：全新竖屏布局匹配移动端手势与屏幕比例，按钮、列表与歌词均针对单手操作优化。
- 🖼️ 沉浸式背景：根据当前曲目封面自动取色，实时渲染模糊背景，氛围与音乐保持一致。
- 🌊 青绿基调：参考 Emby 等播放器打造统一青绿色视觉体系。
- 🛠️ 调试控制台：按下 Ctrl + D 呼出实时日志面板，便于排查接口或交互异常。

## 🚀 快速上手
> ⚠️ 项目完全依赖 Cloudflare Pages Functions，目前仅支持部署到 Cloudflare Pages 环境运行。

1. 📦 克隆仓库
   ```bash
   git clone https://github.com/akudamatata/Music-Player.git
   cd Music-Player
   ```
2. ☁️ 按照 Cloudflare Pages 文档创建站点，并将本仓库作为构建来源或直接上传静态资源。
3. 🚀 部署完成后，通过 Cloudflare Pages 分配的域名访问站点即可体验播放器。

## ☁️ 后端部署
1. Fork 或克隆本仓库到你自己的 Cloudflare Pages 项目。

## ⚙️ 配置提示
- 🔗 API 基地址定义在 index.html 中的 `API.baseUrl`（约 1300 行），可替换为自建接口域名。
- 🎚️ 默认主题、播放模式等偏好可在 `state` 初始化逻辑中按需调整。

## 🎵 使用流程
1. 输入关键词并选择想要的曲库后发起搜索。
2. 在结果列表中可试听、播放、下载或加入播放队列。
3. 右侧播放列表展示当前队列，可拖动播放、移除或一键清空。
4. 底部控制栏提供播放控制、播放模式切换、进度条与音量滑块。
5. 打开歌词面板即可查看实时滚动的高亮歌词。

## 📱 移动端体验提示
- 将网页添加到手机主屏或通过移动浏览器访问，即可自动切换至竖屏布局；
- 底栏控件重新排布，保证竖向滑动不遮挡核心信息；
- 歌词面板默认贴合屏幕底部，可通过手势展开/收起。

## ☁️ 配置 D1 日志数据库
`/logs.html` 页面依赖 Cloudflare D1 数据库读取代理日志，请按照以下步骤在 Cloudflare Pages 中完成绑定：

1. 在 Cloudflare Dashboard 中进入 **Pages → 站点 → Settings → Functions → D1 Databases**。
2. 点击 **Add binding**，在弹窗中：
   - **Binding name** 填写 `SOLARA_DB`（需与代码中的 `env.SOLARA_DB` 一致）。
   - **Database** 下拉选择已经创建好的 `solara` 数据库。
   - ⚠️ **不要** 在 Environment Variables 区域手动新增一个名为 `SOLARA_DB` 的字符串变量，那样函数仍然无法获得数据库实例。
3. 在弹窗底部选择需要应用的环境（建议同时勾选 **Production** 与 **Preview**），保存后触发一次新的部署。
4. 部署完成后，函数会自动注入该数据库连接，无需额外环境变量。访问 `/logs.html` 即可加载日志。

> 如果在绑定后仍看到 `{"error":"D1 database binding SOLARA_DB is not configured."}`，请确认本次部署的环境（Production 或 Preview）均已经勾选绑定，并等待新部署完成后再访问。

> 若需本地验证，可使用 `wrangler pages dev --d1 SOLARA_DB=solara` 将同名数据库绑定到本地调试环境。

## ❓ 常见问题解答
- **搜索没有结果怎么办？** 检查浏览器控制台日志，如接口被阻挡可尝试切换数据源或更新 `API.baseUrl` 至可用服务。
- **如何重置本地数据？** 在浏览器开发者工具的 Application / Storage 面板清理 `localStorage`，即可恢复默认播放列表和配置。

## 🗂️ 项目结构
```
Music-Player/
├── functions/   # Cloudflare Pages Functions 后端代理
├── index.html   # 主界面、样式与业务逻辑
└── README.md    # 项目说明
```

## 📄 许可证
本项目采用 CC BY-NC-SA 协议，禁止任何商业化行为，任何衍生项目必须保留本项目地址并以相同协议开源。
