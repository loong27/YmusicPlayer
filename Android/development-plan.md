# YMusicPlayer Android 版开发计划文档

## 1. 开发原则

### 1.1 保留桌面端结构

当前 Electron 桌面端项目保持不变，不把 Android 代码混入现有 `electron/` 或 `src/` 目录。

Android 相关内容统一放在根目录：

```text
Android/
  requirements.md
  development-plan.md
  app/                 # 后续 Android 应用工程
  shared/              # 后续可选：跨端共享逻辑
```

当前阶段先写文档，不立即创建完整 Android 工程。

### 1.2 不直接打包 Electron 到 APK

不采用“Electron/Web 项目强行套壳 APK”的方案。

原因：

- Electron 主进程、IPC、Node 文件系统能力不能直接在 Android 使用。
- Android 音乐播放器需要系统级能力：后台播放、通知栏、媒体会话、权限、下载服务。
- 当前桌面 UI 是侧边栏布局，不适合直接响应式改成移动端。

### 1.3 复用业务逻辑，重做移动端外壳

长期目标是：

- 桌面端继续使用 Electron + React。
- Android 端单独实现移动端 App。
- 可复用部分逐步抽象为共享逻辑：
  - 云音乐 API 请求结构。
  - 歌曲数据模型。
  - AI 推荐请求/响应结构。
  - 歌词解析。
  - 下载任务模型。
  - 工具函数。

## 2. 技术路线建议

### 2.1 推荐路线：React Native Android

建议 Android 版采用 React Native。

理由：

- 与当前 React 技术栈接近。
- UI 需要移动端重做，React Native 更适合原生移动体验。
- 可以接入 Android 原生播放服务、通知栏、MediaSession、下载服务。
- 长期维护比 WebView 套壳更可靠。

关键原生能力：

- 播放：AndroidX Media3 / ExoPlayer。
- 后台播放：Foreground Service + MediaSession。
- 数据库：Room 或 SQLite 封装。
- 设置：DataStore。
- 敏感信息：Android Keystore / EncryptedSharedPreferences。
- 下载：Foreground Service 或 WorkManager。

### 2.2 备选路线：Capacitor

Capacitor 可作为快速验证 APK 的路线，但不作为长期优先方案。

优点：

- 可复用更多 React UI。
- 初期上手快。

缺点：

- 本地音乐扫描、后台播放、通知栏控制、下载服务仍需要原生插件。
- 当前桌面 UI 仍然需要大改。
- 音乐播放器系统级体验不如 React Native/原生路线。

### 2.3 不推荐路线

不推荐：

- 直接把 Vite/Electron 页面塞进 WebView 打包。
- 在当前 Electron 项目里硬改响应式来兼容手机。
- 为了移动端修改现有桌面端结构。

## 3. 当前桌面功能拆分与迁移策略

### 3.1 可直接复用或改造复用的逻辑

#### 歌词解析

当前 `src/App.jsx` 中的 LRC 解析逻辑可以抽出：

- 输入：原始歌词文本。
- 输出：按时间排序的歌词行。
- 能力：支持一行多个时间戳。

Android 端可迁移为 TypeScript 工具函数。

#### 云音乐数据模型

当前涉及：

- provider：`qqmusic`、`netease`、`kugou`
- quality：`MP3_128`、`MP3_320`、`FLAC`、`ATMOS`、`ATMOS2`
- remote track 标准化字段。

Android 端应复用同一套模型定义。

#### AI 推荐协议

当前 AI 推荐约束明确：

- 只输出云端可搜索候选。
- 不输出本地路径。
- 不输出本地 trackId。
- 不输出云端 ID、URL、下载链接。

Android 端应沿用该协议。

#### 下载任务模型

当前下载任务状态机可复用：

```text
queued -> downloading -> paused
queued -> downloading -> completed
queued -> downloading -> failed
queued/downloading/paused -> canceled
```

Android 端实现方式不同，但状态模型可以沿用。

### 3.2 需要 Android 原生重做的能力

#### 本地文件扫描

桌面端使用 Node `fs` 递归扫描。

Android 端需要重做：

- MediaStore 扫描。
- SAF 目录授权扫描。
- 权限申请。
- 文件 URI 与真实路径兼容。

#### 播放系统

桌面端使用 HTMLAudioElement。

Android 端需要重做：

- ExoPlayer / Media3。
- MediaSession。
- 通知栏控制。
- 后台服务。
- 音频焦点。

#### 下载系统

桌面端使用 Node 网络请求和文件流。

Android 端需要重做：

- Foreground Service / WorkManager。
- Android 文件写入。
- 下载通知。
- 中断恢复。

#### 桌面歌词窗口

桌面端使用透明 BrowserWindow。

Android 端不能直接复用。

初版不做悬浮歌词，后续根据需求再做 Android 悬浮窗。

## 4. Android 目录规划

后续建议结构：

```text
Android/
  requirements.md
  development-plan.md
  README.md
  app/
    package.json
    android/
    src/
      app/
      screens/
      components/
      services/
      repositories/
      models/
      utils/
      theme/
  shared/
    models/
    lyrics/
    cloud/
    ai/
    download/
```

