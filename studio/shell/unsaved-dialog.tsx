"use client"

import { useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { unsavedPrompt } from "../files/board-files"

/** "Save changes to …?" before a new or opened board replaces the current one. */
export function UnsavedChangesDialog() {
  const prompt = useValue(unsavedPrompt)

  return (
    <Dialog
      open={Boolean(prompt)}
      onOpenChange={(open) => {
        if (!open) prompt?.resolve("cancel")
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save changes to {prompt?.name}?</DialogTitle>
          <DialogDescription>
            This board has changes that aren&apos;t in its file yet. If you
            don&apos;t save, they&apos;re replaced by the board you open.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => prompt?.resolve("cancel")}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => prompt?.resolve("discard")}>
            Don&apos;t save
          </Button>
          <Button onClick={() => prompt?.resolve("save")}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
