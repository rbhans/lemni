import type { BoardPlugin } from "@/sdk"

import { discoveredPlugins } from "./index.generated"

// Every folder in plugins/ is a plugin (see docs/PLUGINS.md); scripts/plugins.mjs finds
// them and writes index.generated.ts.

const misnamed = discoveredPlugins.filter(
  ({ folder, plugin }) => folder !== plugin.id
)
if (misnamed.length)
  throw new Error(
    misnamed
      .map(
        ({ folder, plugin }) =>
          `plugins/${folder}: the folder name must be the plugin's id ("${plugin.id}").`
      )
      .join("\n")
  )

/**
 * The installed plugins: required ones first, then by id. Contributions are sorted by
 * their `order`; equal orders keep this sequence, so give distinct orders when the
 * position matters.
 */
export const builtinPlugins: readonly BoardPlugin[] = discoveredPlugins
  .map(({ plugin }) => plugin)
  .sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)))
