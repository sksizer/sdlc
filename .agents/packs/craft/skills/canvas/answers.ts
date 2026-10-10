#!/usr/bin/env -S node --experimental-strip-types
/**
 * canvas answers — read what the reviewer said, wait for more, or reply.
 *
 *   bun answers.ts <id> [dir]                 digest: status, questions, asks, comments
 *   bun answers.ts <id> [dir] --json          the same as JSON
 *   bun answers.ts <id> [dir] --wait          block until something is sent and unanswered, print it, exit 0
 *                                            (a send that arrived before the wait began counts too)
 *                              [--timeout <s>]   exit 3 if nothing arrives in time
 *   bun answers.ts <id> [dir] --notify <cmd>  keep running; each time something new is sent, run <cmd> (a shell line)
 *                              with the same lines on stdin and CANVAS_DOC / CANVAS_DIR in its environment.
 *                              For a harness that cannot wake its session when a background command exits:
 *                              point <cmd> at whatever delivers a message into that session.
 *   bun answers.ts <id> [dir] --reopen           the agent is rewriting: status back to reviewing, verdict cleared, answers kept
 *   bun answers.ts <id> [dir] --reply <comment or question id> --text "…" [--action answered|changed|declined]
 *                              appends the agent's message to that thread; a reviewer follow-up re-arms --wait under the same id
 *                              [--model <model id>] [--harness <harness>]   who answered; harness is guessed from the environment
 *
 * dir defaults to docs/canvas. A reply lands in the sidecar; the open page shows it at once.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import type { Answers, Message } from './lib/doc.ts'
import { emptyAnswers } from './lib/doc.ts'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    json: { type: 'boolean', default: false },
    wait: { type: 'boolean', default: false },
    notify: { type: 'string' },
    timeout: { type: 'string' },
    reopen: { type: 'boolean', default: false },
    reply: { type: 'string' },
    text: { type: 'string' },
    action: { type: 'string' },
    model: { type: 'string' },
    harness: { type: 'string' },
  },
})
const idArg = positionals[0]
if (!idArg) {
  console.error(
    'usage: answers.ts <id> [dir] [--json | --wait | --reopen | --reply <id> --text "…" [--action …]]',
  )
  process.exit(2)
}
const id: string = idArg
const dir = resolve(positionals[1] ?? 'docs/canvas')
const file = join(dir, `${id}.answers.json`)
const docFile = join(dir, `${id}.json`)

function read(): Answers {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Answers) : emptyAnswers(id)
}
function questions(): {
  id: string
  prompt: string
  kind: string
  options?: { id: string; label: string }[]
}[] {
  return existsSync(docFile) ? (JSON.parse(readFileSync(docFile, 'utf8')).questions ?? []) : []
}

interface Item {
  kind: 'comment' | 'ask' | 'verdict'
  id: string
  node: string
  /** The latest reviewer message: the root, or the last follow-up. */
  text: string
  quote?: string | undefined
  /** When the latest reviewer message went to the agent. */
  sent?: string | undefined
  replied: boolean
  /** The root text when the latest message is a follow-up. */
  followUpTo?: string | undefined
}

/** The thread's state: what the reviewer last said and sent, and whether the agent has answered it. */
function latest(root: { text: string; sent?: string | undefined }, replies: Message[] = []) {
  const last = replies[replies.length - 1]
  const mine = [...replies].reverse().find((m) => m.from === 'reviewer')
  return {
    text: mine?.text ?? root.text,
    sent: mine?.sent ?? root.sent,
    replied: !!last && last.from === 'agent',
    followUpTo: mine ? root.text : undefined,
  }
}

function sentItems(a: Answers): Item[] {
  const qs = new Map(questions().map((q) => [q.id, q]))
  const out: Item[] = []
  for (const c of a.comments)
    if (c.sent)
      out.push({
        kind: 'comment',
        id: c.id,
        node: c.node,
        quote:
          c.selector?.type === 'FragmentSelector'
            ? `region ${c.selector.value}`
            : c.selector?.exact,
        ...latest(c, c.replies),
      })
  for (const [qid, ch] of Object.entries(a.choices))
    if (ch.ask && ch.sent)
      out.push({
        kind: 'ask',
        id: qid,
        node: qid,
        quote: qs.get(qid)?.prompt,
        ...latest({ text: ch.ask, sent: ch.sent }, ch.replies),
      })
  // The verdict is a send too: the reviewer finished the round. It stays pending until the agent
  // acts, which clears it with --reopen (a rewrite) or ends the review (approved).
  if (a.finished && a.status !== 'reviewing')
    out.push({
      kind: 'verdict',
      id: 'verdict',
      node: a.status,
      text: a.summary ?? '(no summary)',
      sent: a.finished,
      replied: false,
    })
  return out.sort((x, y) => (x.sent ?? '').localeCompare(y.sent ?? ''))
}

/** One sent item as the agent reads it: where it is, what it quotes, and what the reviewer said. */
function line(i: Item, pad = ''): string {
  if (i.kind === 'verdict') return `${pad}[verdict] ${i.node} at ${i.sent}\n${pad}  ${i.text}`
  const head = `${pad}[${i.kind}] ${i.id} on ${i.node}${i.quote ? ` “${i.quote.slice(0, 80)}”` : ''}`
  const follow = i.followUpTo ? `${pad}  follow-up to “${i.followUpTo.slice(0, 80)}”\n` : ''
  return `${head}\n${follow}${pad}  ${i.text}`
}

