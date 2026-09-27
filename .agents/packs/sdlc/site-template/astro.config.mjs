// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
// AUTO-GENERATED, plugin-owned scaffold — do NOT edit here. This whole Astro app
// is materialized from `solutions/ontological/site-template/` by `sdlc docs generate site` and is
// overwritten on every run. The nav (`sidebar`) and the site metadata
// (`siteConfig`: title / description / social) are generated from the consumer's
// `<docs_site>/site.yaml` — edit THAT to change the site.
import { sidebar } from './src/generated/sidebar.mjs'
import { siteConfig } from './src/generated/site-config.mjs'

// https://astro.build/config
export default defineConfig({
  // Deployed URL (canonical links + sitemap); undefined for local-only builds.
  site: siteConfig.url,
  integrations: [
    starlight({
      title: siteConfig.title,
      description: siteConfig.description,
      social: siteConfig.social,
      // Injects the roster entries into "On this page" for the Appendix
      // pages (see src/routeData.ts).
      routeMiddleware: './src/routeData.ts',
      // The family palette, as resolved literals. Generated from the design
      // system's default seed tokens by `bun scripts/seed-projection.ts` and
      // committed alongside this scaffold, so a consumer that does not have
      // the token package still gets the skin. Unlayered, so it outranks
      // Starlight's own `@layer starlight.base` defaults.
      customCss: ['./src/styles/seed-skin.css'],
      sidebar,
    }),
  ],
})
