# 独立最小骨架

用户要求不再保留旧包混淆结构，已创建原桌面 Git 仓库的 orphan 分支，
不是删除原树，也不是重新建另一套仓库。

- 分支：work/desktop-minimal-0
- 工作树：/home/maoqh/projects/ordessa/worktrees/desktop-minimal
- 首次提交：9d5fe6a2a3
- git status --short：空；未 push
- 24 个跟踪文件；仅 apps/desktop 与 packages/desktop-host 两个源码包。
- 不含旧业务、旧 SDK、legacy 文件、preload、wire 或迁移文档。

验证：typecheck、6/6 单测、build、Electron 空壳烟测通过。
Electron 实测 empty=true/pages=0/nodeAbsent=true/bridgeAbsent=true。
烟测为 Xvfb、软件渲染、测试专用 --no-sandbox，不证明生产 OS 沙箱。
正常 dev 保持沙箱；新安装 chrome-sandbox 为 uid1000/gid1000/0755，
Ubuntu 首次正常启动仍需管理员配置，未擅自提权修改。

安装：首次 npm9 resolver 内部报错；npm11生成锁文件并安装；
首次解包 csstype 类型文件不完整，npm9按锁文件离线 ci重装恢复，
重装后所有源码检查通过。Electron用本地既有下载缓存完成安装。
未将旧树 node_modules 链接到新树，两个工作树互相独立。

原 work/desktop-modular-v1 及已有未提交工作完整保留。
今后最小前端结构以新树 README 为准。
