# Writing a plugin

Everything in Lemscape is a plugin: the canvas tools, the symbol library, the Niagara
connection, the AI connection. The built-in plugins use the same API you will, so any
of them in `plugins/` doubles as an example. A plugin can be as small as one menu item
or as large as a data connection with its own server code.

## Quick start

```bash
npm run new-plugin
```

It asks for an id, a name and which pieces you want, then writes `plugins/<id>/`. The
plugin is registered automatically and is on by default. Or say it all up front:

```bash
npm run new-plugin -- trend-alerts --panel --ai --author "Your name"
```

| Option | Adds |
| --- | --- |
| `--panel` | A panel in the left rail (`panel.tsx`) |
| `--shape` | A shape, a toolbar button that inserts it, and its properties (`card-shape.tsx`, `card-section.tsx`) |
| `--settings` | A section in Settings with a setting saved in the browser (`settings.tsx`) |
| `--server` | Server routes at `/api/plugins/<id>/…` and a command that calls them (`server/routes.ts`, `client.ts`) |
| `--ai` | A tool AI apps can call over MCP (`ai-tools.ts`) |
| `--all` | All of the above |
| `--name`, `--description`, `--category`, `--author`, `--url` | Descriptor fields (see below) |

Then `npm run dev` and open **Plugins** (the puzzle at the bottom of the left rail) to
see it. Delete what you don't need from the generated files; they're a starting point.

## A plugin folder

```
plugins/trend-alerts/
  index.tsx          the plugin: default-exports definePlugin({ … })   (required)
  panel.tsx          your code, laid out however you like
  model.ts           pure logic…
  model.test.ts      …tested with node --test (picked up by npm test)
  server/routes.ts   optional: routes at /api/plugins/trend-alerts/…
  server/*.ts        optional: anything else that runs on the server
```

- **The folder name is the plugin's id** (kebab-case), and the id in `index.tsx` must
  match. Folders starting with `_` or `.` are skipped, handy for a draft.
- **There's no list to add it to.** `scripts/plugins.mjs` finds plugin folders and
  writes `plugins/index.generated.ts` and `plugins/server.generated.ts` (don't edit
  those). `npm run dev` keeps them current as folders come and go, and `npm run build`
  rewrites them first; otherwise, `npm run plugins:sync`.
- **Everything the plugin uses lives in its folder.** Plugins don't import each other;
  shared needs go through the SDK (below).

## The descriptor

```tsx
"use client"

import { Notification01Icon } from "@hugeicons/core-free-icons"

import { definePlugin } from "@/sdk"

import { AlertsPanel } from "./panel"

export default definePlugin({
  id: "trend-alerts",
  name: "Trend alerts",
  version: "0.1.0",
  requiresSdk: "1.0.0",
  description: "Flags trend points that leave their normal band.",
  category: "data",
  icon: Notification01Icon,
  panels: [
    {
      id: "trend-alerts",
      title: "Trend alerts",
      icon: Notification01Icon,
      side: "left",
      order: 100,
      workspaces: ["canvas"],
      component: AlertsPanel,
    },
  ],
})
```

