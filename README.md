# Forest Beat · 林与城的网页音游

一个**纯前端、无后端、可离线**的小型四轨下落式音乐游戏：

- 首页 Three.js 3D 场景随通关进度切换：**树林阳光 → 灰暗城市 → 林城交织·蓝天白云（感谢游玩）**
- 两个按顺序解锁的关卡，绿 / 灰、大 / 中 / 小方块随音乐下落
- Canvas 2D 保证判定渲染，**音频时钟（AudioContext.currentTime）驱动时间轴**，不随帧率漂移
- BGM / 模型 / 音效缺失时自动使用程序化合成与基础几何体占位，**放入同名资源重新构建即替换**
- **PWA**：可"添加到主屏幕"，Service Worker 缓存全部资源，缓存后断网也能玩
- **可打包 Android / iOS App**（Capacitor），打包后完全本地运行、不需要网络
- 内置「谱面分析工具」页面：上传 MP3 自动检测 BPM / onset / 频段并导出谱面 JSON
- 键盘（D F J K）、鼠标、触摸均可游玩；进度与音量保存在 localStorage

> 本项目没有任何后端服务：不请求 API、不连 WebSocket、不含 localhost / 局域网 IP。
> `npm run build` 产物全部在 `dist/`，扔到任意静态托管即可被公网（含手机 4G/5G）访问。

---

## 一、安装与本地运行

