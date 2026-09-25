# 准备核查

- 新建11棵产品工作树：fc/f0/f1/f2/f3/bc/s/h/e/profile-backend/profile-frontend，准备结束逐树rev-parse核对且porcelain为空。
- 保留旧9棵产品树与所有提交；本次不合并F1/F3，交新FC按交付证据验收。
- 只创建分支/工作树与协调文档，产品实现零改动、测试未重跑、未启动执行者或服务、未读取密钥、未发模型调用。
- HD-001 ledger原样保留：reserved_total=0，reserved_review=0，grants=[]，real_calls_enabled=false。
- 模型目录核实gpt-6-sol存在，supported_in_api=true；未确认真实账号调用成功，不替换模型。
- 本机codex help验证-C/-m/-s/-a/--add-dir；默认workspace-write/on-request。Qoder自动goal高上限未在本轮启动验证。
- control原有未提交文件保留；只在README添加当前入口，其余新文档。本次未提交control，避免混入其他成果。
- 同时存在多工作树不代表操作系统写域隔离，包边界靠角色批准/差量检查；不承诺物理沙箱。
