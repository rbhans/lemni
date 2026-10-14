import { Pdf01Icon } from "@hugeicons/core-free-icons"

import type { BoardPlugin } from "@/studio/plugins/types"

// Listed so the plugin manager shows where the product is going. They cannot be
// turned on until they ship.
export const vectorPdf: BoardPlugin = {
  id: "vector-pdf",
  name: "Vector PDF",
  version: "0.0.0",
  description:
    "Import control drawings as vector pieces you can group into live symbols.",
  category: "media",
  icon: Pdf01Icon,
  stage: "planned",
  dependencies: ["media-import"],
}
