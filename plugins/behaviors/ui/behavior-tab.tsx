"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Add01Icon,
  Alert02Icon,
  ArrowDown01Icon,
  Delete02Icon,
  ZapIcon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { useEditor, useValue, type TLShapeId } from "tldraw"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  kindOfValue,
  useLivePoint,
  type PointKind,
} from "@/studio/data/live-points"
import { getShapeStates } from "@/studio/editor/shape-states"
import { Segmented, SelectField } from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"

import {
  EFFECT_ORDER,
  findConflict,
  adaptMapping,
  defaultsFor,
  getEffect,
  numberMappingFor,
  stateDefaults,
  type EffectDef,
  type StateOption,
  type ValueKind,
} from "../core/effects"
import {
  DEFAULT_TRANSITION,
  newBehaviorId,
  type Behavior,
  type Mapping,
  type ParamValue,
  type PointRef,
} from "../core/model"
import { composePresentation, type Problem } from "../core/presentation"
import {
  collectOwners,
  readValue,
  savedBehaviors,
  writeBehaviors,
} from "../runtime/shapes"
import { pendingAdd, setDraft, setTestValue } from "../runtime/state"
import { EFFECT_UI, FAMILIES, FAMILY_TONE } from "./effect-ui"
import {
  caseLabel,
  ParamField,
  RangeEditor,
  Row,
  SectionLabel,
  StatesEditor,
  SwitchEditor,
  TestControl,
} from "./editors"
import {
  LiveValueBadge,
  PointField,
  pointName,
} from "@/studio/data/point-field"