需要 Node.js 18+（[nodejs.org](https://nodejs.org/) 下载安装即可）。

```bash
# 1. 安装依赖
npm install

# 2. 本地开发（仅开发时使用，地址 http://localhost:5173；线上游玩不需要它）
npm run dev

# 3. 构建纯静态产物到 dist/
npm run build

# 4. 在本机预览构建产物（http://localhost:4173，模拟线上静态环境）
npm run preview
```

浏览器打开后：点「开始游戏」→ 选关卡（**首次点击会在用户手势内解锁 AudioContext**，符合浏览器自动播放策略）。

- 键盘：`D F J K` 对应 4 条轨道，`Esc` / `P` 暂停
- 手机 / 触屏：直接点按对应轨道区域
- 判定线在屏幕下方 85% 处，**方块底边接触判定线的瞬间就是判定点**

---

## 二、目录结构

```
forest/
├─ index.html                 # 首页 / 游戏页 / 结算页（单页三屏）
├─ analyzer.html              # 谱面分析工具页面（独立多页入口）
├─ styles.css
├─ package.json
├─ vite.config.js             # ★ base:'./' + PWA(manifest/SW) 配置
├─ capacitor.config.ts        # ★ 打包 App 用（webDir: dist）
├─ .github/workflows/deploy.yml  # GitHub Pages 自动部署
├─ public/
│  ├─ assets/                 # ★ 模型 / 音频素材放这里（构建时原样拷进 dist）
│  │  ├─ models/  forest.glb / city.glb / mix.glb
│  │  └─ audio/    level1.mp3 / level2.mp3 / hit.mp3 / miss.mp3 / clear.mp3
│  └─ icons/                  # PWA / App 图标（同名文件覆盖即可替换）
│     ├─ icon-192.png / icon-512.png / icon-maskable-512.png
│     ├─ apple-touch-icon.png / favicon-32.png
├─ scripts/
│  └─ gen-icons.mjs           # 零依赖图标生成器：npm run icons
└─ src/
   ├─ charts/                 # ★ 谱面 JSON（构建时 import 打包进 JS，不再运行时 fetch）
   │  ├─ level1.json
   │  └─ level2.json
   ├─ main.js                 # 入口与页面状态编排
   ├─ config.js               # ★ 可调参数、ASSETS 路径、BASE_URL / assetUrl()
   ├─ storage.js              # localStorage 存档
   ├─ audioEngine.js          # Web Audio：BGM 时钟 / 音效 / 缺失资源合成兜底
   ├─ homeScene.js            # Three.js：三主题、模型加载、阳光、雾、云、淡变
   ├─ gameScene.js            # Canvas 2D：四轨下落、绘制、输入、暂停
   ├─ judge.js                # 判定窗口 / 找最近音符 / 计分（纯函数）
   ├─ chartAnalyzer.js        # BPM / onset / 频段分析 + 内置占位谱面生成
   ├─ analyzerApp.js          # 分析页面交互
   └─ ui.js                   # DOM / HUD / 结算 / 设置 / 资源失败遮罩
```

---

## 三、替换你自己的资源

所有路径集中在 [src/config.js](src/config.js) 的 `ASSETS` 中（均为**不带前导斜杠**的相对路径，
代码通过 `assetUrl()` 基于 `import.meta.env.BASE_URL` 解析，子目录部署也不会错）。

| 资源 | 放置路径 | 缺失时的行为 |
| --- | --- | --- |
| 树林模型 | `public/assets/models/forest.glb` | 绿色圆锥树 + 棕色圆柱树干占位 |
| 城市模型 | `public/assets/models/city.glb` | 灰色带窗高楼盒子占位 |
| 混合模型 | `public/assets/models/mix.glb` | 树与楼交错组合占位 |
| 关卡 1 BGM | `public/assets/audio/level1.mp3` | 按谱面 BPM 合成的鼓点伴奏 |
| 关卡 2 BGM | `public/assets/audio/level2.mp3` | 更快的合成伴奏（含琶音） |
| 命中 / 失误 / 过关音效 | `hit.mp3 / miss.mp3 / clear.mp3` | 振荡器合成短音 |

**替换流程（线上版）**：把文件放进 `public/assets/...` → `npm run build` → 重新部署 `dist/`。
本地开发（`npm run dev`）时放入文件刷新即可生效。想换目录或文件名，只改 `config.js` 里的 `ASSETS`。

模型 / 音频缺失**不是错误**：游戏会静默使用占位内容正常开局；只有应用壳（HTML/JS/CSS）加载失败时，
才会弹出「资源加载失败，请重试」遮罩与重试按钮——不会出现任何"服务不可用 / 服务器未启动"提示。

### PWA 图标替换

直接覆盖 `public/icons/` 下同名 PNG（512 图建议留出约 22% 内边距以适配 maskable 遮罩）。
也可以修改 [scripts/gen-icons.mjs](scripts/gen-icons.mjs) 后运行 `npm run icons` 重新生成整套图标。

### ⚠️ 模型必须是 .glb / .gltf（.blend 不能直接用）

Blender 中：`File → Export → glTF 2.0 (.glb/.gltf)`，建议：

1. 格式选 **glTF Binary (.glb)**（单文件，贴图已打包）；
2. 勾选 *Include: Limit to Selected*（只需导出选中对象时）、*Transform: +Y Up*；
3. 贴图建议压到 1024×1024 以内，单文件控制在 5–15MB，加载更流畅；
4. 模型加载后会**自动按包围盒居中、缩放到统一大小并缓慢旋转**，无需精修坐标。

单个缓存文件上限已调到 100MB；首次在线加载后，模型与音频会进入 Service Worker 缓存，之后离线可用。

---

## 四、用你自己的两段音乐生成谱面

内置分析页面，**全部计算在浏览器本地完成，不上传任何服务器**：

1. `npm run dev` 后打开 `http://localhost:5173/analyzer.html`
   （或首页底部「谱面分析工具 →」；构建后是 `dist/analyzer.html`）；
2. 分别为关卡 1 / 关卡 2 选择音乐文件（mp3 / wav / ogg）；
3. BPM 一般留空自动检测；自动检测不准时可手动填入 BPM；
4. 点「分析并生成」，页面显示检测到的 BPM、onset 数与音符数；
5. 点「下载 level1.json / level2.json」，**覆盖 `src/charts/` 下同名文件**；
6. 重新 `npm run build` 并部署 `dist/`（谱面在构建期被 import 打包进 JS，
   避免了静态子路径 / `file://` 下运行时 fetch JSON 失败的问题）。

分析做了什么（见 [src/chartAnalyzer.js](src/chartAnalyzer.js)）：

- Web Audio `decodeAudioData` 解码；
- 一阶低通分出低（≤150Hz）/ 中（150–2000Hz）/ 高频能量；
- 自适应阈值 spectral flux 检测 onset（起音点）；
- 低频能量自相关检测 BPM（60–180）与节拍相位；
- 音符对齐 **1/4、1/8 拍**（关卡 2 另含 1/16 阶梯），相邻间隔不小于 **80ms**；
- 低频强 → 大块，中频 → 中块，高频 → 小块；重拍绿色大块，弱拍灰色小块；
- 关卡 1 稀疏（四分音符为主）、判定宽松；关卡 2 八分密集、判定严格。

---

## 五、手动调整谱面参数

谱面 JSON 形如：

```json
{
  "bpm": 120,
  "offset": 0.15,
  "fallTime": 1.2,
  "targetRatio": 0.6,
  "duration": 60.6,
  "notes": [
    { "time": 1.25, "lane": 0, "size": "large", "color": "green" }
  ]
}
```

| 字段 | 含义 | 调整建议 |
| --- | --- | --- |
| `bpm` | 每分钟拍数 | 听感不准就在分析页手填，或直接改这里 |
| `offset` | 谱面整体时间偏移（秒），**正数 = 方块判定点提前** | 音乐开头有空白/淡入就微调，步进 ±0.01～0.03 |
| `fallTime` | 方块从出生到压线的秒数 | 越小越快越难；关卡 1 ≈ `2 × 60/bpm`，关卡 2 ≈ `1.5 × 60/bpm` |
| `targetRatio` | 通关分数占「总可得分」的比例 | 关卡 1 = 0.6，关卡 2 = 0.7 |
| `notes[].time` | 该音符在音乐中的秒数 | 对应判定点（方块底边触线时刻） |
| `notes[].lane` | 轨道 0–3（对应 D F J K） | 直接改数字即可 |
| `notes[].size` | `large / medium / small` | 大=鼓点，中=旋律，小=高频装饰 |
| `notes[].color` | `green / gray` | 绿色重拍与灰色过渡交织 |

全局默认值在 [src/config.js](src/config.js)：

- `JUDGE_WINDOWS_MS`：Perfect ±45 / Good ±90 / OK ±135 ms（第 1 关乘 `judgeScale: 1.25` 放宽）；
- `SCORE`：Perfect 100 / Good 60 / OK 30 / Miss −30；每 10 连击 +10%（上限 +50%）；
- `LEVELS`：每关的 BPM 默认值、`fallBeatFactor`、`targetRatio`、`judgeScale`；
  谱面 JSON 中的同名字段优先于这里；
- `NOTE_SIZES`：方块宽度占轨道比例（0.60–0.95）与高度（48 / 78 / 120 px）；
- `JUDGE_LINE_RATIO`：判定线高度（默认 0.85）；
- `SCENE`：3D 模型目标尺寸、自转速度、主题淡变时长等。

---

## 六、玩法与计分规则

- **Perfect**（±45ms）+100，**Good**（±90ms）+60，**OK**（±135ms）+30；
- 超过 OK 窗口未点（方块过线）记 **Miss，−30 分并清空连击**；
- 每 10 连击，命中得分 +10%（最多 +50%）；
- 准确率 =（Perfect×100 + Good×60 + OK×30）/ 已判定音符数；
- 通关条件：曲目结束且 `分数 ≥ 音符数 × 100 × targetRatio`
  （关卡 1：60%，关卡 2：70%）；
- 通关第 1 关：解锁第 2 关，首页变为灰暗城市；
- 通关第 2 关：首页变为林城交织 + 蓝天白云，并显示「感谢游玩」。

localStorage 键：`forest-beat-save-v1`，保存 `level1Cleared / level2Cleared /
unlockedLevel / theme / volume / best`，首页「重置进度」可清空。

---

## 七、部署到公网（手机 4G/5G 可访问，电脑关机也不受影响）

`vite.config.js` 已设置 `base: './'`，构建产物全部使用相对路径，
**部署到域名根目录或任意子目录（如 GitHub Pages 项目站 `/仓库名/`）都能直接运行**。
本项目是两个静态 HTML 页面、没有前端 history 路由，**任何平台都不需要配置 SPA / 404 重写**。

通用配置三要素：

| 项 | 值 |
| --- | --- |
| 安装命令 | `npm install`（或 `npm ci`） |
| 构建命令 | `npm run build` |
| 发布目录 | `dist` |

### 方式 A：GitHub Pages + GitHub Actions（推荐，免费）

仓库已自带 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)：

