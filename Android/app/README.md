# YMusicPlayer Android

这是 YMusicPlayer 的独立 Android 客户端工程骨架，位于仓库根目录 `Android/app`，不会影响现有 Electron 桌面端。

## 当前状态

当前已完成 React Native Android 工程骨架和移动端页面占位：

- 曲库
- 发现
- 下载
- 我的/设置

并建立了后续开发需要的基础目录：

```text
src/
  components/     # 通用 UI 组件
  data/           # 临时占位数据
  models/         # Track、Playlist、DownloadTask、Discover、Settings 等模型
  navigation/     # 底部 Tab 定义
  screens/        # 移动端页面
  theme/          # 明暗主题配色
  utils/          # 工具函数
```

## 环境说明

本工程由 React Native CLI 生成。当前生成版本要求 Node 版本满足 `package.json` 中的 `engines.node`。

本机当前已确认：

- Java 17 可用
- 当前 shell 未配置 `ANDROID_HOME`
- 当前 shell 未提供全局 `gradle` 命令

后续要真正运行或打包 APK，需要补齐 Android SDK 环境，并配置 `ANDROID_HOME` / `ANDROID_SDK_ROOT`。

## 常用命令

在本目录下执行：

```bash
npm run start
npm run android
npm run lint
npm run test
```

运行 Android 前需要：

1. 安装 Android Studio 或 Android SDK Command-line Tools。
2. 配置 Android SDK。
3. 启动模拟器或连接真机。
4. 确认 `adb devices` 能看到设备。

## 开发路线

详细需求与计划见上一级目录：

- `../requirements.md`
- `../development-plan.md`

首批建议继续开发：

1. 本地曲库 MediaStore 权限与扫描。
2. Media3 / ExoPlayer 播放服务。
3. 后台播放与通知栏控制。
4. 歌单与收藏。
5. 云音乐配置和搜索。
