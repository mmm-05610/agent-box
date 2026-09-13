# P02 — 从上层完成已批准产品

遵守[总方针](../master-plan.md)全部授权、保护区、资源与持续执行纪律。
输入：[产品决定](../../night-work-planning/product-decisions.md)；基线见[状态](../status.md)。

范围：src/app/**、features/**、components必要通用控件、i18n与其测试；
可加下层窄类型/内部端口但不制造正式wire协议。保留既有样式，不另写预览产品。
顺序子检查点：
A app组合/routes/shell/windows：正常启动壳与服务可用性分离；退役入口及独占页面，保留通用窗口。
B Workspace/Session：单一平铺项目根，打开仅选中并呈现新会话草稿，发送才申请创建；
pin/search、已有Session草稿、历史、工具结果、审批/停止/错误/补齐状态。
C Profile：角色库与编辑、模型默认/多槽位、临时覆盖、原生记忆能力声明、同Harness切换确认；
角色不是Session所有者。模型字段由服务描述，不写品牌分支。
D 设置：模型、Skills/MCP、身份、本机Harness、数据管理；符合product-decisions所有已批准项。
登录、安装、资源与模型配置必须复用已审来源；只做UI也必须显示准确未知/不可用。
未来功能不做假开关；已批准但服务未就绪的页面保持明确状态，矩阵列WAITING_CONTRACT。
HUD/Pet/Quick Entry不暴露Ref或执行所有权；原生harness品牌可作为数据呈现。
每子段：组件行为测试、真实Electron无模型截图、相关typecheck、可点击验收路径，
完成一个子段提交；有阻断跳过对应依赖继续其他段。
测试替身仅测试/dev隔离入口，生产不启用mock/旧Hermes回落。空页面不是功能完成。

阶段终态：P02_GREEN 或 P02_PARTIAL。
PARTIAL必须拆出等待子项与下一可做项，不默认终止整个goal。
