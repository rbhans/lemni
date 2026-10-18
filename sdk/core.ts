// The part of the SDK with no React, DOM or path aliases, for a plugin's pure modules
// (models, parsers, AI input checks) so `node --test` can run them directly:
//
//   import { validateInput } from "../../sdk/core.ts"
//
// Everything here is also exported from `@/sdk`.

export { SDK_VERSION } from "../studio/plugins/registry.ts"

export {
  TOOL_NAME,
  validateInput,
  type AiAccessLevel,
  type AiToolAccess,
  type JsonSchema,
} from "../studio/ai/schema.ts"

export {
  parseTarget,
  safeUrl,
  serializeTarget,
  type NavTarget,
} from "../studio/navigation/targets.ts"

/** Addresses people type for a station or server, and whether a host is on a private network. */
export {
  isPrivateHost,
  parseAddress,
  type ParsedAddress,
} from "../studio/lib/address.ts"
