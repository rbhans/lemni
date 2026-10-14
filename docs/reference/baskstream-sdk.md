# baskStream SDK (@basidekick/baskstream 0.1.0, API 1.7) — summary for v2

Source: github.com/rbhans/bask-stream (sdk/, spec/, docs/). Not on npm; CLI uses "file:../sdk"; build runs `npm run gen` reading ../../spec/baskstream-protocol.json → vendor sdk/ + spec/ together (submodule) or commit prebuilt dist.

## Ops (45) — [W]=writesEnabled, [M]=modelEditsEnabled
- Session/discovery: ping, capabilities (version, ops, write/model flags, limits, policy, user), browse (base slot:/ | hierarchy:, depth 0–4, metadata none|full), describe(ord), search (query substring; kind/features/operations/writable filters; depth≤64 limit≤5000 maxVisited≤200k timeout≤30s; truncated + reasons).
- Points: read (≤1000, fields[]), subscribe/unsubscribe, replace_subscriptions (group, points ≤1000, leaseSec), renew/release_subscriptions, subscription_status, describe_write (actions, 16-level priority array, fallback, enumOptions, supportsDuration), write [W] (set/override/auto/emergency_override/emergency_auto; single or batch ≤1000; duration).
- History: describe_history, read_history (start/end default 24h, limit ≤5000), read_history_rollup (interval ≥1000ms, ≤5000 buckets; count/min/max/sum/avg/first/last). No live history.
- Alarms: read_alarms (scope open|ack_pending|all, filter class/priority/ackState/since/until), ack_alarm(s) [W] dryRun, clear_alarm(s) [W] admin, subscribe_alarms (event|snapshot|both).
- Schedules: read_schedule, read_schedule_events (≤366d), write_schedule [W] dryRun (no special events).
- Model/tags/relations: subscribe_model (bases ≤100, depth ≤4), read_tags (≤100, dictionary, relations), write_tags [W], write_relations [W], describe_component_types, describe_component (slots/values/flags/facets/actions/links), preview_model_changes [M] (1–100 changes → planId/planHash/diff/expiry), apply_model_changes [M] (planId, planHash, idempotencyKey), model_plan_status, cancel_model_plan, + shortcuts create_components/update_component_properties/rename/move/delete/create_hierarchy/configure_hierarchy (preview only).
- SDK helpers: browse, describe, search, read, write, describeWrite, history, historyRollup, alarms, ackAlarms, clearAlarms, subscribeAlarms, schedule, scheduleEvents, writeSchedule, subscriptionStatus, watch; rest via client.call(op, fields).

## Tree
- Node: ord, slotPath, name, display, description, typeSpec, status, ok, kind (point|schedule|container|component), hasChildren, writable, features (point|history|alarm|schedule), operations; children, metadata, enum; hierarchy nodes add entityOrd/targetOrd/targetSlotPath.
- NO icons (map typeSpec + classification → icons in app). NO pagination (5000 nodes/5s budget → truncated) → lazy depth-1 expand.
- ORDs: browse/search return local:|station:|slot:/…; point ops need slot:/… → toSlotOrd (sdk/src/ords.ts).
- metadata full: classification (isDriverDevice/Network, isControlPoint, isWritablePoint, isProxyPoint, isSchedule, hasHistory, hasAlarm, equipmentCertainty), parent/ancestors, driver info, point facets (units, precision, range), activeLevel, write/history/alarm summaries, tags, relations; unreadable related → {redacted:true}.
- No Px import.

## Live
- Snapshot: point, ok, display, valueType, value, displayValue, status ("{ok}", "{overridden} @ 8"), timestamp (read time), facets, enumOrdinal/enumTag/enumDisplay/enumOptions; errors add code/message.
- COV {sequence, timestamp, batched, sourceEvents, points[]}, 100ms batches.
- watch(): default lease 120s, renew at half, recreate on group_not_found; update = replace_subscriptions + read.
- Limits: 500 subs/client, 500 live points/stream, inbound frame 1MiB, reply 8MiB.
- resync_required (SDK re-reads watched only), subscriptions_revoked (emit only), session_revoked (notice then 1008), request_timeout (10 min, 1011), alarm_cov, model_cov, model_plan_applied.
- Reconnect backoff 1/2/5/10/30s; restores watches + alarm subs (not model subs). Default call timeout 30s. MUST attach 'error' listener or Node crashes.

## Writes
- writesEnabled default true, modelEditsEnabled default false; allowedPathPatterns; Niagara user perms.
- set=fallback; override=level 8 (+duration); auto releases 8; emergency=level 1. Check activeLevel after write (higher priority may win). 150ms settle.
- Point writes have NO dry-run. dryRun for alarm ack/clear + write_schedule. Model edits: preview → show diff → apply exact planId/planHash + idempotencyKey.
- Audit is under the connected Niagara user → shared account = shared attribution; per-person needs per-user sessions.

## Hosting
- Node only (node:crypto SCRAM, http/https, ws, Buffer). Not browser, not Edge runtime.
- Next.js: server-only hub singleton on globalThis (HMR-safe), one client per station (or per user); password via callback/secret; cookies via onSession; browser ↔ hub via SSE (route handler) or WS on custom server; refcount points per canvas → one watch per canvas group; tree/history/alarms/AI via route handlers; writes through server policy layer (capabilities → describe_write/preview → explicit confirm → server rejects without it). Maybe serverExternalPackages: ['ws'].
- Terms: least-privilege dedicated user, read-only by default, explicit customer authorization before AI tooling, no Tridium confidential material to AI, no endorsement implied.

## Model editing (15 actions)
create, clone, update, rename, move, delete(recursive), create_hierarchy, configure_hierarchy, add_slot, remove_slot, set_slot_metadata, reorder, create_link, delete_link, invoke; refs across plan steps; collision suffix. Admin write; protected services refused; non-atomic (stops at first failure); previews 5 min; station save needed.
