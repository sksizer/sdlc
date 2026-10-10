/**
 * Questions in the centre column, at the point in the reading they belong to. Each question is a node;
 * the block itself is one too, with a compact walkthrough row that exists for comments on its words.
 */
import type { BlockOut, Question } from '../lib/doc.ts'
import { questionMarkdown } from '../lib/markdown.ts'
import { renderQuestion } from '../lib/question.ts'
import type { QuestionBlock } from './types.ts'

export function render(b: QuestionBlock): BlockOut {
  const title = b.title ?? (b.questions[0]?.prompt ?? b.id).split(/\s+/).slice(0, 6).join(' ')
  return {
    left: `<div class="ask-block">${b.questions.map((q) => renderQuestion(q, true)).join('')}</div>`,
    sections: [{ id: b.id, title, html: '' }],
  }
}

export function check(b: QuestionBlock): string[] {
  return b.questions?.length ? [] : [`question ${b.id}: needs at least one question`]
}

/** The questions this block places; compose validates and numbers them with the rest. */
export function questions(b: QuestionBlock): Question[] {
  return b.questions
}

export function markdown(b: QuestionBlock): string {
  return b.questions.map((q, i) => questionMarkdown(q, i + 1)).join('\n')
}
