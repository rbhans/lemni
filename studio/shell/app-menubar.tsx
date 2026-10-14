"use client"

import { Fragment } from "react"
import { useActions, useEditor, useValue } from "tldraw"

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar"

import { formatKbd } from "../lib/kbd"
import { usePluginRuntime } from "../plugins/runtime"
import type { MenuId, MenuItemContribution } from "../plugins/types"
import { useStudioContext } from "../studio-context"

export const MENUS: { id: MenuId; label: string }[] = [
  { id: "file", label: "File" },
  { id: "edit", label: "Edit" },
  { id: "object", label: "Object" },
  { id: "arrange", label: "Arrange" },
  { id: "view", label: "View" },
  { id: "insert", label: "Insert" },
  { id: "window", label: "Window" },
  { id: "help", label: "Help" },
]

export function AppMenubar() {
  const { contributions } = usePluginRuntime()

  return (
    <Menubar className="h-8 border-0 bg-transparent p-0 shadow-none">
      {MENUS.map((menu) => {
        const items = contributions.menuItems.filter(
          (item) => item.menu === menu.id
        )
        if (!items.length) return null
        const groups = [...new Set(items.map((item) => item.group))]
        return (
          <MenubarMenu key={menu.id}>
            <MenubarTrigger className="h-7 px-2 font-normal">
              {menu.label}
            </MenubarTrigger>
            <MenubarContent className="min-w-56">
              {groups.map((group, index) => (
                <Fragment key={group}>
                  {index > 0 ? <MenubarSeparator /> : null}
                  {items
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <MenuEntry key={item.id} item={item} />
                    ))}
                </Fragment>
              ))}
            </MenubarContent>
          </MenubarMenu>
        )
      })}
    </Menubar>
  )
}

function MenuEntry({ item }: { item: MenuItemContribution }) {
  const editor = useEditor()
  const actions = useActions()
  const ctx = useStudioContext()
  const action = item.action ? actions[item.action] : undefined
  const checked = useValue(
    `menu ${item.id} checked`,
    () => item.checked?.(editor),
    [editor, item]
  )
  const disabled = useValue(
    `menu ${item.id} disabled`,
    () => item.disabled?.(editor) ?? false,
    [editor, item]
  )

  if (item.action && !action) return null

  const run = () => {
    if (item.onSelect) item.onSelect(ctx)
    else void action?.onSelect("menu")
    // Menus live outside the canvas; hand keyboard focus back to it.
    requestAnimationFrame(() => editor.focus())
  }
  const keys = formatKbd(item.kbd ?? action?.kbd)
  const shortcut = keys.length ? (
    <MenubarShortcut>{keys.join("")}</MenubarShortcut>
  ) : null

  if (checked !== undefined) {
    return (
      <MenubarCheckboxItem
        checked={checked}
        disabled={disabled}
        onCheckedChange={run}
      >
        {item.label}
        {shortcut}
      </MenubarCheckboxItem>
    )
  }
  return (
    <MenubarItem disabled={disabled} onClick={run}>
      {item.label}
      {shortcut}
    </MenubarItem>
  )
}
