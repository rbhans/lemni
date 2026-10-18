// The Lemscape plugin SDK: everything a plugin's client code uses from the studio.
//
// Plugins import from here (plus shadcn's `@/components/ui/*`, `@/lib/utils`, tldraw
// and npm packages), never from `studio/` directly, so the studio can change underneath
// without breaking them. Server code imports `@/sdk/server`; pure modules that
// `node --test` runs import `sdk/core.ts` by relative path.
//
// docs/PLUGINS.md is the guide; each area file below documents its part.

export * from "./plugin"
export * from "./shell"
export * from "./storage"
export * from "./api"
export * from "./data"
export * from "./navigation"
export * from "./pages"
export * from "./shapes"
export * from "./links"
export * from "./ai"
export * from "./board"
