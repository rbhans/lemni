"use client"

import { detach, restore } from "./store"

export { restore }

/** Stops this tab's live stream without closing the server-side connection. */
export function disconnectLocal() {
  void detach()
}
