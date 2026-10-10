/** The question form, shared by the page shell (walkthrough and end of page) and the question block (centre column). */
import type { Question } from './doc.ts'
import { escapeHtml, prose } from './doc.ts'

/**
 * One question as a form. `inline` means it sits beside the node it is about (the walkthrough section or
 * the centre column), so the "see" link is dropped.
 */
export function renderQuestion(q: Question, inline = false): string {
  const options = q.options ?? []
  const ordered = q.recommended
    ? [...options].sort((a, b) => Number(b.id === q.recommended) - Number(a.id === q.recommended))
    : options
  const type = q.kind === 'multi' ? 'checkbox' : 'radio'
  const inputs =
    q.kind === 'text'
      ? ''
      : ordered
          .map(
            (
              o,
            ) => `<label class="opt"><input type="${type}" name="q-${escapeHtml(q.id)}" value="${escapeHtml(o.id)}" data-question="${escapeHtml(q.id)}">
      <span><span class="opt-label">${escapeHtml(o.label)}${o.id === q.recommended ? ' <em class="rec">recommended</em>' : ''}</span>${o.detail ? `<span class="opt-detail">${escapeHtml(o.detail)}</span>` : ''}</span></label>`,
          )
          .join('')
  const ask =
    q.kind === 'text'
      ? ''
      : `<label class="opt ask"><input type="${type === 'checkbox' ? 'checkbox' : 'radio'}" name="q-${escapeHtml(q.id)}" value="__ask" data-question="${escapeHtml(q.id)}" data-ask>
      <span><span class="opt-label">None of these, or I have a question</span><span class="opt-detail">Say what is missing or unclear; the agent replies here and you choose after.</span></span></label>`
  return `<article class="question" id="q-${escapeHtml(q.id)}" data-question="${escapeHtml(q.id)}">
  <span class="state"></span><p class="prompt">${prose(q.prompt).replace(/^<p>|<\/p>$/g, '')}${q.about && !inline ? ` <a href="#" class="about" data-select="${escapeHtml(q.about)}">↗ see</a>` : ''}</p>
  ${inputs}${ask}
  <textarea rows="2" data-question-note="${escapeHtml(q.id)}" placeholder="${q.kind === 'text' ? 'Your answer' : 'Optional note'}"></textarea>
  <div class="q-foot"><button type="button" class="quiet send" data-send-question="${escapeHtml(q.id)}" hidden>Send to agent</button><span class="sent-mark" hidden></span></div>
  <div class="thread q-thread" hidden></div>
</article>`
}
