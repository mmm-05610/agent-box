# P01 — 完成36R原范围返修

遵守[总方针](../master-plan.md)全部授权、保护区、资源与持续执行纪律。
输入：[产品决定](../../night-work-planning/product-decisions.md)；基线见[状态](../status.md)。

来源：36R@39291df已统一容器和归档；维护者发现名称37px/所需81px、两套选择、窄窗断言无效。
范围：src/features/chat/sidebar/**、store/workspace-view*、application/workspace/**、
现有projects选择窄接缝、相关测试/e2e和文档。禁止迁移业务权威或借此接后端37。
目标：workspace-list共用行骨架→唯一中立选择/导航协调；持久本地/WSL数据来源仍可独立。
先补“本地A→WSL B→本地A”完整装配反例，只有一个当前选择；搜索清空与信息弹窗不抢选择。
隐藏操作不持续挤占名称：采用现有行叠加/hover/focus模式，可自主选择等价实现；
名称充分利用闲置空间，hover操作和键盘focus都可达。不能只调20px阈值。
修Windows驱动：普通/窄窗均参与断言，检查隐藏/显示操作的布局关系；
修B selected日志取反；PASS/SKIP/PENDING分开，旧失败证据保留。
验收路径：打开两个项目→交替主行→搜索/清空→开另一行信息→窄侧栏hover/键盘→归档重开原id。
复跑定向3文件起步并扩大到受影响面，三项目typecheck；Windows重建一次并真实截图。
本地打开因旧WSL-only后端PENDING可转移到P05，不阻塞上层施工；其余返修必须完成。
提交检查点与evidence/P01.md，然后继续P02，不等待用户体验许可。

阶段终态：P01_GREEN 或 P01_PARTIAL。
PARTIAL必须拆出等待子项与下一可做项，不默认终止整个goal。
