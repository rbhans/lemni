"use client"

import {
  Add01Icon,
  Cancel01Icon,
  Link01Icon,
  Unlink01Icon,
} from "@hugeicons/core-free-icons"
import { useValue } from "tldraw"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import {
  ColorField,
  NumberField,
  Segmented,
  SelectField,
} from "@/studio/shell/fields"
import { Icon } from "@/studio/shell/icon"
import { Tip } from "@/studio/shell/tip"

import type { InputValue } from "../core/evaluate"
import type {
  Behavior,
  BoundNumber,
  ParamValue,
  RangeMapping,
  StatesMapping,
  SwitchMapping,
  SwitchTest,
} from "../core/model"
import { setTestValue, testValues } from "../runtime/state"
import type { FieldDef } from "./effect-ui"
import { PointField } from "@/studio/data/point-field"
import { TargetField } from "@/studio/navigation/target-field"

export function Row({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-h-7 items-center gap-2", className)}>
      <span className="w-[52px] shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
    </div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </span>
  )
}

const TESTS: { value: SwitchTest; label: string }[] = [
  { value: "true", label: "Is true / on" },
  { value: "false", label: "Is false / off" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Doesn't equal" },
  { value: "above", label: "Is above" },
  { value: "below", label: "Is below" },
]

export function SwitchEditor({
  label,
  mapping,
  onChange,
}: {
  label: string
  mapping: SwitchMapping
  onChange(next: SwitchMapping): void
}) {
  const needsValue = mapping.test !== "true" && mapping.test !== "false"
  const numeric = mapping.test === "above" || mapping.test === "below"
  return (
    <Row label={label}>
      <SelectField
        label="Condition"
        value={mapping.test}
        options={TESTS}
        onChange={(test) => onChange({ ...mapping, test })}
      />
      {needsValue ? (
        numeric ? (
          <NumberField
            label="Compare with"
            prefix=""
            className="w-20 flex-none"
            value={
              typeof mapping.value === "number"
                ? mapping.value
                : Number.parseFloat(String(mapping.value ?? "")) || 0
            }
            onCommit={(value) => onChange({ ...mapping, value })}
          />
        ) : (
          <Input
            aria-label="Compare with"
            className="h-7 w-24 flex-none text-xs"
            defaultValue={
              mapping.value === undefined ? "" : String(mapping.value)
            }
            onBlur={(event) =>
              onChange({ ...mapping, value: event.target.value })
            }
          />
        )
      ) : null}
    </Row>
  )
}

export function RangeEditor({
  mapping,
  onChange,
  unit,
  compact,
}: {
  mapping: RangeMapping
  onChange(next: RangeMapping): void
  unit?: string
  compact?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Row label={compact ? "Input" : "When value"}>
        <NumberField
          label="Input from"
          prefix=""
          value={mapping.inMin}
          onCommit={(inMin) => onChange({ ...mapping, inMin })}
        />
        <span className="text-[11px] text-muted-foreground">to</span>
        <NumberField
          label="Input to"
          prefix=""
          value={mapping.inMax}
          onCommit={(inMax) => onChange({ ...mapping, inMax })}
        />
      </Row>
      <Row label={compact ? "Output" : "Becomes"}>
        <NumberField
          label="Output from"
          prefix=""
          suffix={unit}
          value={mapping.outMin}
          onCommit={(outMin) => onChange({ ...mapping, outMin })}
        />
        <span className="text-[11px] text-muted-foreground">to</span>
        <NumberField
          label="Output to"
          prefix=""
          suffix={unit}
          value={mapping.outMax}
          onCommit={(outMax) => onChange({ ...mapping, outMax })}
        />
      </Row>
      {compact ? null : (
        <Row label="">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Switch
              size="sm"
              checked={mapping.clamp}
              onCheckedChange={(clamp) => onChange({ ...mapping, clamp })}
            />
            Stay within the range
          </label>
        </Row>
      )}
    </div>
  )
}

/** "true"/"false" table rows read as On/Off. */
export function caseLabel(match: string) {
  return match === "true" ? "On" : match === "false" ? "Off" : match
}

/** Value → output rows (colors, text or numbers), with a fallback. */
export function StatesEditor({
  mapping,
  onChange,
  output,
  unit,
}: {
  mapping: StatesMapping
  onChange(next: StatesMapping): void
  output: "color" | "text" | "number"
  unit?: string
}) {
  const setCase = (
    index: number,
    patch: Partial<StatesMapping["cases"][number]>
  ) =>
    onChange({
      ...mapping,
      cases: mapping.cases.map((c, i) =>
        i === index ? { ...c, ...patch } : c
      ),
    })
  const outField = (value: string, set: (v: string) => void, label: string) =>
    output === "color" ? (
      <ColorField label={label} value={value} onChange={set} />
    ) : output === "number" ? (
      <NumberField
        label={label}
        prefix=""
        suffix={unit}
        className="flex-1"
        value={
          Number.isFinite(Number.parseFloat(value))
            ? Number.parseFloat(value)
            : null
        }
        onCommit={(n) => set(String(n))}
      />
    ) : (
      <Input
        aria-label={label}
        className="h-7 flex-1 text-xs"
        defaultValue={value}
        onBlur={(e) => set(e.target.value)}
      />
    )

  return (
    <div className="flex flex-col gap-1.5">
      {mapping.cases.map((c, index) => (
        <div key={index} className="flex items-center gap-1.5">
          {c.match === "true" || c.match === "false" ? (
            // On/off rows match boolean points; they read as On/Off.
            <span className="flex h-7 w-[86px] flex-none items-center px-2 font-mono text-[11px]">
              {caseLabel(c.match)}
            </span>
          ) : (
            <Input
              aria-label="When the value is"
              placeholder="Value"
              className="h-7 w-[86px] flex-none font-mono text-[11px]"
              defaultValue={c.match}
              onBlur={(e) => setCase(index, { match: e.target.value })}
            />
          )}
          <span className="text-[11px] text-muted-foreground">→</span>
          {outField(
            c.out,
            (out) => setCase(index, { out }),
            `Output for ${caseLabel(c.match)}`
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Remove state"
            onClick={() =>
              onChange({
                ...mapping,
                cases: mapping.cases.filter((_, i) => i !== index),
              })
            }
          >
            <Icon icon={Cancel01Icon} className="size-3" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="w-[86px] flex-none text-[11px] text-muted-foreground">
          Otherwise
        </span>
        <span className="text-[11px] text-muted-foreground">→</span>
        {outField(
          mapping.fallback,
          (fallback) => onChange({ ...mapping, fallback }),
          "Output otherwise"
        )}
        <span className="w-5" />
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="self-start text-muted-foreground"
        onClick={() =>
          onChange({
            ...mapping,
            cases: [
              ...mapping.cases,
              {
                match: "",
                out:
                  output === "color"
                    ? "#0092b8"
                    : output === "number"
                      ? mapping.fallback
                      : "",
              },
            ],
          })
        }
      >
        <Icon icon={Add01Icon} className="size-3" />
        {output === "number" ? "Add value" : "Add state"}
      </Button>
    </div>
  )
}

const isBound = (value: ParamValue | undefined): value is BoundNumber =>
  Boolean(value && typeof value === "object" && "bind" in value)

/** One effect parameter, rendered from its field definition. */
export function ParamField({
  field,
  params,
  onChange,
}: {
  field: FieldDef
  params: Record<string, ParamValue>
  onChange(key: string, value: ParamValue): void
}) {
  const value = params[field.key]
  switch (field.kind) {
    case "segmented":
      return (
        <Row label={field.label}>
          <Segmented
            label={field.label}
            value={typeof value === "string" ? value : null}
            options={field.options}
            onChange={(v) => onChange(field.key, v)}
          />
        </Row>
      )
    case "color":
      return (
        <Row label={field.label}>
          <ColorField
            label={field.label}
            value={typeof value === "string" ? value : "#000000"}
            onChange={(v) => onChange(field.key, v)}
          />
        </Row>
      )
    case "text":
      return (
        <Row label={field.label}>
          <Input
            // Remount when the saved value changes underneath (undo, mode switch) instead of fighting an uncontrolled input.
            key={typeof value === "string" ? value : ""}
            aria-label={field.label}
            className="h-7 text-xs"
            defaultValue={typeof value === "string" ? value : ""}
            onBlur={(e) => onChange(field.key, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
          />
        </Row>
      )
    case "switch":
      return (
        <Row label="">
          <label className="flex items-center gap-2 text-[11.5px]">
            <Switch
              size="sm"
              checked={value === true}
              onCheckedChange={(checked) => onChange(field.key, checked)}
            />
            {field.label}
          </label>
        </Row>
      )
    case "pivot":
      return (
        <Row label={field.label}>
          <PivotGrid
            value={
              value && typeof value === "object" && "x" in value
                ? value
                : { x: 0.5, y: 0.5 }
            }
            onChange={(v) => onChange(field.key, v)}
          />
        </Row>
      )
    case "target":
      return (
        <Row label={field.label}>
          <TargetField
            value={typeof value === "string" ? value : ""}
            onChange={(v) => onChange(field.key, v)}
            pickLabel="this shape's click"
          />
        </Row>
      )
    case "number": {
      if (isBound(value)) {
        return (
          <div className="flex flex-col gap-1.5 rounded-md border border-dashed p-2">
            <Row label={field.label}>
              <PointField
                compact
                value={value.bind}
                onChange={(bind) => onChange(field.key, { ...value, bind })}
              />
              <Tip label="Use a fixed number">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Use a fixed number"
                  onClick={() => onChange(field.key, value.range.outMin)}
                >
                  <Icon icon={Unlink01Icon} className="size-3.5" />
                </Button>
              </Tip>
            </Row>
            <RangeEditor
              compact
              unit={field.unit}
              mapping={value.range}
              onChange={(range) => onChange(field.key, { ...value, range })}
            />
          </div>
        )
      }
      const n = typeof value === "number" ? value : 0
      return (
        <Row label={field.label}>
          <NumberField
            label={field.label}
            prefix=""
            suffix={field.unit}
            value={n}
            onCommit={(next) =>
              onChange(
                field.key,
                Math.min(
                  field.max ?? Infinity,
                  Math.max(field.min ?? -Infinity, next)
                )
              )
            }
          />
          {field.bindable ? (
            <Tip label="Drive this from another point">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Drive this from another point"
                onClick={() =>
                  onChange(field.key, {
                    bind: { source: "", point: "" },
                    range: {
                      kind: "range",
                      inMin: 0,
                      inMax: 100,
                      outMin: n * 4 || 4,
                      outMax: n || 1,
                      clamp: true,
                    },
                  })
                }
              >
                <Icon icon={Link01Icon} className="size-3.5" />
              </Button>
            </Tip>
          ) : null}
        </Row>
      )
    }
  }
}

function PivotGrid({
  value,
  onChange,
}: {
  value: { x: number; y: number }
  onChange(v: { x: number; y: number }): void
}) {
  const steps = [0, 0.5, 1]
  return (
    <div
      role="radiogroup"
      aria-label="Pivot point"
      className="grid w-[54px] grid-cols-3 gap-1 rounded-md border p-1"
    >
      {steps.map((y) =>
        steps.map((x) => {
          const active =
            Math.abs(value.x - x) < 0.01 && Math.abs(value.y - y) < 0.01
          return (
            <button
              key={`${x}-${y}`}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Pivot ${y === 0 ? "top" : y === 1 ? "bottom" : "middle"} ${x === 0 ? "left" : x === 1 ? "right" : "center"}`}
              onClick={() => onChange({ x, y })}
              className={cn(
                "size-3 rounded-[3px] bg-muted-foreground/25 hover:bg-muted-foreground/50",
                active && "bg-lime-600 hover:bg-lime-600 dark:bg-lime-400"
              )}
            />
          )
        })
      )}
    </div>
  )
}

/** Try the behavior without a station: a fake value for its source, this session only. */
export function TestControl({ behavior }: { behavior: Behavior }) {
  const test = useValue("test value", () => testValues.get()[behavior.id], [
    behavior.id,
  ])
  const set = (value: InputValue | undefined) =>
    setTestValue(behavior.id, value)
  const mapping = behavior.mapping
  const make = (value: unknown, display = String(value)): InputValue => ({
    value,
    display,
    ok: true,
    status: "{ok}",
  })

  let control: React.ReactNode
  if (
    mapping.kind === "switch" &&
    (mapping.test === "true" || mapping.test === "false")
  ) {
    control = (
      <Segmented
        label="Test value"
        value={test === undefined ? "live" : test.value ? "on" : "off"}
        options={[
          { value: "live", label: "Live" },
          { value: "off", label: "Off" },
          { value: "on", label: "On" },
        ]}
        onChange={(v) =>
          set(
            v === "live"
              ? undefined
              : make(v === "on", v === "on" ? "On" : "Off")
          )
        }
      />
    )
  } else if (
    mapping.kind === "range" ||
    (mapping.kind === "switch" &&
      (mapping.test === "above" || mapping.test === "below"))
  ) {
    // A range tests across its input; a threshold tests on both sides of its limit.
    let lo: number
    let hi: number
    if (mapping.kind === "range") {
      lo = Math.min(mapping.inMin, mapping.inMax)
      hi = Math.max(mapping.inMin, mapping.inMax)
    } else {
      const limit = Number.parseFloat(String(mapping.value ?? 0)) || 0
      lo = Math.min(0, limit * 2)
      hi = Math.max(100, limit * 2)
    }
    const current = typeof test?.value === "number" ? test.value : (lo + hi) / 2
    control = (
      <>
        <Switch
          size="sm"
          aria-label="Use a test value"
          checked={test !== undefined}
          onCheckedChange={(on) => set(on ? make(current) : undefined)}
        />
        <Slider
          aria-label="Test value"
          disabled={test === undefined}
          min={lo}
          max={hi}
          step={(hi - lo) / 100 || 1}
          value={[current]}
          onValueChange={(v) => set(make(Array.isArray(v) ? v[0] : v))}
          className="flex-1"
        />
        <span className="w-10 text-right font-mono text-[11px]">
          {test === undefined ? "live" : Math.round(current * 10) / 10}
        </span>
      </>
    )
  } else if (mapping.kind === "states" && mapping.cases.length) {
    control = (
      <SelectField
        label="Test value"
        value={test === undefined ? "__live" : String(test.value)}
        options={[
          { value: "__live", label: "Live" },
          ...mapping.cases
            .filter((c) => c.match)
            .map((c) => ({ value: c.match, label: caseLabel(c.match) })),
        ]}
        onChange={(v) =>
          set(
            v === "__live"
              ? undefined
              : make(v === "true" ? true : v === "false" ? false : v, v)
          )
        }
      />
    )
  } else {
    control = (
      <Input
        aria-label="Test value"
        placeholder="Live"
        className="h-7 text-xs"
        defaultValue={test === undefined ? "" : test.display}
        onBlur={(e) => {
          const text = e.target.value.trim()
          if (!text) return set(undefined)
          const n = Number.parseFloat(text)
          set(make(Number.isFinite(n) && String(n) === text ? n : text, text))
        }}
      />
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        Test with
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{control}</div>
    </div>
  )
}
