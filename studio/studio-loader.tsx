"use client"

import dynamic from "next/dynamic"

// The editor touches window, canvas and IndexedDB, so it only renders in the browser.
// Settings saved under the old name move first, before any module reads them.
const Studio = dynamic(
  async () => {
    ;(await import("./lib/storage-migration")).migrateStorage()
    return (await import("./studio")).Studio
  },
  {
    ssr: false,
    loading: () => (
      <div className="grid h-svh place-items-center text-xs text-muted-foreground">
        Loading Lemni…
      </div>
    ),
  }
)

export function StudioLoader() {
  return <Studio />
}
