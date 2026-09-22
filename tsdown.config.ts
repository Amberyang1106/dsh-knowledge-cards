/**
 * Standalone build config for the dsh-knowledge-cards plugin.
 *
 * Uses the repo's shared client-bundle preset (shared/tsdown.client.ts):
 * node-half lib/ (knowledge store + routes + agent tools) plus the browser
 * bundle lib/client.js (closure-factory artifact for the GUI's
 * __ModuleLoader__, CSS Modules inlined with auto-injected <style data-plugin>).
 * The client entry is auto-detected at src/client/index.ts by the preset.
 */
import { clientBundle } from './shared/tsdown.client.ts'

export default clientBundle('@amberyang1106/dsh-knowledge-cards', ['src/index.ts', 'src/host/store.ts', 'src/host/lint.ts', 'src/host/tools.ts', 'src/host/audit.ts', 'src/host/rules.ts', 'src/host/lineage.ts', 'src/host/lineage-config.ts', 'src/host/jev.ts', 'src/core/frontmatter.ts', 'src/core/search.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-host-webserver',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools',
  ],
})
