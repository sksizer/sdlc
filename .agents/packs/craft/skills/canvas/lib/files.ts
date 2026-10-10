/**
 * Files of the project the servlet runs in: find the project root, list the files it may serve and
 * resolve a `[[wikilink]]` to a `.md` among them. The servlet uses this for `/f/<path>` and
 * `/resolve`; `lib/file-view.ts` renders what it hands back.
 *
 * Only files git lists for the checkout are served (tracked, plus untracked ones not ignored), so
 * an untracked `.env`, `node_modules` and build output stay out, but a committed secret is served
 * like any other tracked file; `--host 0.0.0.0` has no auth. Outside a git checkout nothing is
 * served. A symlink is served only when it resolves to a file inside the project. Images and PDFs
 * are served as themselves (up to 25 MB); other binary files and text over 1 MB are refused.
 */
import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve, sep } from 'node:path'

/** The nearest folder at or above `from` holding `.git` (a directory or a worktree's file); `from` if none. */
export function projectRoot(from: string): string {
  let d = resolve(from)
  for (;;) {
    try {
      statSync(join(d, '.git'))
      return d
    } catch {}
    const up = dirname(d)
    if (up === d) return resolve(from)
    d = up
  }
}

/** An entity ID such as `D-XCXA`, `M-D2I1`, `DR-8JAH` or `D-0018`. */
const ENTITY_ID = /^[A-Z]{1,3}-[A-Z0-9]{4}$/
const MAX_TEXT = 1024 * 1024
const MAX_MEDIA = 25 * 1024 * 1024

/** Files the browser shows itself; served raw with this content type. */
export const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
}

/** Every file git lists for `root`, repo-relative; undefined when `root` is not a git checkout. */
function listFiles(root: string): string[] | undefined {
  try {
    // Deliberate exception to the repo's command-seam rule: this skill is dependency-free, so it
    // cannot import the seam. Synchronous, but ProjectFiles rate-limits it to one call per two
    // seconds; argv-only, no shell, read-only.
    const out = execFileSync(
      'git',
      ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return [...new Set(out.split('\0').filter(Boolean))]
  } catch {
    return undefined
  }
}

/** True when the first 8 KB hold a NUL byte, the usual sign of a binary file. */
function looksBinary(file: string): boolean {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(8192)
    return buf.subarray(0, readSync(fd, buf, 0, buf.length, 0)).includes(0)
  } finally {
    closeSync(fd)
  }
}

/**
 * The servable files of one project. The list is built on first use and rebuilt when a lookup
 * misses (at most every two seconds), so a file written after the servlet started is found.
 *
 * `[[name]]` resolves to a `.md` only. A name with a project prefix (`[[slug:ID]]`) points at
 * another repo and never resolves. A path-style name is tried beside the linking file, then from
 * the root. A bare name matches a file of that name; a bare entity ID matches `<ID>-<slug>.md`.
 * When two files match, the one under `docs/` wins, then the shortest path.
 */
export class ProjectFiles {
  #all: Set<string> | undefined
  #md: Map<string, string[]> | undefined
  #builtAt = 0
  #listed = false
  readonly root: string
  constructor(root: string) {
    this.root = root
  }

  #build() {
    const list = listFiles(this.root)
    this.#listed = list !== undefined
    this.#all = new Set(list)
    this.#md = new Map()
    for (const rel of this.#all) {
      if (!rel.endsWith('.md')) continue
      const key = rel.split('/').pop()!.slice(0, -3)
      this.#md.set(key, [...(this.#md.get(key) ?? []), rel])
    }
    this.#builtAt = Date.now()
  }

  /** False when the root is not a git checkout, so nothing is served. */
  get listed(): boolean {
    if (!this.#all) this.#build()
    return this.#listed
  }

  /** Run `look`; when it misses, rebuild the list once (rate-limited) and run it again. */
  #withRetry<T>(look: () => T | undefined): T | undefined {
    if (!this.#all) this.#build()
    const hit = look()
    if (hit !== undefined || Date.now() - this.#builtAt < 2000) return hit
    this.#build()
    return look()
  }

  /**
   * A servable file: its absolute path and, for an image or PDF, the content type to serve it
   * raw with. Undefined when git does not list it, it resolves (through a symlink) outside the
   * project, or it is binary and not media, or too large.
   */
  file(rel: string): { path: string; media?: string } | undefined {
    const norm = posix.normalize(rel)
    if (norm.startsWith('/') || norm.split('/').includes('..')) return undefined
    if (!this.#withRetry(() => (this.#all!.has(norm) ? true : undefined))) return undefined
    const media = MEDIA_TYPES[norm.split('.').pop()!.toLowerCase()]
    try {
      const realRoot = realpathSync(this.root)
      const path = realpathSync(join(this.root, norm))
      if (!path.startsWith(realRoot + sep)) return undefined
      const size = statSync(path).size
      if (media) return size > MAX_MEDIA ? undefined : { path, media }
      if (size > MAX_TEXT || looksBinary(path)) return undefined
      return { path }
    } catch {
      return undefined
    }
  }

  /** `from` is the repo-relative folder of the file holding the link. */
  resolve(name: string, from = ''): string | undefined {
    const key = name.split('|')[0]!.split('#')[0]!.trim()
    if (!key || key.includes(':')) return undefined
    if (key.endsWith('.md')) {
      for (const base of [from, '']) {
        const rel = posix.normalize(posix.join(base, key))
        if (this.#withRetry(() => (this.#all!.has(rel) ? rel : undefined))) return rel
      }
    }
    const base = key.replace(/\.md$/, '').split('/').pop()!
    return this.#withRetry(() => this.#lookup(base))
  }

  #lookup(base: string): string | undefined {
    let list = this.#md!.get(base)
    if (!list?.length && ENTITY_ID.test(base))
      list = [...this.#md!].filter(([k]) => k.startsWith(`${base}-`)).flatMap(([, v]) => v)
    if (!list?.length) return undefined
    return [...list].sort(
      (a, b) =>
        Number(!a.startsWith('docs/')) - Number(!b.startsWith('docs/')) || a.length - b.length,
    )[0]
  }
}
