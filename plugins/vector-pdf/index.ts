import { Pdf01Icon } from "@hugeicons/core-free-icons"

import { definePlugin } from "@/sdk"

// Listed so the plugin manager shows where the product is going. It can't be turned
// on until it ships.
export default definePlugin({
  id: "vector-pdf",
  name: "Vector PDF",
  version: "0.0.0",
  description:
    "Import control drawings as vector pieces you can group into live symbols.",
  category: "media",
  icon: Pdf01Icon,
  stage: "planned",
  dependencies: ["media-import"],
})
