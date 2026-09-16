# personal-hub

旭的个人工作台：天文摄影笔记、排班与现场备忘、游戏进度、健身提醒。

本地目录：`H:\personal-hub`  
远程仓库：[github.com/klluoxu-ui/personal-hub](https://github.com/klluoxu-ui/personal-hub)

手机用 Cursor Cloud Agents 时，把这个仓库加为 Workspace。

## 手机异地打开（推荐）

不在同一 WiFi、电脑没开机时，用 GitHub Pages 公网地址访问。

部署后地址：

**https://klluoxu-ui.github.io/personal-hub/**

### 一次性开通（现在只用手机）

GitHub App 里没有仓库 Settings。请用 Safari / Chrome 打开网页，并切成**桌面版网站**。

部署工作流已经合进 `main`。免费账号要对外发布 Pages，仓库必须是 **Public**（公开的是页面代码；排班/备忘仍只在你手机浏览器里）。

1. 打开：https://github.com/klluoxu-ui/personal-hub/settings  
2. 拉到最底部 **Danger Zone** → **Change repository visibility** → **Make public**  
3. 按提示输入 `klluoxu-ui/personal-hub` 确认  
4. 打开：https://github.com/klluoxu-ui/personal-hub/actions  
5. 点 **Deploy GitHub Pages** → 最新一次运行右侧 **Re-run jobs**（或等下一次自动部署）  
6. 变绿后打开：**https://klluoxu-ui.github.io/personal-hub/**  
7. Safari / Chrome 可「添加到主屏幕」，当普通 App 用

工作流会自动把 Pages 的 Source 设为 GitHub Actions，不用再进 Pages 设置。

数据仍保存在当前浏览器；换手机或清缓存会丢，记得用首页的导出备份。

## 同一 WiFi 本地打开

电脑和手机在同一局域网时：

```powershell
cd H:\personal-hub
py -3 -m http.server 4173
```

- 本机浏览器：http://127.0.0.1:4173  
- 手机：把 `127.0.0.1` 换成电脑的局域网 IP，例如 `http://192.168.1.8:4173`