说明：

- `app/`：Android 移动端应用。
- `shared/`：后续抽取共享逻辑时使用，初期可以不创建。
- 桌面端暂时不依赖 `Android/shared`，避免影响现有构建。

## 5. 开发阶段计划

## 阶段 0：需求确认与工程准备

目标：确定 Android 版边界与首版范围。

任务：

1. 完成需求细节文档。
2. 完成开发计划文档。
3. 确定技术栈：React Native 或其他。
4. 确定包名、应用名、最低 Android 版本。
5. 确定是否首版支持云音乐和下载。
6. 确定是否首版支持 AI 发现。

建议决策：

- 应用名：YMusicPlayer。
- 包名：`com.eric.ymusicplayer` 或新包名。
- minSdk：建议 26 或更高。
- targetSdk：跟随当前 Android 最新稳定要求。
- 首版先做本地播放、通知栏、曲库、歌单、基础云搜索下载。
- AI 发现放到第二阶段。

交付物：

- `Android/requirements.md`
- `Android/development-plan.md`

## 阶段 1：创建 Android 工程骨架

目标：创建可运行的 Android 应用工程。

任务：

1. 在 `Android/app/` 创建 React Native 项目。
2. 配置 TypeScript。
3. 配置 Android 包名、应用图标、应用名称。
4. 配置基础主题：亮色/暗色。
5. 搭建底部 Tab 导航。
6. 创建基础页面：
   - 曲库页。
   - 发现页占位。
   - 下载页占位。
   - 我的/设置页。
7. 建立基础模型目录：
   - `models/Track.ts`
   - `models/Playlist.ts`
   - `models/DownloadTask.ts`
   - `models/CloudTrack.ts`
   - `models/Discover.ts`

验收标准：

- Android 工程可安装运行。
- 亮色/暗色主题切换正常。
- 底部 Tab 可切换。
- 页面没有桌面端侧边栏痕迹。

## 阶段 2：本地曲库与数据存储

目标：实现 Android 本地曲库基础能力。

任务：

1. 设计本地数据库。
2. 实现歌曲表、歌单表、歌单歌曲关联表。
3. 实现设置存储。
4. 实现媒体权限申请。
5. 实现 MediaStore 扫描音频。
6. 读取歌曲基本字段：标题、歌手、专辑、时长、URI。
7. 实现曲库列表。
8. 实现搜索本地歌曲。
9. 实现收藏和 `我喜欢` 歌单。
10. 实现自建歌单 CRUD。

验收标准：

- 用户授权后可读取本机音乐。
- 曲库页展示歌曲列表。
- 可搜索歌曲。
- 可喜欢/取消喜欢。
- 可创建歌单并添加歌曲。
- App 重启后数据不丢失。

## 阶段 3：播放核心与后台播放

目标：实现可用的 Android 音乐播放器。

任务：

1. 接入 Media3 / ExoPlayer。
2. 实现播放队列。
3. 实现播放、暂停、上一首、下一首。
4. 实现进度条与拖动。
5. 实现播放模式。
6. 实现后台播放服务。
7. 实现通知栏播放控制。
8. 实现 MediaSession。
9. 实现耳机/蓝牙媒体按键响应。
10. 实现音频焦点处理。
11. 记录播放历史。

验收标准：

- 锁屏后继续播放。
- 通知栏可控制播放。
- 耳机按键可控制播放。
- App 被切到后台后播放不中断。
- 播放状态在 UI 与通知栏一致。

## 阶段 4：歌词能力

目标：实现本地歌词展示和基础偏移。

任务：

1. 抽取/重写 LRC 解析工具。
2. 实现歌词数据模型。
3. 根据歌曲 URI 查找同名歌词。
4. 支持纯文本歌词展示。
5. 支持歌词时间轴高亮。
6. 支持歌词偏移调整。
7. 保存每首歌的歌词偏移配置。
8. 播放页集成歌词区域。

验收标准：

- 有 LRC 时可随播放进度高亮。
- 无歌词时有明确提示。
- 偏移调整后立即生效。
- App 重启后偏移配置仍存在。

## 阶段 5：云音乐搜索与详情

目标：迁移桌面端云音乐能力到 Android。

任务：

1. 实现云音乐设置页。
2. 安全保存 API Key。
3. 实现 provider 配置。
4. 实现 API 连接测试。
5. 实现云端歌曲搜索。
6. 实现搜索结果列表。
7. 实现歌曲详情接口。
8. 实现封面加载。
9. 实现歌词获取接口。
10. 实现错误状态展示。

验收标准：

- 正确配置后可以搜索云端歌曲。
- 搜索结果可查看详情。
- 鉴权失败、无结果、网络错误有明确提示。
- API Key 不以明文形式展示在普通 UI 中。

## 阶段 6：下载管理

目标：实现云端歌曲下载与任务管理。

任务：

