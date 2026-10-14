# v1 behavior system — concept inventory (from bas-whiteboard, client/bas/)

## Effects (8 point-driven + navigation)
| Effect (group) | Channel | Mapping default | Output rule | Options (defaults) |
|---|---|---|---|---|
| label Value label (Display) | none, unlimited | auto | raw displayValue, else value, else "No value" | placement center/top/right/**bottom**/left, gap 5, colorMode status/custom, color #202124, background solid/none, fontSize 20 (6–144), cornerRadius 12, caption, stackGap 4 |
| fill Status color (Display) | status-fill | auto | snapshotState(): alarm, override, stale, active, inactive, ok → tint stroke+fill | none |
| levelFill Percentage fill (Display) | level-fill | number 0–100→0–100 | clamp 0–100%; rect scaled inside clip path of closed geometry | color #2f80ed, direction up/down/left/right |
| visibility (Appearance) | visibility | boolean 0/1 | shown when ≥0.5 | – |
| opacity (Appearance) | opacity | number 0–100→0.1–1 | clamp 0–1 | – |
| rotation (Motion) | rotation | number 0–100→0–360 | position: mapped deg; spin: continuous while ≥0.5 | mode, secondsPerTurn 1.5 (0.1–60), cw/ccw, restAngle 0, pivot {x,y} normalized (9 presets, outside 0–1 allowed) |
| movement (Motion) | movement-x / movement-y | number 0–100→0–100px | position: offset on axis; travel: out-and-back while ≥0.5 | axis, direction, distance 100, secondsPerCycle 2 |
| scale (Motion) | scale | number 0–100→0.5–1.5 | clamp 0.05–4, center origin | – |

Navigation: meta.basNavigation {targetId, targetName, framing center|fit, enabled}; immutable shape id target; cross-page; explicit "Go to" button (normal click still selects); fit uses zoomToBounds inset 80; animate 280ms.

Mapping kinds: auto (number as-is; bool→1/0; true/on/active/occupied/running/open→1; parseFloat), boolean (true/false values), number (linear, optional clamp), enum (case-insensitive match, fallback). Null → channel skipped silently (v2: surface this).

## Data model rules
- shape.meta.basBindings[]: {key, schemaVersion, name?, enabled?, stationAlias, pointReference, pointLabel, runtimeProperty, mapping, options?}; unknown fields preserved. Runtime id = shapeId:key.
- Unsupported/unknown schema entries preserved raw, excluded from runtime.
- One enabled binding per channel per shape (labels exempt; X/Y separate). Conflicting add/re-enable rejected. Disabled duplicates allowed.
- Group precedence: nearest enabled owner wins a channel (even if offline). Transforms not additive across owners; different channels combine.
- Locked shapes/ancestors reject edits. One undo step per action.
- Runtime gate: enabled bindings only while live effects on + connected + station alias matches.
- Only current-page points subscribed.

## Runtime principles
- Saved drawing = intent, snapshots = inputs, presentation = disposable. Never write animated coords to store. Hit-testing uses saved geometry.
- Pure evaluator → {visible, opacity, translation, rotation, scale, spin, motions[]}.
- Animation controller (no React/DOM): cycles keyed kind:bindingId share phase; speed change preserves phase; spin linear; travel smoothstep out-and-back; numeric tweens 180ms smoothstep retargeting from displayed value.
- One tick listener per editor; paint via refs/DOM not React state.
- Reduced motion: cycles at rest, tweens jump.
- Fixed wrapper tree (no remounts of iframes/charts). Page-space vectors converted to shape space.
- Labels stack by (shape, placement); stay upright; scale with zoom.
- Snapshot store outside React/history, per-point versions, batched notifications, useSyncExternalStore.

## Authoring flow
Behaviors section in style panel; rows with enable switch; Add behavior: effect grid → name → point picker (debounced search, read-before-accept) → settings (Advanced mapping collapsed); live result preview; Save/Cancel; Change point keeps mapping; drag point from tree onto shape seeds Add flow (outermost selectable shape; nothing saved until confirmed).

## Known problems to fix in v2
1. BindingBuilder monolith; no real effect registry (defaults/validation/evaluation scattered).
2. Group/child composition: transforms not additive; nested groups unsolved; group fill overlays break with child transforms; nearest owner suppresses inherited effects even when offline.
3. Selection/hit-test follow saved artwork → must turn live effects off to arrange.
4. No large-drawing benchmarks.
5. No forward-migration framework.
6. Drop point into existing behavior editor failed.
7. Deferred: multi-selection editing, presets, templates/symbol assemblies with point-role remapping, provider-neutral connection boundary.
8. useBasWorkspace god-hook.
9. Station alias identity.
10. Custom widgets lack toSvg (export).
11. PDF outlines from open pieces can't fill.
Code-level: validation ranges disagree (UI vs clamp vs runtime); mapping defaults ignore effect (rotation got 0–1°); duplicated defaults; transform logic triplicated (wrapper/overlay/labels); fill overlays in front layer break z-order; continuous motion snaps back to rest with no easing; stale docs; wasted auto mapping on label/fill; overlay re-renders on every camera change; unparseable values silently show saved geometry.
