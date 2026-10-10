/**
 * Syntax colouring for the servlet's code view: a small tokenizer per language family, no
 * dependencies. It returns one HTML string per source line, so the view keeps a row per line
 * (line links, `#L12-L20` ranges) and a token that spans lines (a block comment, a template
 * string) is closed at each line end and reopened on the next. Tokens only wrap text in spans;
 * the text itself is unchanged, so quotes anchored in it still resolve.
 *
 * Classes: tk-cm comment, tk-str string, tk-num number, tk-kw keyword, tk-ty type or section,
 * tk-fn called function, tk-key object key or property, tk-var variable or decorator, tk-tag tag.
 */
import { escapeHtml } from './doc.ts'

type Rule = [RegExp, string]

const kw = (words: string, flags = '') =>
  new RegExp(`\\b(?:${words.trim().split(/\s+/).join('|')})\\b`, `y${flags}`)

const NUMBER: Rule = [/0[xXbBoO][\da-fA-F_]+n?|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?n?/y, 'num']
const DQ: Rule = [/"(?:\\.|[^"\\\n])*"?/y, 'str']
const SQ: Rule = [/'(?:\\.|[^'\\\n])*'?/y, 'str']
const BLOCK_COMMENT: Rule = [/\/\*[\s\S]*?(?:\*\/|$)/y, 'cm']
const SLASH_COMMENT: Rule = [/\/\/.*/y, 'cm']
const HASH_COMMENT: Rule = [/#.*/y, 'cm']
const TYPE: Rule = [/[A-Z][A-Za-z0-9_]*\b/y, 'ty']
const CALL: Rule = [/[A-Za-z_$][\w$]*(?=\s*\()/y, 'fn']
const WORD: Rule = [/[A-Za-z_$][\w$]*/y, '']

// A regex literal where an expression starts (after `(`, `=`, `,`, an operator, `return`, or at a
// line start), so a quote inside it is not taken for a string; elsewhere `/` is division.
const REGEX: Rule = [
  /(?<=(?:^|[(,=:[!&|?{};+\-*%<>~^]|\breturn|\btypeof)\s*)\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[dgimsuyv]*/my,
  'str',
]

const C_LIKE = (keywords: string): Rule[] => [
  BLOCK_COMMENT,
  SLASH_COMMENT,
  REGEX,
  [/`(?:\\.|[^`\\])*`?/y, 'str'],
  DQ,
  SQ,
  [kw(keywords), 'kw'],
  NUMBER,
  TYPE,
  CALL,
  WORD,
]

const TS =
  C_LIKE(`import export from as const let var function return if else for while do switch case
  break continue new class extends implements interface type enum namespace declare async await yield
  try catch finally throw typeof instanceof in of void delete null undefined true false this super
  default static readonly private public protected abstract keyof satisfies get set`)
const RUST =
  C_LIKE(`fn let mut const static pub crate mod use self Self super struct enum impl trait
  where for in loop while if else match return break continue as ref move async await dyn unsafe
  extern type true false Some None Ok Err`)
const GO = C_LIKE(`package import func var const type struct interface map chan go defer select
  return if else for range switch case default break continue fallthrough goto nil true false`)
const PY: Rule[] = [
  HASH_COMMENT,
  [/(?:[rRbBuUfF]{0,2})(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))/y, 'str'],
  [/(?:[rRbBuUfF]{0,2})"(?:\\.|[^"\\\n])*"?/y, 'str'],
  [/(?:[rRbBuUfF]{0,2})'(?:\\.|[^'\\\n])*'?/y, 'str'],
  [/@[\w.]+/y, 'var'],
  [
    kw(`def class return if elif else for while in not and or is import from as with try except
      finally raise pass break continue lambda yield global nonlocal assert del async await
      None True False self`),
    'kw',
  ],
  NUMBER,
  TYPE,
  CALL,
  WORD,
]
const SH: Rule[] = [
  [/(?:^|(?<=\s))#.*/y, 'cm'],
  DQ,
  SQ,
  [/\$\{[^}\n]*\}?|\$[\w@*#?$!-]/y, 'var'],
  [
    kw(`if then else elif fi for in do done while until case esac function return local export
      set unset readonly shift exit echo cd source`),
    'kw',
  ],
  NUMBER,
  [/[\w./-]+/y, ''],
]
const SQL: Rule[] = [
  [/--.*/y, 'cm'],
  BLOCK_COMMENT,
  SQ,
  [/"(?:[^"\n])*"?/y, 'key'],
  [
    kw(
      `select from where group by having order limit offset join left right inner outer full
      cross on as and or not in is null case when then else end with recursive union all
      exists insert into values update set delete create alter drop table index view type
      enum column add constraint references primary key foreign default check returning asc
      desc distinct over partition rows between true false`,
      'i',
    ),
    'kw',
  ],
  NUMBER,
  CALL,
  WORD,
]
const JSON_RULES: Rule[] = [
  [/"(?:\\.|[^"\\\n])*"(?=\s*:)/y, 'key'],
  DQ,
  [kw('true false null'), 'kw'],
  [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y, 'num'],
]
const YAML: Rule[] = [
  [/(?:^|(?<=\s))#.*/y, 'cm'],
  [/(?<=^\s*(?:-\s+)?)[\w.$-]+(?=\s*:(?:\s|$))/my, 'key'],
  DQ,
  SQ,
  [/[&*][\w-]+/y, 'var'],
  [kw('true false null yes no on off'), 'kw'],
  [/-?\d+(?:\.\d+)?(?=\s*(?:#|$))/my, 'num'],
  [/[\w./-]+/y, ''],
]
const TOML: Rule[] = [
  HASH_COMMENT,
  [/(?<=^\s*)\[\[?[^\]\n]*\]\]?/my, 'ty'],
  [/(?<=^\s*)[\w.-]+(?=\s*=)/my, 'key'],
  [/"""[\s\S]*?(?:"""|$)/y, 'str'],
  DQ,
  SQ,
  [kw('true false'), 'kw'],
  NUMBER,
  [/[\w.-]+/y, ''],
]
const CSS: Rule[] = [
  BLOCK_COMMENT,
  DQ,
  SQ,
  [/@[\w-]+/y, 'kw'],
  [/#[\da-fA-F]{3,8}\b/y, 'num'],
  [/-?\d*\.?\d+(?:%|[a-z]+)?/y, 'num'],
  [/--?[\w-]+(?=\s*:)/y, 'key'],
  [/[\w-]+(?=\()/y, 'fn'],
  [/[\w-]+/y, ''],
]
const HTML: Rule[] = [
  [/<!--[\s\S]*?(?:-->|$)/y, 'cm'],
  [/<\/?[\w-]+|\/?>/y, 'tag'],
  [/[:@]?[\w.:-]+(?==)/y, 'key'],
  DQ,
  SQ,
  [/[^<>"'=\s]+/y, ''],
]
const MD: Rule[] = [
  [/(?<=^)#{1,6} .*/my, 'kw'],
  [/(?<=^)(?:```|~~~).*/my, 'cm'],
  [/(?<=^)---$/my, 'cm'],
  [/`[^`\n]+`/y, 'str'],
  [/\[\[[^\]\n]+\]\]/y, 'key'],
  [/\[[^\]\n]*\]\([^)\n]*\)/y, 'fn'],
  [/\*\*[^*\n]+\*\*/y, 'ty'],
  [/[\w'-]+/y, ''],
]

const BY_EXT: Record<string, Rule[]> = {
  ts: TS,
  tsx: TS,
  mts: TS,
  cts: TS,
  js: TS,
  jsx: TS,
  mjs: TS,
  cjs: TS,
  java: TS,
  kt: TS,
  swift: TS,
  c: TS,
  h: TS,
  cpp: TS,
  cs: TS,
  rs: RUST,
  go: GO,
  py: PY,
  sh: SH,
  bash: SH,
  zsh: SH,
  fish: SH,
  sql: SQL,
  json: JSON_RULES,
  jsonc: TS,
  json5: TS,
  yaml: YAML,
  yml: YAML,
  toml: TOML,
  css: CSS,
  scss: CSS,
  html: HTML,
  htm: HTML,
  xml: HTML,
  svg: HTML,
  vue: HTML,
  md: MD,
}
const BY_NAME: Record<string, Rule[]> = {
  Dockerfile: SH,
  Makefile: SH,
  justfile: SH,
  '.gitignore': SH,
  '.env.example': SH,
}

/** The source as one HTML string per line, coloured by the file's language; plain escaped text when it has none. */
export function highlightLines(text: string, rel: string): string[] {
  const name = rel.split('/').pop()!
  const rules = BY_NAME[name] ?? BY_EXT[name.split('.').pop()!.toLowerCase()]
  const lines: string[] = ['']
  const emit = (s: string, cls: string) => {
    s.split('\n').forEach((part, i) => {
      if (i) lines.push('')
      if (part)
        lines[lines.length - 1] += cls
          ? `<span class="tk-${cls}">${escapeHtml(part)}</span>`
          : escapeHtml(part)
    })
  }
  if (!rules) {
    emit(text, '')
    return lines
  }
  let i = 0
  let plain = ''
  outer: while (i < text.length) {
    for (const [re, cls] of rules) {
      re.lastIndex = i
      const m = re.exec(text)
      if (m && m[0].length) {
        if (plain) {
          emit(plain, '')
          plain = ''
        }
        emit(m[0], cls)
        i += m[0].length
        continue outer
      }
    }
    plain += text[i++]
  }
  if (plain) emit(plain, '')
  return lines
}