1. 把项目推送到 GitHub：
   ```bash
   git init && git add . && git commit -m "Forest Beat PWA"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
2. 打开仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**；
3. 推送后 Actions 自动构建部署，完成后 Pages 给出地址：
   `https://<用户名>.github.io/<仓库名>/`（项目站自动位于子路径，已兼容）；
4. 以后每次 `git push` 都会自动更新线上版本。

### 方式 B：Netlify

1. 登录 [app.netlify.com](https://app.netlify.com/) → **Add new site → Import an existing project**，授权并选仓库；
2. Build command 填 `npm run build`，Publish directory 填 `dist`，部署；
3. 或不用 Git：本地 `npm run build` 后，把 `dist/` 文件夹**整个拖到** Netlify 的 Deploys 页面。

### 方式 C：Vercel

1. [vercel.com](https://vercel.com/) → **Add New → Project** 导入仓库；
2. Framework Preset 选 **Vite**（Build Command `npm run build`、Output Directory `dist` 自动识别），Deploy；
3. 或本地 `npm i -g vercel` 后在项目目录执行 `vercel --prod`。

### 方式 D：Cloudflare Pages

1. Workers & Pages → **Create → Pages → Connect to Git** 选仓库；
2. Framework preset 选 **None**；Build command `npm run build`；Build output directory `dist`，部署。

### 方式 E：自己的 Nginx / 对象存储

把 `dist/` 内全部文件上传到站点目录（如 `/var/www/forest/`）。Nginx 示例：

```nginx
server {
    listen 80;
    server_name example.com;
    root /var/www/forest;          # 直接指向 dist 内容；子目录同理可用 alias
    index index.html;
    # Service Worker 不要被强缓存，保证 autoUpdate 能及时更新
    location = /sw.js { add_header Cache-Control "no-cache"; }
    location = /manifest.webmanifest { add_header Cache-Control "no-cache"; }
    # 带 hash 的 assets 可永久缓存
    location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
}
```

对象存储（OSS/COS/S3）：开启静态网站托管，默认首页设 `index.html`，上传 `dist/` 内全部文件。

> 注意：PWA 需要 **HTTPS** 环境（localhost 例外）。上述平台默认提供 HTTPS；
> 自建 Nginx 请自行配置证书（certbot 等）。

---

## 八、手机 4G/5G 访问与 PWA 离线游玩

### 公网访问测试

1. 按上面任一方式部署，拿到 `https://` 开头的公网地址；
2. 手机**关闭 WiFi、使用 4G/5G 流量**，用浏览器打开该地址即可游玩；
3. 此时电脑可以关机——网站运行在托管平台，与你的电脑没有任何关系。

### 添加到主屏幕

- **Android（Chrome/Edge）**：菜单 → **添加到主屏幕 / 安装应用**；
- **iOS（Safari）**：分享 → **添加到主屏幕**（必须用 Safari）。

从主屏幕图标启动时为独立全屏窗口（standalone），无浏览器地址栏。

### 离线游玩

首次在线打开后，Service Worker 会预缓存 HTML/JS/CSS/图标以及 `dist` 中已有的模型、音频、谱面；
之后**断网或开飞行模式**仍可从主屏幕图标启动并完整游玩。
占位音频 / 占位几何体是内置的，即使从未添加过 mp3 / glb 也能离线游戏。

更新策略为 **autoUpdate**：发布新版本后，用户下次打开会在后台静默更新，
刷新一次即进入新版（SW 与 manifest 均按 no-cache 处理）。

---

## 九、打包成 Android App（完全离线，不需要网络）

使用 Capacitor，把 `dist/` 作为本地资源包进原生 APK。前置：安装
[Android Studio](https://developer.android.com/studio)。

```bash
# 依赖已在 package.json 中：@capacitor/core @capacitor/cli @capacitor/android

npm run build          # 1. 产出最新 dist/
npx cap add android    # 2. 仅第一次：生成 android/ 原生工程
npx cap sync           # 3. 每次更新 dist 后执行，把网页资源拷进工程
npx cap open android   # 4. 用 Android Studio 打开工程
```

在 Android Studio 中：等待 Gradle 同步完成 → 菜单 **Build → Build Bundle(s) / APK(s) → Build APK(s)**，
完成后点 *locate* 找到 `app-debug.apk`，发到手机安装即可。
该 APK 把全部游戏资源放在本地，**运行时不需要任何网络或服务器**。
要上架应用商店则用 **Build → Generate Signed Bundle / APK** 生成签名 Release 包。

以后修改了游戏内容，只需：`npm run build` → `npx cap sync android`（或 `npm run cap:android`），
再在 Android Studio 重新 Build。iOS 同理：`npm i -D @capacitor/ios` 后 `npx cap add ios`，
用 Xcode 打开（需 macOS + Apple 开发者账号）。配置见 [capacitor.config.ts](capacitor.config.ts)。

---

## 十、兼容性与常见问题

- Chrome / Edge 最新版推荐；Safari 15+ 可用（已处理 `webkitAudioContext`、
  `OfflineAudioContext` 前缀与 `roundRect` 兜底）；
- 桌面与移动端均可，移动端触摸区域为整条轨道。

**Q：部署后白屏？**
A：确认部署的是 `dist/` **目录里的内容**而不是把 `dist` 文件夹本身套了一层；
打开浏览器控制台看 404 的资源路径。本项目已用 `base: './'` 相对路径，子目录不会有问题。

**Q：手机必须连电脑同一个 WiFi 吗？**
A：不需要。那只是 `npm run dev` 局域网开发服务器的用法。部署到公网后手机用任意网络访问 https 地址。

**Q：断网后打不开 / 提示离线恐龙页？**
A：先在线成功打开过一次（完成 SW 预缓存），并从**同一地址**（或主屏幕图标）进入；
Chrome 地址栏直接断网回车可能不经过 SW，用主屏幕图标最稳。

**Q：替换了音乐 / 模型 / 谱面，线上没变？**
A：这些资源在**构建时**进入 `dist/`（谱面更是打包进 JS），必须重新 `npm run build`
并重新部署；手机端 SW autoUpdate 会在下次打开时拉取新版，必要时手动刷新一次。

**Q：如何彻底更新 / 清除缓存？**
A：浏览器站点设置里清除数据，或 Chrome DevTools → Application → Service Workers →
Unregister + Clear storage，再刷新。

**Q：为什么没有放真实 mp3/glb 也有音乐和场景？**
A：音频由 Web Audio 按 BPM 合成、模型由几何体占位，保证零素材也能完整开发、测试和离线游玩。
#   F o r e s t _ b e a t  
 