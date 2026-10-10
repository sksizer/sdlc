/** Phases, workstreams and tasks as a tree on the left; one section per phase, workstream and task. */
import type { BlockOut, Section } from '../lib/doc.ts'
import { escapeHtml, prose } from '../lib/doc.ts'
import type { PlanBlock, PlanStatus } from './types.ts'

const STATUSES: PlanStatus[] = ['todo', 'doing', 'done', 'blocked']

function meta(x: { status?: PlanStatus; milestone?: string; gate?: string }): string {
  const parts = [
    x.status ? `<span class="chip st-${x.status}">${x.status}</span>` : '',
    x.milestone ? `<span class="chip">${escapeHtml(x.milestone)}</span>` : '',
    x.gate ? `<span class="gate" title="gate">⚑ ${escapeHtml(x.gate)}</span>` : '',
  ].filter(Boolean)
  return parts.length ? `<span class="chips">${parts.join('')}</span>` : ''
}

export function render(b: PlanBlock): BlockOut {
  let n = 0
  const sections: Section[] = []
  const left = b.phases
    .map((ph) => {
      sections.push({
        id: ph.id,
        title: ph.label,
        source: ph.source,
        html: `<h2>${escapeHtml(ph.label)}</h2><div class="kicker">${meta(ph)}</div>${prose(ph.detail)}`,
      })
      const streams = ph.workstreams
        .map((ws) => {
          sections.push({
            id: ws.id,
            title: ws.label,
            source: ws.source,
            html: `<h2>${escapeHtml(ws.label)}</h2><p class="muted">in ${escapeHtml(ph.label)}</p>${prose(ws.detail)}`,
          })
          const tasks = ws.tasks
            .map((t) => {
              n += 1
              sections.push({
                id: t.id,
                n,
                title: t.label,
                source: t.source,
                html: `<h2>${n}. ${escapeHtml(t.label)}</h2><div class="kicker">${meta(t)}</div>${prose(t.detail)}`,
              })
              return `<li class="row task ${t.status ?? ''}" data-node="${escapeHtml(t.id)}"><span class="badge">${n}</span><div><div class="title">${escapeHtml(t.label)}</div><div class="sub">${meta(t)}</div></div></li>`
            })
            .join('')
          return `<div class="ws"><div class="ws-title" data-node="${escapeHtml(ws.id)}">${escapeHtml(ws.label)}</div><ol class="rows">${tasks}</ol></div>`
        })
        .join('')
      return `<div class="group phase"><h2 data-node="${escapeHtml(ph.id)}">${escapeHtml(ph.label)} ${meta(ph)}</h2>${prose(ph.detail)}${streams}</div>`
    })
    .join('')
  return { left: `<div class="plan">${left}</div>`, sections }
}

export function check(b: PlanBlock): string[] {
  const errors: string[] = []
  if (!b.phases?.length) errors.push(`plan ${b.id}: needs at least one phase`)
  const status = (s: PlanStatus | undefined, where: string) => {
    if (s && !STATUSES.includes(s))
      errors.push(`plan ${b.id}: ${where} status must be todo, doing, done or blocked`)
  }
  for (const ph of b.phases ?? []) {
    if (!ph.label) errors.push(`plan ${b.id}: phase ${ph.id} needs a label`)
    status(ph.status, `phase ${ph.id}`)
    if (!ph.workstreams?.length)
      errors.push(`plan ${b.id}: phase ${ph.id} needs at least one workstream`)
    for (const ws of ph.workstreams ?? []) {
      if (!ws.label) errors.push(`plan ${b.id}: workstream ${ws.id} needs a label`)
      if (!ws.tasks?.length)
        errors.push(`plan ${b.id}: workstream ${ws.id} needs at least one task`)
      for (const t of ws.tasks ?? []) {
        if (!t.label) errors.push(`plan ${b.id}: task ${t.id} needs a label`)
        status(t.status, `task ${t.id}`)
      }
    }
  }
  return errors
}
