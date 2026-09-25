# LNX-003 · media.md — 两种媒体路径的代码级对比

只读调查。分支与行号（全部完整 SHA）：
chat = desktop `feature/agentbox-desktop-product` @ `08b4eac7fe10aacc3220cca94c52659aaf043cc5`
settings = desktop `feature/agentbox-desktop-settings` @ `01083212aaade2ead3a1be9323943ea3eae3284e`
共同祖先 `b8c2e0b6eb5301c48b91598e94a191d9f7be934a`。未运行任何测试/应用。

## 0 先纠正问题本身：两条线**不是**在同一处对立的两个方案

〔证实〕**两侧都有同一个 `hermes-media://` 受管协议，而且两侧都用它跑远程音视频**：

- `media-protocol.ts`（186 行）与 `media-registration.ts`、`media-protocol.test.ts` **两侧逐字节相同**，
  且都等于祖先版（`git show <ref>:… | wc -l` 三处皆 186）⇒ 协议实现不是分岔点。
- chat 树 `src/lib/desktop-fs.ts` 里就有 `mediaGatewayStreamUrl()`，远程分支**逐字产生**
  `hermes-media://remote/<file>?connectionId&profile`（chat 树该函数体，见 `08b4eac7:apps/desktop/src/lib/desktop-fs.ts`）；
  `resolveMediaPlaybackSrc` 两侧同形：`isRemoteGateway() ? mediaGatewayStreamUrl(path) : mediaStreamUrl(path)`。
- `main.ts:925 registerMediaProtocolImpl({...})` **两侧同一位置同一次注册**（chat 亦 925，import 同 114），
  无条件、与 runtime policy 无关。

真正的分岔只有一处，且**作用域比 LNX-001 的描述窄**：

| 渲染路径 | chat（P54） | settings（P55） |
| --- | --- | --- |
| 有 Electron 桥 + 远程网关（**打包桌面的正常形态**；`preload.ts:272 readFileDataUrl`、`:284 saveGatewayFile` 均在两侧） | `resolveMediaDisplaySrc` → `gatewayMediaDataUrl()` | 同左 |
| **无桥**渲染进程 + 远程网关（`!window.hermesDesktop?.readFileDataUrl`） | `mediaRemoteObjectUrl()`：header 鉴权 fetch → `URL.createObjectURL` | `mediaExternalUrl()` → `managedRemoteMediaUrl()` → `hermes-media://remote/…` |
| 本地模式（`isRemoteGateway()` 为假） | `file://` | `file://` |

⇒ **在 Linux 原生 agentbox 路径上（本地服务、有桥、非远程网关），两侧行为相同**，媒体选择不阻塞对话主线。
`readConnection` 是注入的**遗留 Hermes 网关连接**（`desktop-fs.ts:49` 默认 `() => null`，由
`src/app/composition/bridges/desktop-filesystem.ts:25` 从 `$connection` 供给），不是 agentbox wire。

## 1 鉴权 token 从哪里来（这是两解唯一实质的安全差）

| | chat 的 blob 路 | settings 的受管协议路 |
| --- | --- | --- |
| token 出处 | **渲染进程**读连接对象 `conn.token` 并自己拼 header：`mediaRemoteAuthHeaders()` 返回 `{'x-hermes-session-token': conn.token}`（`08b4eac7:…/desktop-fs.ts:313-321`） | **主进程**持有：`media-protocol.ts:179` `headers.set('x-hermes-session-token', connection.token)`，`connection` 由主进程 `resolveRemoteConnection` 给出 |
| OAuth 连接 | 直接 `return null`（`authMode === 'oauth'` 无 renderer token 可用），于是 `mediaRemoteObjectUrl` **抛错** `Remote media needs the desktop bridge for this connection`（`:327-335`） | `authMode==='oauth'` → `ensureRemoteBearer(baseUrl)` 取 Bearer，取不到则走 OAuth 会话 `credentials:'include'`（`media-protocol.ts:163-172`；`media-registration.ts:60-73`） |
| 结论 | token **进过渲染进程**；OAuth 远程这一格直接不可用 | token 全程留在主进程；OAuth 有两种兜底 |

