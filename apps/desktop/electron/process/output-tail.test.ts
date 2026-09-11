import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { test } from 'vitest'

import { createOutputTail, DEFAULT_OUTPUT_TAIL_LIMIT } from './output-tail'

test('output tail keeps only the most recent bytes once past the limit', () => {
  const tail = createOutputTail(16)

  tail.append('0123456789')
  tail.append('abcdefghij')

  assert.equal(tail.text(), '456789abcdefghij')
  assert.equal(tail.text().length, 16)
})

test('output tail default limit is ~8KB', () => {
  const tail = createOutputTail()

  tail.append('x'.repeat(DEFAULT_OUTPUT_TAIL_LIMIT + 500))

  assert.equal(tail.text().length, DEFAULT_OUTPUT_TAIL_LIMIT)
  assert.equal(DEFAULT_OUTPUT_TAIL_LIMIT, 8192)
})

test('output tail interleaves stdout and stderr attached from spawn time', () => {
  const child = { stderr: new EventEmitter(), stdout: new EventEmitter() }
  const tail = createOutputTail(64)

  tail.attach(child)
  child.stdout.emit('data', Buffer.from('booting\n'))
  child.stderr.emit('data', Buffer.from("ModuleNotFoundError: No module named 'hermes_cli'\n"))

  assert.match(tail.text(), /booting/)
  assert.match(tail.text(), /ModuleNotFoundError/)
})

test('describe() is empty when nothing was captured, formatted when output exists', () => {
  const tail = createOutputTail(64)

  assert.equal(tail.describe(), '')

  tail.append('Traceback (most recent call last):\n')
  assert.match(tail.describe(), /^\nRecent process output:\nTraceback/)
})

test('the noun in describe() is the caller-supplied label, so a caller names its own process kind', () => {
  const tail = createOutputTail(64, 'backend')

  tail.append('Traceback (most recent call last):\n')

  assert.match(tail.describe(), /^\nRecent backend output:\nTraceback/)
})

test('attach tolerates a child with missing stdio streams', () => {
  const tail = createOutputTail(64)

  tail.attach({ stderr: null, stdout: null })
  assert.equal(tail.text(), '')
})
