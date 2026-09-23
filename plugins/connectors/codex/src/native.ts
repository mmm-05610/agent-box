// Stdio framing follows the Codex App Server example for codex-cli 0.155.1:
// https://learn.chatgpt.com/docs/app-server . Protocol methods stay in the renderer adapter.
import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import path from 'node:path'
import type { NativeConnection, NativeTransport } from '../../../../platform/native-bridge/src/index'

const MAX_LINE = 1024 * 1024
export default function createTransport(): NativeTransport {
  return {
    async open(onFrame): Promise<NativeConnection> {
      const cwd = process.env.ORDESSA_AGENT_CWD
      if (!cwd || !path.isAbsolute(cwd)) throw Error('Set ORDESSA_AGENT_CWD to an absolute agent workspace path')
      const child = spawn('codex', ['app-server', '--stdio'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      let closed = false
      let buffer = ''
      const decoder = new StringDecoder('utf8')
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += decoder.write(chunk)
        if (buffer.length > MAX_LINE) { onFrame({ type: 'protocol-error', message: 'Frame too large' }); void stop(); return }
        for (;;) {
          const newline = buffer.indexOf('\n')
          if (newline < 0) break
          const line = buffer.slice(0, newline).replace(/\r$/, '')
          buffer = buffer.slice(newline + 1)
          if (!line) continue
          try { onFrame(JSON.parse(line)) }
          catch { onFrame({ type: 'protocol-error', message: 'Malformed App Server frame' }) }
        }
      })
      // Never forward stderr: CLI diagnostics may contain paths or account details.
      child.stderr.resume()
      child.once('exit', (code, signal) => { closed = true; onFrame({ type: 'exit', code, signal }) })
      const stop = async () => {
        if (closed) return
        closed = true
        child.kill('SIGTERM')
        await Promise.race([
          new Promise<void>(resolve => child.once('exit', () => resolve())),
          new Promise<void>(resolve => setTimeout(resolve, 1000)),
        ])
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      return {
        async send(frame) {
          if (closed) throw Error('Codex transport closed')
          const line = JSON.stringify(frame)
          if (!line || line.length > MAX_LINE) throw Error('Invalid Codex frame')
          await new Promise<void>((resolve, reject) => child.stdin.write(line + '\n', error => error ? reject(error) : resolve()))
        },
        close: stop,
      }
    },
  }
}
