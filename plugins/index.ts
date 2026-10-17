import type { BoardPlugin } from "@/studio/plugins/types"

import { assistant } from "./assistant"
import { behaviors } from "./behaviors"
import { canvasBackgroundsPlugin } from "./canvas-backgrounds"
import { canvasCore } from "./canvas-core"
import { charts } from "./charts"
import { hvacSymbols } from "./hvac-symbols"
import { links } from "./links"
import { niagaraBaskstream } from "./niagara-baskstream"
import { penShapes } from "./pen-shapes"
import { mediaImport } from "./media-import"
import { metasysSct } from "./metasys-sct"
import { vectorPdf } from "./roadmap"
import { tables } from "./tables"
import { uiElements } from "./ui-elements"
import { webView } from "./web-view"

/** Built-in plugins, in the order their contributions are merged. */
export const builtinPlugins: readonly BoardPlugin[] = [
  canvasCore,
  canvasBackgroundsPlugin,
  penShapes,
  hvacSymbols,
  behaviors,
  links,
  mediaImport,
  niagaraBaskstream,
  metasysSct,
  assistant,
  charts,
  tables,
  uiElements,
  vectorPdf,
  webView,
]
