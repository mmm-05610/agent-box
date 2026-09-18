# P21 阶段 1 证据：两仓摘要第一手核对（2026-09-18）

工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，分支
`feature/agentbox-desktop-product`，基线 `dcfaf4d8`（读时工作树干净）。

## 1 后端最后一条登记值（第一手，未转述）

命令：

```bash
grep -n "TS 权威\|生成工件" /home/maoqh/projects/agent-box-env-provider/docs/server-round1/wire-review.md
awk 'NR>434' /home/maoqh/projects/agent-box-env-provider/docs/server-round1/wire-review.md | grep -nE "[0-9a-f]{64}"
```

结果：`wire-review.md` 里最后一对摘要在第 434–437 行（Order 55 G2，前端提交 `b284f70c`）：

| 工件 | 值 |
| --- | --- |
| TS 权威 | `64dc99610b15360d4d114cb377b9034efeab127d5d15a34da5b7db8f42d8e08f` |
| 生成工件 | `42a164a47697f7481f4e5a224e7e2f5241719c1fa3fa476fa54f824c2096433d` |

第 434 行之后全文件再无 64 位摘要（`awk NR>434 | grep -E "[0-9a-f]{64}"` 只命中上面两条），
故"最后一条"确为此对；其后 Order 56/58/58 G6-G7/59/60/62/63/64 各节只写"需前端同步与两仓重锁"。

## 2 本树当前值（本目录 README 的重生成命令，工作树实测）

```bash
cd apps/desktop && node --experimental-strip-types -e "import('./src/types/wire/wire-v1.ts').then(async m => { const fs = await import('node:fs'); fs.writeFileSync('../../docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json', JSON.stringify(m.wireJsonSchemas(), null, 2) + '\n') })"
sha256sum docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json apps/desktop/src/types/wire/wire-v1.ts
```

| 工件 | 重生成后 |
| --- | --- |
| TS 权威 | `a0693877c8d2c28909024b556fd9105363e1a5f2770c9b50a50ad06fe4491635` |
| 生成工件 | `d34b7aa9d42666ff143fef5dbfee7def8fcebc4da3f9bad40e80fb47d95d04b8` |

重生成前的工件副本是 `14f7f73605bb6f048a09a8e7faa93f15ca77d4d66a0b38439a9e9cf2bc6428c7`
（= `d7464166` 时代的投影），落后于权威三个提交。

## 3 未锁定的两条实测原因

### 3.1 本树权威在后端登记之后又动过（Order 57 C 未登记）

```bash
git log --oneline b284f70c..HEAD -- apps/desktop/src/types/wire/
# 5de44668 (P20 wire core test fix) / 2e9d37c2 wire/1: providerArtifacts list/install/rollback (order 57 C)
git show b284f70c:apps/desktop/src/types/wire/wire-v1.ts | sha256sum   # = 64dc9961…（后端登记值）
git show 2e9d37c2:apps/desktop/src/types/wire/wire-v1.ts | sha256sum   # = a0693877…（本树当前）
```

后端侧只留下与"当前权威"对应的**工件副本**，无文字登记：

```bash
sha256sum /home/maoqh/projects/agent-box-env-provider/docs/server-round1/fullstack/generated/wire-v1.schema.json
# a1bd52a4fb68436079ae2d2e439953e8ac7f345ab5934a936a9434952bee0729  （mtime 2026-09-18 02:06）
grep -c "providerArtifacts" …/fullstack/generated/wire-v1.schema.json   # 6（该副本含 providerArtifacts.*）
grep -rn "providerArtifacts" /home/maoqh/projects/agent-box-env-provider/docs/server-round1/wire-review.md  # 0 命中
```

### 3.2 文件式摘要不可跨工具链复现（等价编码差异）

```bash
git show b284f70c:apps/desktop/src/types/wire/wire-v1.ts > <repo>/_tmp.ts   # 临时文件，跑完即删
node --experimental-strip-types -e "import('<repo>/_tmp.ts').then(...)"     # 同一条重生成命令
sha256sum /tmp/regchk/b284f70c.json   # d465e526cc360890576c74ddf8d4baf9cffa79ea0e0e1bd28d0f01d12d39d547
```

`d465e526…` ≠ 后端登记的 `42a164a4…`。逐项对比两份工件：**键集完全相同**（72 项），
差异只在联合类型编码——

| | 本工具链（zod 4.4.3） | 后端登记的那份 |
| --- | --- | --- |
| `WireRequest.id` | `{"anyOf":[{"type":"string"},{"type":"number"}]}` | `{"type":["string","number"]}` |

draft-07 下两者语义相同。反向对照：同一条命令重生成 `d7464166` 的权威得
`14f7f736…`，与本目录当时提交的副本**逐字节相同** ⇒ 命令本身是确定性的，
不可复现来自**工具链**（zod 4 与 zod 3 的编码差），不是命令写法。

## 4 结论

- 后端登记值：`64dc9961…` / `42a164a4…`（停在 `b284f70c`）。
- 本树当前值：`a0693877…` / `d34b7aa9…`（含 Order 57 C 的 `providerArtifacts.*`）。
- **两端未锁定**：后端需按本树交出的**工件本体**重新登记；只报摘要不足以对齐（§3.2）。
- 本单阶段 2 会把 58–64 的方法与字段编进同一权威并再次重生成，届时交出的才是最终提案对。