## 2 URL / 目标 / 重定向约束

- **目标锚定（两解共用，settings 路才走到）**：`remoteMediaEndpoint` 把路径钉在
  `<connection.baseUrl>/api/files/stream`，`url.protocol` 不是 `http:`/`https:` **即抛**
  （`media-protocol.ts:92-107`）；渲染进程只能提供 `path` 与 `profile` 查询参数（`:100-104`），
  主机由主进程的 connection 决定 ⇒ 渲染进程**不能**用它打任意 URL。
- **方法闸门**：仅 `GET`/`HEAD`，其余 405（`:111-116`）。URL 解析失败 → 404（`:121-125`）。
- **扩展名白名单**：`isStreamableMediaPath` 只放行 11 项
  （`.avi .flac .m4a .mkv .mov .mp3 .mp4 .ogg .opus .wav .webm`，`:1-13`）；不在表内 → **415**（`:127-129`）；
  本地 `stream` 模式解析后再查一次（`:137-139`）。
  而 `src/lib/media.ts:17-33` 的图片族是 `bmp/gif/jpeg/jpg/png/svg/webp` —— **一个都不在白名单里**。
- **转发请求头白名单**：只有 `accept, if-modified-since, if-none-match, if-range, range`（`:15`）。
- **重定向：两侧都没有任何限制。**〔证实〕`desktop-fs.ts`+`media-protocol.ts`+`media-registration.ts`
  三个文件里 `redirect` 命中数 chat 0 / settings 0；`electronNet.fetch` 调用点只设
  `bypassCustomProtocolHandlers`/`credentials`/`headers`/`method`（`media-registration.ts:47-59`）。
  ⇒ 会话 token / Bearer 会随默认 follow 的 3xx 一起带到新 origin，chat 的渲染进程 fetch 同样如此。
  **这是两解共同的缺口**，与 LNX-001 记录的后端 probe 侧纪律（工单 104 禁 redirect）不同层。
- **scheme 特权未声明**：全仓 `registerSchemesAsPrivileged` **0 命中**〔证实〕，只有 `protocol.handle(MEDIA_PROTOCOL, …)`
  （`media-registration.ts:83`）⇒ `bypassCSP / supportFetchAPI / corsEnabled / stream` 一律没写。
  `<video>` 靠 `range` 转发送 Seek 是否成立、CSP 是否放行该 scheme，**属未验证项**（§6）。

## 3 资源释放

| | chat | settings |
| --- | --- | --- |
| blob | 调用方所有权写进注释（`desktop-fs.ts:324`）；消费方 `markdown-text.tsx:404-411` 在卸载/换源时 `URL.revokeObjectURL(shownObjectUrl)`（注释点名 "P54 G3"，防长转录累积）；下载路 `openRemoteMediaFile` 用 `setTimeout(…, 30_000)` 释放（`:358`） | 无 blob 需释放；`gatewayMediaDataUrl` → `readDesktopFileDataUrl` 返回 **data URL**（整份字节 base64 进渲染内存，非流式） |
| **已证实的漏** | `markdown-text.tsx:374-395`：promise 晚于卸载到达时 `cancelled=true` ⇒ `shownObjectUrl` 从未赋值 ⇒ **该 blob URL 永不 revoke**。快速换源的长转录会攒 | 不适用 |

## 4 错误与取消

- 协议侧错误码诚实：404（无桥/非远程/解析失败）、401（token 模式下无 token，`:175-177`）、
  415（非白名单类型）、502（catch-all，`:182-184`）。
- 渲染侧：chat 的 `resolveMediaDisplaySrc` 抛错被 `markdown-text.tsx:396-401` 接成 `setFailed(true)`，
  呈现 "Couldn't load <name>. [Open image]"（`:417-424`）——失败可见，不是静默空图。
- **取消：两侧都没有 `AbortSignal`/`signal`**〔证实：chat `desktop-fs.ts` 里 `AbortSignal|signal` 命中 0〕。
  chat 只有 `cancelled` 标志，它**不中止在飞的 fetch**，只是不采用结果；协议路由 `protocol.handle` 由
  Electron 负责流的终止，`Range`/`HEAD` 透传在位（`:15`），但未实测 Seek 行为。

