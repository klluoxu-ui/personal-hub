# personal-hub

旭的个人工作台：天文摄影笔记、排班与现场备忘、游戏进度、健身提醒。

本地目录：`H:\personal-hub`  
远程仓库：[github.com/klluoxu-ui/personal-hub](https://github.com/klluoxu-ui/personal-hub)

手机用 Cursor Cloud Agents 时，把这个仓库加为 Workspace。

## 手机异地打开（推荐）

不在同一 WiFi、电脑没开机时，用 GitHub Pages 公网地址访问。

部署后地址：

**https://klluoxu-ui.github.io/personal-hub/**

### 一次性开通（在 GitHub 网页操作）

1. 打开仓库 Settings → Pages  
2. Build and deployment → Source 选 **GitHub Actions**  
3. 若仓库是 **Private**：免费账号无法对外发布 Pages，需要任选其一  
   - 把仓库改成 **Public**（页面代码公开，你的笔记数据仍只存在手机浏览器本地，不会上传到 GitHub）  
   - 或开通 GitHub Pro  
4. 合并带 Pages 工作流的 PR 到 `main`，或在 Actions 里手动跑 **Deploy GitHub Pages**  
5. 等 Actions 变绿后，手机浏览器打开上面的地址  
6. Safari / Chrome 可「添加到主屏幕」，当普通 App 用

数据仍保存在当前浏览器；换手机或清缓存会丢，记得用首页的导出备份。

## 同一 WiFi 本地打开

电脑和手机在同一局域网时：

```powershell
cd H:\personal-hub
py -3 -m http.server 4173
```

- 本机浏览器：http://127.0.0.1:4173  
- 手机：把 `127.0.0.1` 换成电脑的局域网 IP，例如 `http://192.168.1.8:4173`
