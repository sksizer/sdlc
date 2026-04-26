/**
 * Minimal PhaseState — the shared typed namespace.
 *
 * Self-contained copy for the prototype. Mirrors the production
 * engine/phase-state.ts: keys every entry as `${cls.name}:${id ?? "default"}`.
 */

export interface PayloadClass<T = unknown> {
  readonly name: string;
  new (...args: never[]): T;
}

export class PhaseState {
  private readonly _store = new Map<string, unknown>();

  put(value: object, id?: string): void {
    const key = `${value.constructor.name}:${id ?? "default"}`;
    this._store.set(key, value);
  }

  get<T>(cls: PayloadClass<T>, id?: string): T {
    const key = `${cls.name}:${id ?? "default"}`;
    if (!this._store.has(key)) {
      throw new Error(`PhaseState: no value for ${key}`);
    }
    return this._store.get(key) as T;
  }

  has<T>(cls: PayloadClass<T>, id?: string): boolean {
    return this._store.has(`${cls.name}:${id ?? "default"}`);
  }
}