function digest(a: Answers): string {
  const qs = questions()
  const lines: string[] = [
    `${id}: status ${a.status}${a.finished && a.status !== 'reviewing' ? ` (finished ${a.finished}${a.summary ? `: ${a.summary}` : ''})` : ''}, updated ${a.updated}`,
  ]
  if (qs.length) {
    lines.push('questions:')
    for (const q of qs) {
      const ch = a.choices[q.id]
      const state = !ch
        ? 'open'
        : ch.ask
          ? `ASKED${ch.sent ? '' : ' (not sent)'}${latest({ text: ch.ask, sent: ch.sent }, ch.replies).replied ? ', replied' : ''}: ${ch.ask}`
          : ch.selected.length || ch.note
            ? `answered: ${ch.selected.map((s) => q.options?.find((o) => o.id === s)?.label ?? s).join(', ')}${ch.note ? ` · ${ch.note}` : ''}`
            : 'open'
      lines.push(`  ${q.id} · ${q.prompt}\n    ${state}`)
    }
  }
  const pending = sentItems(a).filter((i) => !i.replied && i.kind !== 'verdict')
  lines.push(`sent, awaiting reply: ${pending.length}`)
  for (const i of pending) lines.push(line(i, '  '))
  const drafts = a.comments.filter((c) => !c.sent)
  if (drafts.length) lines.push(`unsent comments (still being written): ${drafts.length}`)
  return lines.join('\n')
}

if (values.reopen) {
  const a = read()
  a.status = 'reviewing'
  delete a.finished
  delete a.summary
  a.updated = new Date().toISOString()
  writeFileSync(file, JSON.stringify(a, null, 2) + '\n')
  console.log(`reopened ${id}`)
} else if (values.reply) {
  if (!values.text) {
    console.error('--reply needs --text')
    process.exit(2)
  }
  const a = read()
  const harness =
    values.harness ??
    (process.env.CLAUDECODE
      ? 'claude-code'
      : process.env.CODEX_SANDBOX
        ? 'codex'
        : process.env.CURSOR_TRACE_ID
          ? 'cursor'
          : undefined)
  const model = values.model ?? process.env.CANVAS_MODEL
  const reply: Message = {
    from: 'agent',
    text: values.text,
    at: new Date().toISOString(),
    action: values.action as Message['action'],
    by: model || harness ? { model, harness } : undefined,
  }
  const target = a.comments.find((c) => c.id === values.reply) ?? a.choices[values.reply]
  if (target) (target.replies ??= []).push(reply)
  else {
    console.error(`no comment or asked question with id "${values.reply}"`)
    process.exit(1)
  }
  a.updated = new Date().toISOString()
  writeFileSync(file, JSON.stringify(a, null, 2) + '\n')
  console.log(`replied to ${values.reply}`)
} else if (values.wait || values.notify) {
  // Anything sent and not yet replied to is reported at once, even if it arrived before this
  // process started: the question the watcher answers is "is anything waiting for me?", not
  // "did anything arrive since I began". Replied items are the ones already dealt with.
  const seen = new Set(
    sentItems(read())
      .filter((i) => i.replied)
      .map((i) => `${i.id}@${i.sent}`),
  )
  const check = () => {
    const fresh = sentItems(read()).filter((i) => !seen.has(`${i.id}@${i.sent}`))
    if (!fresh.length) return
    for (const i of fresh) seen.add(`${i.id}@${i.sent}`)
    const text = fresh.map((i) => line(i)).join('\n') + '\n'
    process.stdout.write(text)
    if (!values.notify) process.exit(0)
    // Push mode: hand the lines to the command and keep watching. The command is a shell line so a
    // caller can write `--notify "sdlc session send --cwd ."` or `--notify "tmux send-keys …"`.
    // This is the caller's own command.
    const child = spawn(values.notify, {
      shell: true,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, CANVAS_DOC: id, CANVAS_DIR: dir },
    })
    child.stdin.end(text)
  }
  // The folder catches a create or an atomic rename; the file itself catches an in-place write. Both
  // are armed before the ready line below, so a send that lands the instant a caller sees it is seen.
  watch(dir, (_e, f) => {
    if (f === `${id}.answers.json`) setTimeout(check, 50)
  })
  if (existsSync(file)) watch(file, () => setTimeout(check, 50))
  console.error(
    values.notify
      ? `watching ${id}; each send runs: ${values.notify}`
      : `waiting for the reviewer to send something on ${id}…`,
  )
  check()
  if (values.timeout) {
    const ms = Number(values.timeout) * 1000
    setTimeout(() => {
      console.error(`nothing sent on ${id} in ${values.timeout}s`)
      process.exit(3)
    }, ms).unref()
  }
} else {
  const a = read()
  console.log(
    values.json
      ? JSON.stringify({ ...a, pending: sentItems(a).filter((i) => !i.replied) }, null, 2)
      : digest(a),
  )
}
