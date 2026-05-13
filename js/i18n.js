(function () {
    const translations = {
        // common
        "网易云音乐": "Netease Music",
        "酷我音乐": "Kuwo Music",
        "JOOX音乐": "JOOX Music",
        "哔哩哔哩": "Bilibili",
        "极高音质": "High Quality",
        "标准音质": "Standard Quality",
        "高品音质": "High Quality",
        "无损音质": "Lossless",
        "歌词将在此处同步显示": "Lyrics will be displayed here synchronously",
        "Made by Wet Dream Boy，免费API来自GD音乐台(music.gdstudio.xyz)，仅供学习交流使用，请支持正版音乐奥！": "Made by Wet Dream Boy. Free API from GD Music (music.gdstudio.xyz). For educational purposes only, please support official releases!",

        // index.html
        "探索雷达": "Explore Radar",
        "打开搜索": "Open Search",
        "切换深浅色模式": "Toggle Theme",
        "关闭搜索": "Close Search",
        "搜索歌曲、歌手或专辑...": "Search songs, artists or albums...",
        "搜索": "Search",
        "导入已选": "Import Selected",
        "导入到播放列表": "Import to Playlist",
        "导入到收藏列表": "Import to Favorites",
        "轻触返回封面": "Tap to return to cover",
        "选择一首歌曲开始播放": "Select a song to start playing",
        "未知艺术家": "Unknown Artist",
        "收藏当前歌曲": "Favorite current song",
        "播放列表": "Playlist",
        "收藏列表": "Favorites",
        "播放列表操作": "Playlist Actions",
        "导入播放列表": "Import Playlist",
        "导出播放列表": "Export Playlist",
        "清空播放列表": "Clear Playlist",
        "收藏列表操作": "Favorites Actions",
        "全部添加到播放列表": "Add all to Playlist",
        "导入收藏列表": "Import Favorites",
        "导出收藏列表": "Export Favorites",
        "清空收藏列表": "Clear Favorites",
        "收起播放面板": "Collapse Panel",
        "播放模式": "Play Mode",
        "上一曲": "Previous",
        "播放 / 暂停": "Play / Pause",
        "下一曲": "Next",
        "打开播放列表": "Open Playlist",
        "随机播放": "Shuffle",
        "切换随机播放": "Toggle Shuffle",
        "聚合所有雷达，探索新音乐": "Aggregate radars, explore new music",

        // login.html
        "登录 - Solara": "Login - Solara",
        "访问受到保护": "Access Protected",
        "访问口令": "Access Token",
        "请输入密码": "Enter password",
        "只有输入了正确口令的成员才能继续访问内容。": "Only members with the correct token can access the content.",
        "进入 Solara": "Enter Solara",
        "安全状态：受保护": "Security Status: Protected",
        "密码错误，请重试": "Incorrect password, please try again",
        "登录出错，请稍后再试": "Login error, please try again later",

        // js dynamic strings
        "未知歌曲": "Unknown Song",
        "未知专辑": "Unknown Album",
        "单曲循环": "Single Loop",
        "列表循环": "List Loop",
        "已添加到播放列表": "Added to Playlist",
        "已添加到收藏": "Added to Favorites",
        "已从收藏移除": "Removed from Favorites",
        "获取歌词失败": "Failed to get lyrics",
        "暂无歌词": "No lyrics available",
        "纯音乐，请欣赏": "Instrumental music, enjoy",
        "获取播放列表失败": "Failed to get playlist",
        "网络错误，请稍后重试": "Network error, please try again later",
        "播放列表已清空": "Playlist cleared",
        "收藏列表已清空": "Favorites cleared",
        "不支持导入此格式的播放列表": "Unsupported playlist format",
        "解析播放列表文件失败": "Failed to parse playlist file",
        "导入成功": "Import successful",
        "导出成功": "Export successful",
        "复制失败": "Copy failed",
        "设置": "Settings",
        "探索雷达风格": "Radar Styles",
        "保存设置": "Save Settings",
        "已保存设置": "Settings saved",
        "请至少选择一个风格": "Please select at least one genre",
        "云端加载设置失败": "Failed to load settings from cloud"
    };

    window.t = function (str) {
        if (window.SITE_LANGUAGE !== 'ENG') return str;
        return translations[str] || str;
    };

    if (window.SITE_LANGUAGE === 'ENG') {
        document.documentElement.lang = 'en';
        const translateNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.nodeValue.trim();
                if (text && window.t(text) !== text) {
                    node.nodeValue = node.nodeValue.replace(text, window.t(text));
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;

                const placeholders = ['placeholder', 'title', 'aria-label'];
                placeholders.forEach(attr => {
                    if (node.hasAttribute(attr)) {
                        const val = node.getAttribute(attr);
                        if (val && window.t(val) !== val) {
                            node.setAttribute(attr, window.t(val));
                        }
                    }
                });
                
                if (node.tagName === 'TITLE') {
                    const titleText = node.textContent.trim();
                    if (titleText && window.t(titleText) !== titleText) {
                        node.textContent = window.t(titleText);
                    }
                }
                
                node.childNodes.forEach(translateNode);
            }
        };

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(translateNode);
                } else if (mutation.type === 'characterData') {
                    const text = mutation.target.nodeValue.trim();
                    if (text && window.t(text) !== text) {
                        observer.disconnect();
                        mutation.target.nodeValue = mutation.target.nodeValue.replace(text, window.t(text));
                        observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
                    }
                }
            });
        });

        const initTranslation = () => {
            translateNode(document.documentElement);
            observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initTranslation);
        } else {
            initTranslation();
        }
    }
})();