1. 设计下载任务表。
2. 实现下载队列。
3. 实现下载前台服务。
4. 实现通知栏下载进度。
5. 实现暂停、继续、取消。
6. 实现下载失败状态。
7. 实现音质选择。
8. 实现音质不可用自动降级。
9. 下载完成后写入目标目录。
10. 下载完成后触发媒体库扫描。
11. 下载完成后自动导入曲库。
12. 可选：自动下载歌词。

验收标准：

- 下载任务离开页面后继续执行。
- 通知栏能看到下载进度。
- App 重启后能看到历史下载任务。
- 下载完成歌曲可在曲库中出现。

## 阶段 7：AI 发现音乐

目标：实现移动端发现推荐。

任务：

1. 实现 AI 设置页。
2. 支持 OpenAI-compatible 配置。
3. 支持 Anthropic-compatible 配置。
4. 安全保存 AI API Key。
5. 构建推荐输入数据：曲库、收藏、歌单、播放历史、可选歌词片段。
6. 实现 AI 推荐请求。
7. 校验 AI JSON 输出。
8. 使用云音乐搜索解析推荐候选。
9. 实现发现页推荐列表。
10. 展示推荐理由、证据、置信度。
11. 支持重新生成。
12. 支持隐私提示。

验收标准：

- 配置完整时可以生成推荐。
- 配置缺失时有明确提示。
- 样本不足时有明确提示。
- 推荐结果可查看详情或下载。
- 暗色主题下发现页文字清晰可读。

## 阶段 8：云端元数据匹配

目标：实现本地曲库云端补全。

任务：

1. 实现单曲云端匹配。
2. 实现全库匹配。
3. 实现只补齐缺失歌词。
4. 实现匹配评分策略。
5. 支持覆盖或不覆盖本地元数据。
6. 保存 cloudMatch 信息。
7. 支持匹配失败列表。

验收标准：

- 可对单曲执行云端匹配。
- 可对曲库批量匹配。
- 匹配结果不会误覆盖用户不希望覆盖的数据。
- 匹配过程可取消或至少可停止后续任务。

## 阶段 9：体验完善与发布准备

目标：达到可长期使用的 Android 版本。

任务：

1. 适配不同屏幕尺寸。
2. 优化大曲库列表性能。
3. 完善错误提示。
4. 完善暗色主题。
5. 增加数据清理能力。
6. 增加日志导出能力。
7. 生成 release APK。
8. 生成签名配置说明。
9. 编写 Android 使用说明。

验收标准：

- Release APK 可安装。
- 基础功能稳定。
- 没有明显黑字黑底、白字白底问题。
- 后台播放、下载、权限流程稳定。

## 6. 与当前桌面端的功能对应关系

| 桌面端功能 | Android 处理方式 | 阶段 |
| --- | --- | --- |
| 本地目录扫描 | MediaStore / SAF 重做 | 阶段 2 |
| HTMLAudioElement 播放 | Media3 / ExoPlayer 重做 | 阶段 3 |
| 桌面歌词窗口 | 初版不做，后续悬浮窗 | 阶段 9+ |
| LRC 解析 | 抽取复用 | 阶段 4 |
| 歌词偏移 | 数据库存储偏移 | 阶段 4 |
| 云音乐搜索 | API 逻辑迁移 | 阶段 5 |
| 云端下载 | Android 下载服务重做 | 阶段 6 |
| AI 发现 | 协议复用，UI 重做 | 阶段 7 |
| 下载任务状态机 | 模型复用，实现重做 | 阶段 6 |
| 设置页 | 移动端分组重做 | 阶段 1/5/7 |
| 托盘/关闭行为 | Android 不需要 | 不迁移 |

## 7. 风险点

### 7.1 Android 权限复杂度

风险：不同 Android 版本存储权限差异大。

应对：

- 初版优先 MediaStore。
- 自定义目录扫描放到后续阶段。
- 所有权限失败都要有清晰引导。

### 7.2 后台播放稳定性

风险：不同厂商系统后台限制不同。

应对：

- 使用标准 Foreground Service + MediaSession。
- 提供电池优化设置提示。

### 7.3 下载稳定性

风险：大文件下载、网络切换、App 被杀会导致任务中断。

应对：

- 下载任务持久化。
- 前台服务通知。
- 失败后允许手动重试。
- 分段下载后置，先保证单连接稳定。

### 7.4 云音乐 API 依赖

风险：网关接口变化或限流。

应对：

- 保留 API Base URL 配置。
- 错误信息结构化。
- 连接测试独立。

### 7.5 AI 输出不稳定

风险：模型返回非 JSON 或推荐质量不稳定。

应对：

- 严格 JSON 校验。
- 不信任 AI 返回的 ID/URL。
- 必须通过云音乐解析后再展示可操作歌曲。

## 8. 当前文档阶段交付

本阶段已建立 Android 目录，并完成：

- `Android/requirements.md`
- `Android/development-plan.md`

下一步建议：

1. 先确认技术路线是否使用 React Native。
2. 确认首版是否包含 AI 发现。
3. 确认最低 Android 版本和包名。
4. 再开始创建 `Android/app/` 工程骨架。