| Field | |
| --- | --- |
| `id` | Kebab-case, unique, the same as the folder name |
| `name`, `description` | Shown in the plugin manager |
| `version` | The plugin's own semver |
| `requiresSdk` | The SDK version it was written against (see [Versions](#versions)) |
| `category` | `core`, `drawing`, `libraries`, `data`, `media`, `connections` or `ai`; groups it in the plugin manager |
| `icon` | A Hugeicons icon from `@hugeicons/core-free-icons` (check the name exists) |
| `author`, `url` | Optional; shown in the plugin manager |
| `stage` | `"preview"` shows a Preview badge; `"planned"` lists it but it can't be turned on |
| `defaultEnabled` | `false` to ship off; plugins are on by default |
| `dependencies` | Plugin ids it can't work without. Turning this plugin on turns them on; turning one off turns this off |
| `optionalDependencies` | Plugins it works better with. It must still work without them |
| `required` | Built-in only: can't be turned off (the canvas core) |

## What a plugin can add

Each contribution is a list of items with an `id` and an `order`. Lists are sorted by
`order` across all plugins; equal orders fall back to plugin id order, so give a
distinct order when the position matters (e.g. "right after Insert image": 21). Ids
must be unique within a list, across plugins; startup stops with a clear error if two
clash.

**Canvas and shapes**

| Key | What it adds |
| --- | --- |
| `shapeUtils`, `bindingUtils`, `tools` | tldraw shape utils, binding utils and tools. Always registered, even while the plugin is off, so boards that use them keep loading |
| `ownsTldrawTools` | tldraw tool ids this plugin owns; they lose their shortcuts while it's off |
| `toolbar` | Tool dock buttons in a `group` (`navigate`, `draw`, `insert`, `present`): a tldraw `tool` id or your own `onSelect`, optional `variants` |
| `libraryCollections` | Tiles in the Library panel, under a `tab`, each with an `insert` |
| `shapeDecorators` | Wraps how every shape renders (live effects use this). Must render `children` |
| `canvasLayers` | Content in page space that pans and zooms with the board (value labels) |
| `canvasOverlays` | UI floating over the canvas in screen space |
| `canvasBackgrounds` | Full-viewport backgrounds behind the grid, picked in Settings → Canvas |
| `contextMenuItems` | Canvas right-click entries, with `when` and `disabled` |
| `pasteOptions` | Something a pasted shape can carry (behaviors, links): `strip` for plain paste, `capture` and `restore` for Paste special |
| `pageCategories` | Page categories the plugin brings; a category's `kind` decides which tools and panels show |

**Around the canvas**

| Key | What it adds |
| --- | --- |
| `panels` | Left or right dock panels for some `workspaces`, in a rail `group` (`board`, `connections`, `ai`); `currentIcon` for an icon that follows state |
| `inspectorTabs` | Tabs in the properties panel, with `when` and a `badge` count |
| `inspectorSections` | Sections in a properties tab (`tab: "design"` is the main one), shown `when` the selection suits them |
| `menuItems` | Menubar entries in a `menu` (`file`, `edit`, `object`, `arrange`, `view`, `insert`, `window`, `help`), grouped by `group`; a tldraw `action` id or `onSelect` |
| `commands` | Command palette entries, optionally with a global shortcut (`kbd: "cmd+shift+y"`) that's also listed in the shortcut sheet |
| `topbarItems`, `statusItems` | Small components in the top bar and the status bar (`align: "start" \| "end"`) |
| `settingsSections` | Sections of the Settings dialog, listed under a `page` (an existing one like `"Canvas"` or your own) |
| `workspaces` | Whole layouts: which left panel opens, which right panel shows |
| `providers` | React providers wrapped around the studio |
| `onEditorMount` | Runs once the editor is ready; return a function to clean up |

**Data, files and AI**

| Key | What it adds |
| --- | --- |
| `pointDrops` | Points dragged onto the canvas (from the Station panel): claim a shape under the pointer (`target` + `drop`), or offer things to make on empty canvas (`create`, `creates`, in a `group` flyout) |
| `fileImporters` | Files dropped on the board or added with the file picker (`accept`, `accepts`, `import`) |
| `textImporters` | Text and links pasted or dropped on the board: what they can become (`accepts`, `suggested`, `import`, `pageKinds`). When more than one thing fits, a menu offers them next to the board's own link card or text (see [Pasted links and text](#pasted-links-and-text)) |
| `connectionProbes` | Recognizes a building system at an address for Connect… (`probe`, `open`, `recognizes`), so typing or pasting an address opens the right connection's form, filled in (see [A connection probe](#a-connection-probe)) |
| `ai` | Tools, a short `guide` and shape descriptions for AI apps connected over MCP (see [AI tools](#ai-tools)) |

Callbacks like `onSelect`, `run` and `insert` get a `StudioContext`: the `editor`,
`runAction(id)` and `selectTool(id)` for tldraw's own actions and tools,
`setWorkspace(id)`, `openPanel(id)` and `openInspectorTab(id)`. In components, use
`useStudioContext()` for the same thing, or tldraw's `useEditor()`.

## The SDK

Plugins reach the studio only through the SDK, so the studio's insides can change
without breaking them.

| Import | Where | What's in it |
| --- | --- | --- |
| `@/sdk` | Browser code | Everything below |
| `@/sdk/server` | `plugins/<id>/server/*` | Routes, plugin files, the audit log, `probeHttp` for connection probes, plus the pure helpers |
| `../../sdk/core.ts` | Pure modules you test with `node --test` | The pure helpers: `validateInput`, `TOOL_NAME`, `parseTarget`, `safeUrl`, `parseAddress`, `isPrivateHost`, `SDK_VERSION` |

Also fine: `@/components/ui/*` (shadcn components), `@/lib/utils` (`cn`), tldraw and
any npm package. Not fine: `@/studio/*`, `@/server/*`, another plugin, or a relative
path out of your folder. ESLint flags these as you type and `npm test` checks them
(`plugins/boundaries.test.ts`). If the SDK lacks something you need, export it from
`sdk/` rather than reaching around it.

What `@/sdk` offers, by area (each file in `sdk/` documents its exports):

- **Plugin** (`sdk/plugin.ts`): `definePlugin`, every contribution type,
  `usePluginRuntime()` (which plugins are on, all contributions), `SDK_VERSION`.
- **Shell** (`sdk/shell.ts`): `shell` (below), `useStudioContext`, `Icon`, `Tip`,
  the property fields (`PanelHeader`, `PropertyRow`, `NumberField`, `ColorField`,
  `SelectField`, `Segmented`), `InlineName`, `sourceIcon`.
- **Storage** (`sdk/storage.ts`): `pluginStorage(id)`, `persistentAtom`.
- **Server calls** (`sdk/api.ts`): `pluginApi(id)`, `pluginApiUrl`, `PluginApiError`.
- **Live data** (`sdk/data.ts`): `useLivePoint`, `useLiveValues`, `usePointHistories`,
  `registerDataSource`, `useDataSources`, point drag-and-drop (`POINT_DRAG_TYPE`,
  `readPointDrag`), `offerPoints` (the menu of what points can become, as for a
  drop on empty canvas), `PointField`, `LiveValueBadge`, and addresses for
  connections (`parseAddress`, `isPrivateHost`).
- **Navigation** (`sdk/navigation.ts`): targets (`NavTarget`, `goTo`, `TargetField`).
- **Pages** (`sdk/pages.ts`): page kinds and categories (`currentPageKind`,
  `createPageIn`, `usePageGroups`).
- **Shapes** (`sdk/shapes.ts`): `registerShapeLabel`, shape names, hidden state,
  shape states and status, behavior binding.
- **Links** (`sdk/links.ts`): links between shapes and pages.
- **AI** (`sdk/ai.ts`): `safeBatch`, `validateInput`, input schemas (`pageIdSchema`,
  `pointIdSchema`, `sourceSchema`), `pageForInsert`, `resolvePoints`.
- **Board files** (`sdk/board.ts`): new, open, save, recent boards.

The `shell` object is the studio around the canvas:

| Member | |
| --- | --- |
| `shell.presenting`, `shell.boardName` | Present mode, the board's name (read with `useValue`) |
| `shell.rightPanelOpen`, `shell.railLabels`, `shell.canvasBackground` | Shell preferences you can read and set |
| `shell.showPanel(id)` | Opens a left panel in the current workspace |
| `shell.openSettings(page?)` | Opens Settings, optionally on a page |
| `shell.openCommandPalette(mode?)`, `shell.openShortcuts()`, `shell.openPlugins()` | The palette, the shortcut sheet, the plugin manager |
| `shell.openConnect(address?)` | Connect…: every connection probe checks the address (straight away when one is given) |

## Recipes

### A command with a shortcut

```tsx
commands: [
  {
    id: "trend-alerts-check",
    label: "Check trends now",
    group: "Trend alerts",
    order: 10,
    kbd: "cmd+shift+y",
    run: ({ editor }) => checkTrends(editor),
  },
],
```

### A shape

`npm run new-plugin -- my-plugin --shape` writes a working one. What matters:

- **The type is saved in board files**, so pick it once: start it with your plugin id
  (`"trend-alerts-badge"`) so it can't clash with another plugin's, and never rename
  it once boards use it. Startup warns about types without the prefix and stops on a
  clash.
- **Declare its props** for tldraw's type checking and validators:

  ```ts
  declare module "tldraw" {
    export interface TLGlobalShapePropsMap {
      [BADGE_TYPE]: BadgeProps
    }
  }
  ```

  Adding a prop later needs a tldraw shape migration; boards saved earlier still have
  the old props.
- **Name it** with `registerShapeLabel(type, () => "Badge")` for the layers list and
  the AI.
- **Exports**: HTML shapes don't draw into SVG/PNG exports by themselves; give the
  util a `toSvg` (see `plugins/web-view/web-shape.tsx`).
- **Engine pieces stay registered while the plugin is off.** Hide UI, not shapes.

### A setting

```ts
import { pluginStorage } from "@/sdk"

const storage = pluginStorage("trend-alerts")

/** Kept in this browser under `lemscape.plugin.trend-alerts.band`. */
export const band = storage.atom("band", 2, (v): v is number => typeof v === "number")
```

Read it with `useValue(band)` in components or `band.get()` anywhere; set it with
`band.set(3)`. Show it in a `settingsSections` entry. Settings belong to the browser;
anything that should travel with a board goes in shape props or meta. When you rename
a key, pass the old one so saved values move over:
`storage.atom("band", 2, isNumber, { from: ["lemscape.plugin.trend-alerts.width"] })`.
For code that reads `localStorage` or `sessionStorage` itself, `storage.key(name)`
gives the full key.

### Server routes

Code that needs Node (a protocol SDK, a database driver, credentials) goes in
`server/`. Routes go in `server/routes.ts`:

```ts
import "server-only"

import { definePluginRoutes, PluginRouteError } from "@/sdk/server"

import { getHub } from "./hub"

export default definePluginRoutes({
  "GET /sites": async () => Response.json({ sites: await getHub().sites() }),

  "GET /sites/:id": async ({ params }) => {
    const site = await getHub().site(params.id)
    if (!site) throw new PluginRouteError(404, "No such site.")
    return Response.json({ site })
  },

  "POST /sites": async ({ json }) => {
    const { name } = await json<{ name?: unknown }>()
    if (typeof name !== "string") throw new PluginRouteError(400, "Send a name.")
    return Response.json({ site: await getHub().add(name) })
  },
})
```

- They're served at `/api/plugins/<id>/…`. Keys are `"METHOD /path"`: methods are
  `GET`, `POST`, `PUT`, `PATCH`, `DELETE` or `*`; `:name` matches a segment
  (`params.name`); a last `*name` takes the rest of the path (none or more segments).
  `"/"` is the plugin's root. The first match in order wins; a path that exists for
  other methods answers 405.
- A handler gets `{ request, params, query, path, json() }` and returns a `Response`.
  Streaming responses (server-sent events) work too: return a `ReadableStream` body.
- **The request guard runs first, for every route**: local addresses only, same
  origin, JSON bodies for writes. You can't forget it.
- Throw `PluginRouteError(status, message)` to answer with an error; anything else
  thrown answers 500 and is logged as `[plugin:<id>]`.
- Files the plugin keeps on this machine go in `pluginDataPath(id, "name.json")`
  (`.lemscape/plugins/<id>/`, never committed). Never send credentials or cookies to
  the browser; keep them in server memory or those files.

From the browser:

```ts
import { pluginApi, PluginApiError } from "@/sdk"

const api = pluginApi("trend-alerts")
const { sites } = await api.get<{ sites: Site[] }>("/sites")
await api.post("/sites", { name: "Plant" })
const events = new EventSource(api.url("/live"))
```

A failed call throws a `PluginApiError` carrying the server's message and `status`.

### AI tools

AI apps (Claude, ChatGPT, Codex…) reach the board over MCP; a plugin offers them
tools in `ai.tools`, a few sentences in `ai.guide`, and descriptions of its shapes in
`ai.shapes`. See `plugins/web-view/ai-tools.ts` for a small one.

- Names are snake_case and unique across plugins; descriptions are written for the
  AI (what it does, when to use it, what comes back).
- `inputSchema` uses the JSON Schema subset in `validateInput`; the input is checked
  before your tool runs. Check everything else up front too, before changing
  anything.
- Throw an `Error` with a sentence the AI can act on.
- `access: "read"` reads; `"edit"` changes the board (one undo step per call). Wrap
  board changes made after an `await` in `safeBatch`: tldraw crashes the editor on
  anything thrown inside an edit batch.
- Anything that changes an outside system (writing a point, acknowledging an alarm) is
  `access: "write"`: `prepare` returns a plan, the person approves it (Allow once, then
  "Are you sure?"), and only then `commit` runs, logged with `appendAudit`. Never
  change an outside system any other way.

### Live data

Shapes and panels that show live values use `useLivePoint(ref)` or
`useLiveValues(refs)`, never a connection plugin's own client, so they work with any
source. A connection plugin publishes values with `registerDataSource(source)` when
it connects and calls what that returns when it disconnects, and in `onEditorMount`'s
cleanup so turning the plugin off stops its values; see `plugins/niagara-baskstream`
for a full one. Sources come and go with connections and are keyed by the system they
reach (`niagara:<station>`), which is why this is a call and not a contribution list.

To turn points into something on the board (rows of a points list that matched, say),
`offerPoints({ points, label, at })` opens the same menu as points dropped on empty
canvas: every plugin's live table, panel, trend or symbol, plus any `extras` you add.

### Pasted links and text

What gets pasted or dropped on the board (a link from a browser, rows copied from a
spreadsheet) goes to `textImporters`. The board's own handling, a link card or a text
shape, is always one of the choices; when nothing else fits the paste just happens, and
otherwise a menu opens where it lands, its first choice ready for Enter. The web view's:

```tsx
textImporters: [
  {
    id: "web-view",
    order: 20,
    label: "Web view",
    icon: BrowserIcon,
    accepts: ({ url }) => url !== undefined,
    import: ({ editor }, { url }, at) => createWebView(editor, at, url!.href),
  },
],
```

- `url` is set when the text is one web address; `text` is the plain text (rows from a
  spreadsheet arrive tab-separated) and `html` whatever HTML came with it.
- `suggested` lists an option ahead of the default (media import's Table, for copied
  rows). `pageKinds` limits where it's offered (default: UI and Documents pages).
- Several links pasted at once become link cards without asking.
- A link that a connection probe `recognizes` also offers Connect….

### A connection probe

Connect… (File → Connect…, the + under the connection panels, a pasted link) takes an
address and asks every enabled plugin's `connectionProbes` what's there. When exactly
one recognizes it, that connection's form opens filled in; otherwise the person picks.
A probe checks through its plugin's own server route, since a browser can't read
another site's answers. A Haystack plugin's, for nHaystack on a station:

```ts
// server/routes.ts
import { definePluginRoutes, PluginRouteError, probeHttp } from "@/sdk/server"

export default definePluginRoutes({
  "GET /probe": async ({ query, request }) => {
    const address = query.get("address")
    if (!address) throw new PluginRouteError(400, "Send an address.")
    const about = await probeHttp(address, "/haystack/about", {
      headers: { accept: "application/json" },
      signal: request.signal,
    })
    if ("error" in about) return Response.json({ error: about.error, match: null })
    const answers = about.status === 200 && /"ver"|ver:"/.test(about.body)
    const signIn =
      about.status === 401 &&
      /scram|hello/i.test(about.headers["www-authenticate"] ?? "")
    if (!answers && !signIn) return Response.json({ match: null })
    return Response.json({
      match: {
        title: "Haystack server",
        detail: answers ? "Haystack answers at /haystack" : "Haystack sign-in",
        address: `${about.origin}/haystack`,
        confidence: answers ? "certain" : "likely",
      },
    })
  },
})
```

```tsx
// client/probe.ts
export const haystackProbe: ConnectionProbeContribution = {
  id: "haystack-server",
  order: 20,
  label: "Haystack server",
  icon: HAYSTACK_ICON,
  recognizes: (url) => url.pathname.startsWith("/haystack"),
  async probe(address, signal) {
    const result = await api.request<{
      error?: string
      match: ConnectionMatch | null
    }>(`/probe?address=${encodeURIComponent(address)}`, { signal })
    if (result.error) throw new Error(result.error)
    return result.match
  },
  open(ctx, address, match) {
    connectDraft.set({ uri: match?.address ?? address }) // your form's own state
    ctx.openPanel("haystack")
  },
}
```

- `probeHttp(address, path)` works out https or http when no scheme was typed, never
  sends credentials or follows redirects (a redirect to a sign-in page is an answer
  too), reads at most 64 KB, and reports a certificate the computer doesn't trust as
  `certificateProblem` rather than failing.
- Resolve to `null` when something else answers; throw an Error with a sentence when
  nothing does ("Nothing is listening at 10.0.0.20.").
- `open` fills the form and shows it; the person signs in. Never connect by yourself.
- `recognizes` is a quick check with no network, for pasted links: a path only your
  system uses, or a private-network host (`isPrivateHost`).

## The rules

- **Turning a plugin off never deletes content.** Shapes stay registered; only the UI,
  runtime effects and AI tools go away.
- **Optional dependencies degrade gracefully.** Check
  `usePluginRuntime().enabled.has("behaviors")` before relying on one.
- **All visible UI is shadcn** (`@/components/ui/*`, on Base UI): compose with the
  `render` prop, menus use `onClick`, switches `onCheckedChange`. Never render
  tldraw's own UI components. Icons are Hugeicons, drawn with `Icon`.
- **Give focus back to the canvas** (`editor.focus()`) after a menu or property
  control acts, so shortcuts keep working.
- **Settings go in `pluginStorage`**, board content in shape props or meta.
- **Names**: shape and binding types and tool ids start with the plugin id;
  contribution ids are unique within their list.

## Versions

`requiresSdk` is the SDK version a plugin was written against. It loads when the SDK
has the same major version and is at least as new; otherwise startup says which
plugin needs what. The current version is `SDK_VERSION` in
`studio/plugins/registry.ts`: its minor version goes up when the SDK gains something,
its major version when something plugins rely on changes or goes away.

## Checks and tests

- `npm run check` runs everything: generated files current, types, lint, tests. Run it
  before you're done.
- `*.test.ts` files in your plugin run with `npm test` (`node --test`, which strips
  types itself). Keep tested modules pure: relative imports with the `.ts` extension,
  no `@/` aliases, no TypeScript-only syntax like enums or constructor parameter
  properties, and the pure SDK helpers from `../../sdk/core.ts`.
- For UI, check it in the browser too.

## Debugging

- In development, `window.lemscapePlugins` in the browser console has every plugin,
  what's on (`enabled`, `active`), every contribution in order, and the engine
  pieces.
- A problem in the plugin set (a bad id, an unknown dependency, clashing names, an SDK
  mismatch) stops startup with `Invalid plugin registry:` and a list of what's wrong.
- A contribution that throws is caught where it renders and logged as
  `[plugin:<id>]`; the rest of the studio keeps working. Server routes log the same
  way.
- **Removing a plugin**: delete its folder. Boards that contain its shapes won't open
  without it, so prefer turning it off.
