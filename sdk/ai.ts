// Helpers for a plugin's AI tools (its `ai` contribution). AI apps connect over MCP and
// call these tools by name; see docs/PLUGINS.md → AI tools for the rules.

/**
 * Runs board changes made after an `await` in one undoable step. tldraw crashes the
 * editor on anything thrown inside an edit batch, so check input before changing
 * anything and wrap the changes in this.
 */
export { safeBatch } from "@/studio/ai/batch"

/** The JSON Schema subset tool inputs use, and the validator the runtime applies. */
export {
  TOOL_NAME,
  validateInput,
  type AiAccessLevel,
  type AiToolAccess,
  type JsonSchema,
} from "@/studio/ai/schema"

/** Common input fields: a page to put things on, and points from a connection. */
export { pageForInsert, pageIdSchema } from "@/studio/ai/pages"
export {
  pickSource,
  pointIdSchema,
  pointLabel,
  resolvePoints,
  sourceSchema,
} from "@/studio/ai/points"