## 5 必须保留的对照测试（合并时一个都不能删）

1. `apps/desktop/src/lib/media.remote.test.ts`（两侧同名不同体）——**同一 base 用例的两侧断言都要留**，
   但必须先补一条**跨到 handler 的**用例：见 §7 的 415 洞。
2. `apps/desktop/electron/host-capabilities/preview/media-protocol.test.ts:276` 断言
   `hermes-media://remote/%2Ftmp%2Fsecret.txt` → **415**（拒非媒体类型）。这条是**边界守卫**，保留；
   但它只测了 `.txt`，**没有任何一条把 `.png` 喂进 handler**。
3. `media.remote.test.ts` 的 "五种连接形态下，任何可产出 URL 的解析后 `searchParams` 无 token" 门（settings 侧）
   ——这是"凭证不进 URL"的可执行不变式，两解共用，**必须保留**。
4. chat 侧 `mediaRemoteAuthHeaders()` 在 OAuth 下返回 null 的断言（"拒发无凭证请求"）——保留。
5. chat 侧 `markdown-text` 的 blob 释放路径（若保留 blob 方案则必须有；当前**无测试**覆盖 §3 的漏）。

## 6 建议（附理由；不代替 I 的最终选择）

**保留受管协议为主干，但把"非流式媒体"补进主进程协议，而不是退回渲染进程持 token。**

理由（全部来自上面代码事实）：

1. 协议路把凭证与目标锚定都留在主进程（§1、§2），blob 路把 token 交给渲染进程，且 **OAuth 远程直接不可用**（抛错）。
   I 的审阅暂定方向与此一致；这条差异是**安全**差异，不是风格差异。
2. 两解其实**共用同一个协议**（§0）：合并并不会"选掉"协议，只会决定无桥图片走哪条。
3. 协议侧要改的是一处**窄而可测**的白名单判断（`media-protocol.ts:127-129`）：
   图片族走 `/api/files/download`（chat 已证明该端点存在且 header 鉴权可用），音视频继续走 `/api/files/stream`。
   这样 415 洞闭合，且 token 不下 renderer。
4. **必须同时补**两条独立缺口（两解都没有）：`redirect: 'error'`（或逐跳校验 origin）与 scheme 特权声明；
   以及给 blob 兜底路加 `AbortController` 与"晚到结果也要 revoke"。

## 7 必须报告的静态矛盾（不能靠旧裁定掩盖）

〔证实，这是本文件最重要的一条〕settings 侧 `media.remote.test.ts:64-68`、`:86-87`、`:103`
断言 `/tmp/a.png` → `hermes-media://remote/%2Ftmp%2Fa.png[…]?connectionId=studio-ssh&profile=reviewer`，
但**同侧 `media-protocol.ts:127-129` 的白名单里没有 `.png`** ⇒ 该 URL 一旦真被协议处理就是 **415**。
两侧 handler 测试都只覆盖 `.txt→415`，无一条 `.png→handler`。
⇒ **"URL 形状正确"被当成了"能显示"来测**；这正是 I 审阅里"不能通过删除另一侧断言掩盖行为缺失"要防的形态——
不是有人删断言，而是**这条链从未被端到端测过**。合并时必须补，且补上之前不能宣称受管协议覆盖图片。

## 8 未验证项（静态不能判定，需实跑）

1. 打包桌面里无桥渲染进程是否真的可达（若恒有桥，§3/§5 的分岔是死代码，取舍随之变简单）。
2. `hermes-media` 未声明特权时，Linux 上 `<video>` 的 Range/Seek 与 CSP 是否真能工作。
3. `ensureRemoteBearer` / OAuth cookie 会话在 Linux（无 DPAPI，`safeStorage` 行为另有依赖）是否可用。
4. `/api/files/download` 与 `/api/files/stream` 属**外部 Hermes 网关**（本仓不含其实现），
   其对 header 鉴权、redirect、大文件流的真实行为需对着活网关验（本任务禁连接）。
5. §3 的晚到 blob 泄漏在真实长转录下的量级。