export function BehaviorTab() {
  const editor = useEditor()
  const selection = useValue(
    "behavior selection",
    () => {
      const ids = editor.getSelectedShapeIds()
      return ids.length === 1 ? ids[0] : ids.length > 1 ? "multi" : null
    },
    [editor]
  )

  if (selection === null) {
    return (
      <Empty className="m-3 border border-dashed p-5">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon icon={ZapIcon} />
          </EmptyMedia>
          <EmptyTitle>Select a shape</EmptyTitle>
          <EmptyDescription>
            Behaviors make a shape respond to live values: color, motion, labels
            and more. Drag a point from the Station panel onto a shape to start.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  if (selection === "multi") {
    return (
      <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
        Select one shape to edit its behaviors.
      </p>
    )
  }
  return <ShapeBehaviors key={selection} shapeId={selection} />
}

type Editing = { draft: Behavior; isNew: boolean }

function ShapeBehaviors({ shapeId }: { shapeId: TLShapeId }) {
  const editor = useEditor()
  const saved = useValue(
    "saved behaviors",
    () => savedBehaviors(editor.getShape(shapeId)).behaviors,
    [editor, shapeId]
  )
  const locked = useValue(
    "shape locked",
    () => editor.isShapeOrAncestorLocked(shapeId),
    [editor, shapeId]
  )
  // States the shape exposes (symbols), for the Symbol state effect.
  const states = useValue(
    "shape states",
    () => getShapeStates(editor, editor.getShape(shapeId)),
    [editor, shapeId]
  )
  const [editing, setEditing] = useState<Editing | null>(null)
  // A point dropped on this shape waits here until an effect is picked.
  const pending = useValue(pendingAdd)
  const chooser = pending?.shapeId === shapeId ? pending : null

  // Unsaved edits preview on the canvas.
  useEffect(() => {
    if (!editing) {
      setDraft(shapeId, undefined)
      return
    }
    const list = editing.isNew
      ? [...saved, editing.draft]
      : saved.map((b) => (b.id === editing.draft.id ? editing.draft : b))
    setDraft(shapeId, list)
  }, [editing, saved, shapeId])
  useEffect(() => () => setDraft(shapeId, undefined), [shapeId])

  const problems = useValue(
    "behavior problems",
    () => {
      const self = collectOwners(editor, shapeId).filter(
        (owner) => owner.frame.isSelf
      )
      return composePresentation(self, readValue).problems
    },
    [editor, shapeId]
  )

  const start = (
    effect: string,
    ref: PointRef | null,
    kind: PointKind | null
  ) => {
    const def = getEffect(effect)
    if (!def) return
    const { mapping, params } = defaultsFor(def, kind, { states })
    pendingAdd.set(null)
    setEditing({
      isNew: true,
      draft: {
        id: newBehaviorId(),
        v: 1,
        effect,
        enabled: true,
        source: def.needsSource ? ref : null,
        mapping,
        conditions: [],
        params,
        transition: DEFAULT_TRANSITION,
      },
    })
  }

  const close = () => {
    if (editing) setTestValue(editing.draft.id, undefined)
    setEditing(null)
  }

  const save = (draft: Behavior) => {
    const next = editing?.isNew
      ? [...saved, draft]
      : saved.map((b) => (b.id === draft.id ? draft : b))
    writeBehaviors(editor, shapeId, next, "save behavior")
    setTestValue(draft.id, undefined)
    setEditing(null)
  }

  const toggle = (behavior: Behavior) => {
    const next = { ...behavior, enabled: !behavior.enabled }
    const conflict = findConflict(saved, next)
    if (conflict) {
      toast.error(
        `Turn off “${titleOf(conflict)}” first. Only one ${getEffect(next.effect)?.label.toLowerCase()} can run at a time.`
      )
      return
    }
    writeBehaviors(
      editor,
      shapeId,
      saved.map((b) => (b.id === behavior.id ? next : b)),
      next.enabled ? "turn on behavior" : "turn off behavior"
    )
  }

  const remove = (behavior: Behavior) => {
    writeBehaviors(
      editor,
      shapeId,
      saved.filter((b) => b.id !== behavior.id),
      "delete behavior"
    )
    setTestValue(behavior.id, undefined)
    setEditing(null)
  }

  if (locked) {
    return (
      <p className="px-3.5 py-6 text-center text-xs text-muted-foreground">
        This shape is locked. Unlock it to edit its behaviors.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <AddBehaviorMenu
        disabled={Boolean(editing)}
        hasStates={states.length > 0}
        onPick={(effect) => start(effect, null, null)}
      />

      {chooser ? (
        <EffectChooser
          pointRef={chooser.ref}
          hasStates={states.length > 0}
          onPick={(effect) => start(effect, chooser.ref, chooser.kind)}
          onCancel={() => pendingAdd.set(null)}
        />
      ) : null}

      {editing?.isNew ? (
        <BehaviorEditor
          key={editing.draft.id}
          editing={editing}
          others={saved}
          states={states}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onSave={save}
          onCancel={close}
        />
      ) : null}

      {saved.map((behavior) =>
        editing && !editing.isNew && editing.draft.id === behavior.id ? (
          <BehaviorEditor
            key={behavior.id}
            editing={editing}
            others={saved}
            states={states}
            onChange={(draft) => setEditing({ ...editing, draft })}
            onSave={save}
            onCancel={close}
            onDelete={() => remove(behavior)}
          />
        ) : (
          <BehaviorRow
            key={behavior.id}
            behavior={behavior}
            problem={problems.find((p) => p.behaviorId === behavior.id)}
            disabled={Boolean(editing)}
            onOpen={() => setEditing({ isNew: false, draft: behavior })}
            onToggle={() => toggle(behavior)}
          />
        )
      )}

      {!saved.length && !editing && !chooser ? (
        <p className="px-1 py-3 text-center text-[11.5px] leading-relaxed text-muted-foreground">
          No behaviors yet. Add one, or drag a point from the Station panel onto
          this shape.
        </p>
      ) : null}
    </div>
  )
}

function titleOf(behavior: Behavior) {
  return behavior.name || getEffect(behavior.effect)?.label || behavior.effect
}

const offered = (def: EffectDef, hasStates: boolean) =>
  !def.needsStates || hasStates

function AddBehaviorMenu({
  disabled,
  hasStates,
  onPick,
}: {
  disabled: boolean
  hasStates: boolean
  onPick(effect: string): void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="h-8 w-full gap-1.5"
            disabled={disabled}
          />
        }
      >
        <Icon icon={Add01Icon} className="size-3.5" />
        Add behavior
        <Icon
          icon={ArrowDown01Icon}
          className="ml-auto size-3.5 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {FAMILIES.map((family, index) => (
          <DropdownMenuGroup key={family.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{family.label}</DropdownMenuLabel>
            {EFFECT_ORDER.map((id) => getEffect(id)!)
              .filter(
                (def) => def.family === family.id && offered(def, hasStates)
              )
              .map((def) => (
                <DropdownMenuItem
                  key={def.id}
                  onClick={() => onPick(def.id)}
                  className="items-start"
                >
                  <Icon icon={EFFECT_UI[def.id].icon} className="mt-0.5" />
                  <span className="flex flex-col">
                    <span>{def.label}</span>
                    <span className="text-[10.5px] text-muted-foreground">
                      {def.description}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EffectChooser({
  pointRef,
  hasStates,
  onPick,
  onCancel,
}: {
  pointRef: PointRef
  hasStates: boolean
  onPick(effect: string): void
  onCancel(): void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-ring/60 bg-muted/30 p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-semibold">
          New behavior from{" "}
          <span className="font-mono">{pointName(pointRef)}</span>
        </span>
        <LiveValueBadge pointRef={pointRef} />
      </div>
      {FAMILIES.filter((f) => f.id !== "interaction").map((family) => (
        <div key={family.id} className="flex flex-col gap-1">
          <span className="text-[10.5px] font-medium text-muted-foreground">
            {family.label}
          </span>
          <div className="grid grid-cols-3 gap-1">
            {EFFECT_ORDER.map((id) => getEffect(id)!)
              .filter(
                (def) => def.family === family.id && offered(def, hasStates)
              )
              .map((def) => (
                <button
                  key={def.id}
                  type="button"
                  onClick={() => onPick(def.id)}
                  className="flex flex-col items-center gap-1 rounded-md border bg-background px-1 py-2 text-[11px] hover:border-ring hover:bg-muted/50"
                >
                  <Icon icon={EFFECT_UI[def.id].icon} className="size-4" />
                  {def.label}
                </button>
              ))}
          </div>
        </div>
      ))}
      <Button variant="ghost" size="sm" className="self-end" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}

function mappingSummary(behavior: Behavior, def: EffectDef): React.ReactNode {
  const summary = mappingText(behavior, def)
  const state = behavior.params.stateLabel
  return def.id === "state" && typeof state === "string" && state ? (
    <>
      {state} · {summary}
    </>
  ) : (
    summary
  )
}

function mappingText(behavior: Behavior, def: EffectDef): React.ReactNode {
  const { mapping } = behavior
  const unit = EFFECT_UI[def.id]?.outputUnit?.(behavior.params) ?? ""
  switch (mapping.kind) {
    case "switch":
      return {
        true: "while true",
        false: "while false",
        equals: `while = ${mapping.value ?? ""}`,
        notEquals: `while ≠ ${mapping.value ?? ""}`,
        above: `while > ${mapping.value ?? ""}`,
        below: `while < ${mapping.value ?? ""}`,
      }[mapping.test]
    case "range":
      return `${mapping.inMin}–${mapping.inMax} → ${mapping.outMin}–${mapping.outMax}${unit}`
    case "states":
      if (def.output(behavior.params) === "number") {
        const shown = mapping.cases.filter((c) => c.match)
        return shown.length && shown.length <= 2
          ? shown
              .map((c) => `${caseLabel(c.match)} → ${c.out}${unit}`)
              .join(", ")
          : `${shown.length} values`
      }
      return def.id === "color" ? (
        <span className="flex items-center gap-1">
          {[...mapping.cases.map((c) => c.out), mapping.fallback]
            .slice(0, 5)
            .map((color, i) => (
              <span
                key={i}
                className="size-2.5 rounded-[3px] border border-black/10"
                style={{ background: color }}
              />
            ))}
        </span>
      ) : (
        `${mapping.cases.length} states`
      )
    case "value":
      return def.id === "label"
        ? `${String(behavior.params.placement ?? "bottom")}`
        : ""
  }
}

function BehaviorRow({
  behavior,
  problem,
  disabled,
  onOpen,
  onToggle,
}: {
  behavior: Behavior
  problem?: Problem
  disabled: boolean
  onOpen(): void
  onToggle(): void
}) {
  const def = getEffect(behavior.effect)
  if (!def) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
        Unknown behavior “{behavior.effect}” (kept as is).
      </div>
    )
  }
  const ui = EFFECT_UI[def.id]
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border p-2 pl-2.5",
        !behavior.enabled && "opacity-60"
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            FAMILY_TONE[def.family]
          )}
        >
          <Icon icon={ui.icon} className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 truncate text-[12.5px] font-semibold">
            {titleOf(behavior)}
            {problem && behavior.enabled ? (
              <span
                title={problem.message}
                className="text-amber-600 dark:text-amber-400"
              >
                <Icon icon={Alert02Icon} className="size-3" />
              </span>
            ) : null}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted-foreground">
            {behavior.source ? (
              <>
                <span className="truncate font-mono">
                  {pointName(behavior.source)}
                </span>
                <LiveValueBadge
                  pointRef={behavior.source}
                  className="text-[10.5px]"
                />
                <span>·</span>
              </>
            ) : null}
            <span className="truncate">{mappingSummary(behavior, def)}</span>
          </span>
        </span>
      </button>
      <Switch
        aria-label={`${titleOf(behavior)} on`}
        checked={behavior.enabled}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
    </div>
  )
}

function outputKindToValueKind(output: string): ValueKind | null {
  return output === "boolean"
    ? "boolean"
    : output === "number"
      ? "number"
      : null
}

function BehaviorEditor({
  editing,
  others,
  states,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  editing: Editing
  others: Behavior[]
  states: StateOption[]
  onChange(draft: Behavior): void
  onSave(draft: Behavior): void
  onCancel(): void
  onDelete?(): void
}) {
  const { draft, isNew } = editing
  const def = getEffect(draft.effect)!
  const ui = EFFECT_UI[def.id]
  const unit = ui.outputUnit?.(draft.params)
  // What the point delivers (on/off, number, text), so new mappings fit it.
  const sourceKind = kindOfValue(useLivePoint(draft.source))
  const output = def.output(draft.params)

  const errors = useMemo(() => {
    const list = def.validate(draft)
    for (const [key, value] of Object.entries(draft.params)) {
      if (
        value &&
        typeof value === "object" &&
        "bind" in value &&
        !value.bind.point
      ) {
        const label = ui.fields.find((f) => f.key === key)?.label ?? key
        list.push(`Choose the point that drives ${label.toLowerCase()}.`)
      }
    }
    if (draft.conditions.some((c) => !c.ref.point))
      list.push("Choose a point for each condition.")
    const conflict = findConflict(others, draft)
    if (conflict)
      list.push(
        `“${titleOf(conflict)}” already does this. Turn one of them off.`
      )
    return list
  }, [def, draft, others, ui.fields])

  const setParam = (key: string, value: ParamValue) => {
    const params = { ...draft.params, [key]: value }
    let mapping: Mapping = draft.mapping
    // Switching between follow and spin/travel changes what the mapping produces.
    if (def.output(params) !== def.output(draft.params)) {
      const base = def.defaults(outputKindToValueKind(def.output(params)), {
        states,
      }).mapping
      mapping = adaptMapping(base, def.output(params), sourceKind)
    }
    onChange({ ...draft, params, mapping })
  }

  return (
    <div className="flex flex-col rounded-lg border border-ring/50 bg-background shadow-xs">
      <div className="flex items-center gap-2 border-b p-2 pl-2.5">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            FAMILY_TONE[def.family]
          )}
        >
          <Icon icon={ui.icon} className="size-3.5" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <Input
            aria-label="Behavior name"
            placeholder={def.label}
            defaultValue={draft.name ?? ""}
            onBlur={(e) =>
              onChange({ ...draft, name: e.target.value.trim() || undefined })
            }
            className="h-6 border-transparent bg-transparent px-1 text-[12.5px] font-semibold shadow-none hover:border-input dark:bg-transparent"
          />
          <span className="px-1 text-[10.5px] text-muted-foreground">
            {FAMILIES.find((f) => f.id === def.family)?.label} · {def.label}
          </span>
        </span>
        <Switch
          aria-label="On"
          checked={draft.enabled}
          onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
        />
      </div>

      <div className="flex flex-col gap-3 p-2.5">
        {def.needsSource ? (
          <section className="flex flex-col gap-1.5">
            <SectionLabel>When</SectionLabel>
            <PointField
              value={draft.source}
              onChange={(source, kind) => {
                // A brand-new behavior adapts its defaults to the point it was given.
                if (isNew && kind) {
                  const { mapping, params } = defaultsFor(def, kind, {
                    states,
                  })
                  onChange({
                    ...draft,
                    source,
                    mapping,
                    params: {
                      ...params,
                      ...pick(draft.params, [
                        "placement",
                        "caption",
                        "color",
                        "target",
                      ]),
                    },
                  })
                } else onChange({ ...draft, source })
              }}
            />
            {draft.mapping.kind === "switch" ? (
              <SwitchEditor
                label={ui.whenLabel?.(draft.params) ?? "When"}
                mapping={draft.mapping}
                onChange={(mapping) => onChange({ ...draft, mapping })}
              />
            ) : null}
            {output === "number" &&
            (draft.mapping.kind === "range" ||
              draft.mapping.kind === "states") ? (
              <Row label="Map by">
                <Segmented
                  label="Map by"
                  value={draft.mapping.kind}
                  options={[
                    { value: "range", label: "Range" },
                    { value: "states", label: "Values" },
                  ]}
                  onChange={(kind) => {
                    if (kind === draft.mapping.kind) return
                    const base = def.defaults("number", { states }).mapping
                    const range =
                      base.kind === "range"
                        ? base
                        : {
                            kind: "range" as const,
                            inMin: 0,
                            inMax: 100,
                            outMin: 0,
                            outMax: 100,
                            clamp: true,
                          }
                    onChange({
                      ...draft,
                      mapping:
                        kind === "range"
                          ? range
                          : numberMappingFor(
                              sourceKind === "number" ? "text" : sourceKind,
                              range
                            ),
                    })
                  }}
                />
              </Row>
            ) : null}
            {draft.mapping.kind === "range" ? (
              <RangeEditor
                unit={unit}
                mapping={draft.mapping}
                onChange={(mapping) => onChange({ ...draft, mapping })}
              />
            ) : null}
            {draft.mapping.kind === "states" ? (
              <StatesEditor
                output={
                  def.id === "color"
                    ? "color"
                    : output === "number"
                      ? "number"
                      : "text"
                }
                unit={unit}
                mapping={draft.mapping}
                onChange={(mapping) => onChange({ ...draft, mapping })}
              />
            ) : null}

            {draft.conditions.map((condition, index) => (
              <div
                key={index}
                className="flex flex-col gap-1.5 rounded-md border border-dashed p-2"
              >
                <Row label="and">
                  <PointField
                    compact
                    value={condition.ref.point ? condition.ref : null}
                    onChange={(ref) =>
                      onChange({
                        ...draft,
                        conditions: draft.conditions.map((c, i) =>
                          i === index ? { ...c, ref } : c
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove condition"
                    onClick={() =>
                      onChange({
                        ...draft,
                        conditions: draft.conditions.filter(
                          (_, i) => i !== index
                        ),
                      })
                    }
                  >
                    <Icon icon={Delete02Icon} className="size-3" />
                  </Button>
                </Row>
                <SwitchEditor
                  label="is"
                  mapping={condition.mapping}
                  onChange={(mapping) =>
                    onChange({
                      ...draft,
                      conditions: draft.conditions.map((c, i) =>
                        i === index ? { ...c, mapping } : c
                      ),
                    })
                  }
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground"
              onClick={() =>
                onChange({
                  ...draft,
                  conditions: [
                    ...draft.conditions,
                    {
                      ref: { source: "", point: "" },
                      mapping: { kind: "switch", test: "true" },
                    },
                  ],
                })
              }
            >
              <Icon icon={Add01Icon} className="size-3" />
              Add condition
            </Button>
          </section>
        ) : null}

        {ui.mode || ui.fields.length ? (
          <section className="flex flex-col gap-1.5">
            <SectionLabel>Do</SectionLabel>
            {ui.mode ? (
              <Segmented
                label="Mode"
                value={
                  typeof draft.params.mode === "string"
                    ? draft.params.mode
                    : null
                }
                options={ui.mode.options}
                onChange={(v) => setParam("mode", v)}
              />
            ) : null}
            {ui.fields
              .filter((field) => !field.showIf || field.showIf(draft.params))
              .map((field) =>
                field.kind === "state" ? (
                  <StateField
                    key={field.key}
                    states={states}
                    value={draft.params.state}
                    onPick={(state) => {
                      const next = stateDefaults(state, sourceKind)
                      const params = { ...draft.params, ...next.params }
                      // Keep the mapping unless the state takes a different kind of value.
                      const mapping =
                        def.output(params) === def.output(draft.params)
                          ? draft.mapping
                          : next.mapping
                      onChange({ ...draft, params, mapping })
                    }}
                  />
                ) : (
                  <ParamField
                    key={field.key}
                    field={field}
                    params={draft.params}
                    onChange={setParam}
                  />
                )
              )}
          </section>
        ) : null}

        {def.needsSource && def.id !== "label" ? (
          <section className="flex flex-col gap-1.5">
            <SectionLabel>Transition</SectionLabel>
            <Row label="Ramp">
              <Segmented
                label="Ramp time"
                value={String(draft.transition.ms)}
                options={[
                  { value: "0", label: "None" },
                  { value: "200", label: "0.2 s" },
                  { value: "400", label: "0.4 s" },
                  { value: "800", label: "0.8 s" },
                  { value: "1500", label: "1.5 s" },
                ]}
                onChange={(v) =>
                  onChange({
                    ...draft,
                    transition: { ...draft.transition, ms: Number(v) },
                  })
                }
              />
            </Row>
          </section>
        ) : null}

        {def.needsSource ? <TestControl behavior={draft} /> : null}

        {errors.length ? (
          <ul className="flex flex-col gap-1 rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex items-center gap-1.5 border-t p-2">
        {onDelete ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete behavior"
            className="text-destructive"
            onClick={onDelete}
          >
            <Icon icon={Delete02Icon} className="size-3.5" />
          </Button>
        ) : null}
        <span className="flex-1 text-[11px] text-muted-foreground">
          {isNew ? "New behavior" : "Unsaved changes preview live"}
        </span>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={errors.length > 0}
          onClick={() => onSave(draft)}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

function pick(params: Record<string, ParamValue>, keys: string[]) {
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => keys.includes(key))
  )
}

function StateField({
  states,
  value,
  onPick,
}: {
  states: StateOption[]
  value: ParamValue | undefined
  onPick(state: StateOption): void
}) {
  if (!states.length)
    return (
      <p className="text-[11px] text-muted-foreground">
        This shape has no states to drive.
      </p>
    )
  return (
    <Row label="State">
      <SelectField
        label="State"
        value={typeof value === "string" && value ? value : null}
        options={states.map((s) => ({ value: s.key, label: s.label }))}
        placeholder="Choose a state"
        onChange={(key) => {
          const state = states.find((s) => s.key === key)
          if (state) onPick(state)
        }}
      />
    </Row>
  )
}
