/** A request walked through ordered candidates; one section per step. */
import type { BlockOut } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import type { TraceBlock } from './types.ts'

type Tone = 'ok' | 'warn' | 'bad' | 'skip'

function tone(outcome: string, map?: TraceBlock['outcomes']): Tone {
  if (map?.[outcome]) return map[outcome]
  const o = outcome.toLowerCase()
  if (/^(chosen|ok|match|selected|hit)$/.test(o)) return 'ok'
  if (/^(error|fail|failed|refused)$/.test(o)) return 'bad'
  if (/^(cooling|warn|degraded|retry)$/.test(o)) return 'warn'
  return 'skip'
}

export function render(b: TraceBlock): BlockOut {
  const rows = b.steps
    .map((s, i) => {
      const t = tone(s.outcome, b.outcomes)
      return `<li class="row trace-step ${t}" data-node="${escapeHtml(s.id)}"><span class="badge">${i + 1}</span><div><div class="title">${escapeHtml(s.label)} <span class="chip tone-${t}">${escapeHtml(s.outcome)}</span></div><div class="sub">${escapeHtml(s.reason)}</div></div></li>`
    })
    .join('')
  const left = `<div class="trace">${b.input ? `<div class="trace-input"><span class="eyebrow">Request</span> ${escapeHtml(b.input)}</div>` : ''}<ol class="rows">${rows}</ol></div>`
  const sections = b.steps.map((s, i) => {
    const t = tone(s.outcome, b.outcomes)
    return {
      id: s.id,
      n: i + 1,
      title: s.label,
      source: s.source,
      html: `<h2>${i + 1}. ${escapeHtml(s.label)}</h2><div class="kicker"><span class="chip tone-${t}">${escapeHtml(s.outcome)}</span> ${escapeHtml(s.reason)}</div>${prose(s.detail)}`,
    }
  })
  return { left, sections }
}

export function check(b: TraceBlock): string[] {
  const errors: string[] = []
  if (!b.steps?.length) errors.push(`trace ${b.id}: needs at least one step`)
  for (const s of b.steps ?? [])
    for (const k of ['label', 'outcome', 'reason'] as const)
      if (!s[k]) errors.push(`trace step ${s.id}: ${k} is required`)
  for (const [k, v] of Object.entries(b.outcomes ?? {}))
    if (!['ok', 'warn', 'bad', 'skip'].includes(v))
      errors.push(`trace ${b.id}: outcome "${k}" must map to ok, warn, bad or skip`)
  const ends = (b.steps ?? []).filter((s) => tone(s.outcome, b.outcomes) === 'ok').length
  if (ends > 1)
    errors.push(`trace ${b.id}: more than one step ends the walk (${ends} with a good outcome)`)
  return errors
}
