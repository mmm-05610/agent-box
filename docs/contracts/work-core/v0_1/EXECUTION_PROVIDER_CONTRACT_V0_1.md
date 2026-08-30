# Execution Provider Contract v0.1

Mandatory：`descriptor()`（stable provider identity）、`capabilities()`、`start(work, execution)`、`observe(native_ref)`。observe 返回 projection、refs 和 provider-authoritative availability；查询失败必须返回 unknown/unreachable。

Optional capability operations：resume、cancel、send_input、stream、pause、retry、approve、attach、reconnect。每项声明 supported/unsupported/provider_native/emulated。provider capability 描述普遍支持；具体 execution 能否调用由 projection/native check 决定，不新增 ExecutionCapabilities primitive。
