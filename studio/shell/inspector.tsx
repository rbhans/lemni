"use client"

import { useEditor, useValue, type Editor, type TLShapeId } from "tldraw"

import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { PluginBoundary } from "../plugins/plugin-boundary"
import { usePluginRuntime, type Contributions } from "../plugins/runtime"
import { shapeLabel } from "../lib/shape-labels"
import {
  customShapeName,
  renameShape,
  shapeDisplayName,
} from "../lib/shape-names"
import { studioState } from "../state"
import { InlineName, useInlineEditing } from "./inline-name"

type Summary = {
  title: string
  subtitle: string
  /** Set when exactly one shape is selected: its header name can be edited. */
  shape?: { id: TLShapeId; custom: string; label: string }
}

function summarize(editor: Editor): Summary {
  const shapes = editor.getSelectedShapes()
  if (shapes.length === 0) {
    return {
      title: editor.getCurrentPage().name,
      subtitle: `Page · ${editor.getCurrentPageShapeIds().size} objects`,
    }
  }
  if (shapes.length === 1) {
    const shape = shapes[0]
    return {
      title: shapeDisplayName(shape),
      subtitle: shapeLabel(shape),
      shape: {
        id: shape.id,
        custom: customShapeName(shape) ?? "",
        label: shapeLabel(shape),
      },
    }
  }
  return { title: `${shapes.length} objects`, subtitle: "Multiple selection" }
}

export const INSPECTOR_WIDTH = 296

/** The right-hand properties panel: selection header, tabs, then sections. */
export function Inspector() {
  const editor = useEditor()
  const { contributions } = usePluginRuntime()
  const tabId = useValue(studioState.inspectorTab)
  const summary = useValue("inspector summary", () => summarize(editor), [
    editor,
  ])

  // Tabs can hide themselves (e.g. Behavior isn't offered on Documents pages).
  const tabs = useValue(
    "inspector tabs",
    () =>
      contributions.inspectorTabs.filter((tab) => tab.when?.(editor) ?? true),
    [editor, contributions.inspectorTabs]
  )
  const chosen = tabs.find((tab) => tab.id === tabId) ?? tabs[0]
  // With nothing selected, only sections that apply without a selection show (the
  // next shape's style while drawing, a picked wire), so open on a tab that has one.
  const active = useValue(
    "inspector active tab",
    () => {
      if (!chosen || editor.getSelectedShapeIds().length) return chosen
      const hasContent = (tab: (typeof tabs)[number]) =>
        !tab.component &&
        contributions.inspectorSections.some(
          (section) =>
            section.tab === tab.id && (section.when?.(editor) ?? false)
        )
      return hasContent(chosen) ? chosen : (tabs.find(hasContent) ?? chosen)
    },
    [editor, chosen, tabs, contributions.inspectorSections]
  )

  return (
    <aside
      aria-label="Properties"
      className="flex h-full flex-col border-l bg-background"
      style={{ width: INSPECTOR_WIDTH }}
    >
      <div className="flex flex-col gap-0.5 px-3.5 pt-3 pb-2.5">
        {summary.shape ? (
          <ShapeTitle
            key={summary.shape.id}
            {...summary.shape}
            title={summary.title}
          />
        ) : (
          <span className="truncate text-[13px] font-semibold">
            {summary.title}
          </span>
        )}
        <span className="truncate text-[11px] text-muted-foreground">
          {summary.subtitle}
        </span>
      </div>

      {tabs.length > 1 && active ? (
        <Tabs
          value={active.id}
          onValueChange={(value) => studioState.inspectorTab.set(String(value))}
          className="px-3 pb-2.5"
        >
          <TabsList className="w-full">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
                <TabBadge badge={tab.badge} />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 border-t">
        {active ? (
          active.component ? (
            <PluginBoundary key={active.id} pluginId={active.pluginId}>
              <active.component />
            </PluginBoundary>
          ) : (
            <Sections
              tab={active.id}
              sections={contributions.inspectorSections}
            />
          )
        ) : null}
      </ScrollArea>
    </aside>
  )
}

function TabBadge({ badge }: { badge?: (editor: Editor) => number | null }) {
  const editor = useEditor()
  const count = useValue("tab badge", () => badge?.(editor) ?? null, [
    editor,
    badge,
  ])
  if (!count) return null
  return (
    <Badge className="h-4 min-w-4 rounded-full bg-primary/25 px-1 text-[10px] text-foreground">
      {count}
    </Badge>
  )
}

function Sections({
  tab,
  sections,
}: {
  tab: string
  sections: Contributions["inspectorSections"]
}) {
  const visible = sections.filter((section) => section.tab === tab)
  if (!visible.length) {
    return (
      <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
        Nothing to edit here yet.
      </p>
    )
  }
  return (
    <div className="flex flex-col">
      {visible.map((section) => (
        <SectionGate key={section.id} section={section} />
      ))}
    </div>
  )
}

function SectionGate({
  section,
}: {
  section: Contributions["inspectorSections"][number]
}) {
  const editor = useEditor()
  const show = useValue(
    `show ${section.id}`,
    () => section.when?.(editor) ?? true,
    [editor, section]
  )
  if (!show) return null
  const Body = section.component
  return (
    <section className="border-b px-3 pt-2.5 pb-3 last:border-b-0">
      <div className="mb-2 flex h-5 items-center gap-2">
        <h3 className="flex-1 text-xs font-semibold">{section.title}</h3>
        {section.badge ? (
          <Badge
            variant="secondary"
            className="h-[18px] px-1.5 text-[10.5px] font-normal"
          >
            {section.badge}
          </Badge>
        ) : null}
      </div>
      <PluginBoundary pluginId={section.pluginId}>
        <Body />
      </PluginBoundary>
    </section>
  )
}

/** The selected shape's name; click to rename (empty restores the default label). */
function ShapeTitle({
  id,
  custom,
  label,
  title,
}: {
  id: TLShapeId
  custom: string
  label: string
  title: string
}) {
  const editor = useEditor()
  const rename = useInlineEditing()
  if (rename.editing) {
    return (
      <InlineName
        key={rename.key}
        label="Shape name"
        value={custom}
        placeholder={label}
        editing
        onEditingChange={rename.setEditing}
        onCommit={(name) => renameShape(editor, id, name)}
        inputClassName="h-6 text-[13px] font-semibold"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={rename.start}
      title="Rename"
      className="-mx-1 truncate rounded px-1 text-left text-[13px] font-semibold hover:bg-muted"
    >
      {title}
    </button>
  )
}
