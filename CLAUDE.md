@AGENTS.md

# Lemscape

The endless canvas for buildings (formerly Lemni, and BAS Board before that; the repo
folder is still `lemni`). Storage keys, files and env vars from the old names are
migrated or still read; keep it that way when touching them.

Read `docs/ARCHITECTURE.md` before structural changes. v1 lives in
`../bas-whiteboard`; use it for concepts only, not code.

## Rules

- **All visible UI is shadcn** (`components/ui`, preset `base-mira` on Base UI). Never
  render tldraw UI components (`TldrawUi`, `Tldraw`, tldraw menus/panels). Use tldraw
  hooks (`useActions`, `useTools`, `useRelevantStyles`, …) for behavior only.
- Base UI, not Radix: compose with the `render` prop, not `asChild`; menus use
  `onClick`, switches `onCheckedChange`, sliders/tabs `onValueChange`. Menu labels
  (`DropdownMenuLabel`, `ContextMenuLabel`) must sit inside a `…Group` or
  `…RadioGroup`; a bare one throws when the menu opens and takes the app down.
- Icons: Hugeicons via `Icon` (`studio/shell/icon.tsx`, `@/sdk` in plugins). Verify an
  icon name exists in `@hugeicons/core-free-icons` before using it.
- **Every feature is a plugin**: a folder `plugins/<id>/` whose `index.tsx`
  default-exports `definePlugin({ … })`, found automatically (`npm run new-plugin`
  makes one; `docs/PLUGINS.md` is the guide). Declare dependencies; optional
  dependencies must degrade gracefully; engine pieces are always registered; turning a
  plugin off never deletes content. Keep `studio/plugins/registry.ts` pure (no React,
  relative imports) so `node --test` can run it.
- **Plugins import the studio only through the SDK**: `@/sdk` in browser code,
  `@/sdk/server` in `plugins/<id>/server/*`, `../../sdk/core.ts` in pure modules, plus
  `@/components/ui/*` and `@/lib/utils`. Never `@/studio`, `@/server` or another
  plugin. When a plugin needs something new from the studio, export it from `sdk/`
  (ESLint and `plugins/boundaries.test.ts` check this). New shape and binding types
  and tool ids start with the plugin id; plugin settings use `pluginStorage(id)`.
- Menus and property controls that live outside the canvas should return focus with
  `editor.focus()` after acting.
- Canvas colors that tldraw paints itself (selection, brush) come from
  `studio/editor/board-theme.ts`; DOM colors come from `app/globals.css` tokens.
- Server code lives with its plugin (`plugins/<id>/server/*`, `import "server-only"`).
  Its routes go in `server/routes.ts` (`definePluginRoutes`) and are served at
  `/api/plugins/<id>/…`, where `server/plugin-dispatch.ts` applies
  `server/request-guard.ts` to every request; don't add `app/api` routes for plugins
  (`/api/mcp` is the exception, since AI apps call it with a token). Never send
  credentials or cookies to the browser.
- Live data goes through the live-points API (`studio/data/live-points.ts`, `@/sdk`
  in plugins); features never import a connection plugin's client directly.
- AI features are plugin `ai` tools (MCP), not chat UI, in `plugins/<id>/ai-tools.ts`.
  Tool names are snake_case and unique; descriptions are written for the AI; inputs use
  the JSON Schema subset in `studio/ai/schema.ts` (`validateInput`); errors are thrown
  as sentences the AI can act on. Check input fully before changing anything, and wrap
  board changes made after an `await` in `safeBatch` (`studio/ai/batch.ts`): tldraw
  crashes the editor on anything thrown inside an edit batch. Anything that changes an
  outside system is an `access: "write"` tool (prepare a plan → Allow once → "Are you
  sure?" → commit, logged with `appendAudit` from `server/audit.ts`); never send it
  any other way.
- Code one plugin uses lives in that plugin; `studio/` only holds what several share.
- Before finishing: `npm run check` and, for UI changes, verify in the browser.
