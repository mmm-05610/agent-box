// A static stdio MCP server used only to pin which config file a Harness reads.
//
// It answers `initialize` and `tools/list` from memory and never dials
// anything, so a tool reaching the model's tool table proves exactly one thing:
// the client found this server in the configuration file under test.
//
//   node mcp-config-probe-server.mjs
//   MCP_PROBE_TOOL_NAME=other MCP_PROBE_SERVER_NAME=slot node ...
import readline from "node:readline"

const tool = process.env.MCP_PROBE_TOOL_NAME ?? "probe_tool_086"
const server = process.env.MCP_PROBE_SERVER_NAME ?? "agentbox-probe"
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
for await (const line of rl) {
  if (!line.trim()) continue
  const { id, method, params = {} } = JSON.parse(line)
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: {
      protocolVersion: params.protocolVersion ?? "2024-11-05",
      serverInfo: { name: server, version: "1" },
      capabilities: { tools: {} },
    } })
  } else if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: [{
      name: tool,
      description: "Configuration-source probe; does nothing.",
      inputSchema: { type: "object", properties: {} },
    }] } })
  } else if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} })
  } else if (method && !method.startsWith("notifications/") && id !== undefined) {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `unsupported ${method}` } })
  }
}
