# Niko Niko 超慢跑 PWA

一个极简风格、专为超慢跑（Niko Niko Running）设计的 Web 应用。针对 iOS 进行了优化。

## 核心功能
- **180 BPM 节拍器**：利用 Web Audio API 提供精准的步频提示。
- **iOS 后台防锁屏**：使用静音音频循环（Silent Audio Loop）技术，防止 iOS 锁屏后挂起应用。
- **屏幕常亮**：调用 Wake Lock API，确保运动时屏幕不熄灭。
- **离线可用**：完整的 PWA 支持，可安装到主屏幕，无网也能用。
- **隐私优先**：所有数据仅保留在本地，无追踪。

## 部署指南 (GitHub + Vercel)

1. **推送到 GitHub**：
   - 在当前目录初始化 Git 仓库：
     ```bash
     git init
     git add .
     git commit -m "Initial commit"
     ```
   - 在 GitHub 上创建一个新仓库，并推送代码：
     ```bash
     git remote add origin https://github.com/你的用户名/niko-runner.git
     git pushed -u origin main
     ```

2. **部署到 Vercel**：
   - 访问 [Vercel 控制台](https://vercel.com/dashboard)。
   - 点击 **"Add New..."** > **"Project"**。
   - 导入你的 `niko-runner` 仓库。
   - Framework Preset 选 **Other**。
   - Build Command 留空。
   - Output Directory 留空（或填 `.`）。
   - 点击 **Deploy**。

## 图标设置
为了获得最佳体验，请在部署前将 `icon-192.png` 和 `icon-512.png` 替换为你自己喜欢的图标文件。

## 开源协议
MIT
