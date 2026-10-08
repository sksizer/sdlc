# `solutions/ontological/site-template/` — the docs-site build scaffold (plugin-owned)

This is the generic Astro/Starlight application the SDLC plugin ships so that
consuming projects "carry along" the docs-site build machinery. It is **not**
edited per-consumer and **not** committed into a consumer's repo.

## How it's used

`sdlc docs generate site` **materializes** this directory into the consumer's
docs-site directory (`<docs_site>/`, from `sdlc.yaml`'s `docs_site` key, default
`site`) on every run — overwriting, because it is plugin-owned — and then
generates the content, the nav (`src/generated/sidebar.mjs`), and the site
metadata (`src/generated/site-config.mjs`) alongside it. The consumer then runs
`astro build` in `<docs_site>/`.

So a consumer's `<docs_site>/` only ever **commits**:

- `site.yaml` — the manifest: `site:` metadata (title/description/social/url) +
  `landing:` + ordered `nav:` slots.
- `supplemental/` — hand-written prose pages.

Everything else in `<docs_site>/` (this scaffold, the generated content,
`node_modules`, `dist`) is gitignored.

## Generic by construction

Nothing here names a specific project. `src/styles/seed-skin.css` is the one
file that carries a specific design language's colours. It is a GENERATED
artifact, projected from that language's default seed tokens and committed here
so a consumer without the token package still gets the palette. The repo that
owns the tokens regenerates it with `bun scripts/seed-projection.ts`, and
`--check` guards it in CI: it fails if the file has drifted from the seeds, and
it fails if a projected text pair falls below its contrast minimum. Do not
hand-edit it, and do not add `var(--d-*)` to it: a doc site does not load the
token layer, so the values have to be resolved literals.

`astro.config.mjs` reads the site
title/description/social/url from the generated `src/generated/site-config.mjs`
(emitted from the consumer's `site.yaml` `site:` block), and the nav from the
generated `src/generated/sidebar.mjs`. The ops-discovery helper lives in the
plugin generator (`solutions/ontological/lib/services/docs/list-ops.ts`), runs
plugin-relative, and is not part of this scaffold.

## Customizing

Because this scaffold is overwritten on every generate, edit the site through
its inputs — `site.yaml` (metadata + nav) and `supplemental/` (prose) — not the
files here. A consumer that needs deeper Astro customization can "eject" by
committing its own scaffold and skipping materialization; that is an explicit
opt-out, not the default.

See
[`D-0010-deterministic-site-assembly`](../../docs/planning/decisions/D-0010-deterministic-site-assembly.md).
