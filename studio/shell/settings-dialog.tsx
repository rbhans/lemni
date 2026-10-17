"use client"

import { useEditor, useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

import { PluginBoundary } from "../plugins/plugin-boundary"
import { usePluginRuntime } from "../plugins/runtime"
import { studioState } from "../state"

/** App settings (File → Settings…): pages in a sidebar, plugin sections on each. */
export function SettingsDialog() {
  const editor = useEditor()
  const requested = useValue(studioState.settingsPage)
  const { contributions } = usePluginRuntime()
  const sections = contributions.settingsSections
  const pages = [...new Set(sections.map((section) => section.page))]
  const page =
    requested && pages.includes(requested) ? requested : (pages[0] ?? null)

  const close = () => {
    studioState.settingsPage.set(null)
    requestAnimationFrame(() => editor.focus())
  }

  return (
    <Dialog
      open={requested !== null}
      onOpenChange={(next) => (next ? null : close())}
    >
      <DialogContent className="flex h-[560px] max-h-[calc(100svh-4rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 pt-4 pb-3.5">
          <DialogTitle className="text-base font-semibold">
            Settings
          </DialogTitle>
          <DialogDescription>
            Saved in this browser and applied to every board.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Settings pages"
            className="flex w-44 shrink-0 flex-col gap-0.5 border-r bg-sidebar p-2"
          >
            {pages.map((entry) => (
              <button
                key={entry}
                type="button"
                aria-current={entry === page ? "page" : undefined}
                onClick={() => studioState.settingsPage.set(entry)}
                className={cn(
                  "flex h-7 items-center rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground",
                  entry === page && "bg-muted font-medium text-foreground"
                )}
              >
                {entry}
              </button>
            ))}
          </nav>

          <ScrollArea className="min-h-0 flex-1">
            {page ? (
              <div className="flex flex-col">
                {sections
                  .filter((section) => section.page === page)
                  .map(
                    ({ id, pluginId, title, description, component: Body }) => (
                      <section
                        key={id}
                        className="border-b px-5 py-4 last:border-b-0"
                      >
                        <h3 className="text-[13px] font-semibold">{title}</h3>
                        {description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {description}
                          </p>
                        ) : null}
                        <div className="mt-3">
                          <PluginBoundary pluginId={pluginId}>
                            <Body />
                          </PluginBoundary>
                        </div>
                      </section>
                    )
                  )}
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-xs text-muted-foreground">
                No settings yet. Plugins add theirs here.
              </p>
            )}
          </ScrollArea>
        </div>

        <div className="flex justify-end border-t bg-sidebar px-5 py-3">
          <Button onClick={close}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
