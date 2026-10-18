import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

// docs/PLUGINS.md is how people learn what a plugin can do, so every field of the
// plugin descriptor has to be in it. Add a contribution point, document it there.

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

/** The member names of an interface, from its source. */
function membersOf(source: string, name: string): string[] {
  const start = source.indexOf(`export interface ${name} `)
  assert.ok(start >= 0, `interface ${name} not found`)
  const body = source.slice(source.indexOf("{", start) + 1)
  const members: string[] = []
  let depth = 0
  for (const line of body.split("\n")) {
    if (depth === 0) {
      if (line.startsWith("}")) break
      const member = /^ {2}(\w+)\??[:(]/.exec(line)
      if (member) members.push(member[1])
    }
    depth += (line.match(/[{(]/g) ?? []).length
    depth -= (line.match(/[})]/g) ?? []).length
  }
  return members
}

test("docs/PLUGINS.md covers every descriptor field and contribution point", () => {
  const guide = read("docs/PLUGINS.md")
  const fields = [
    ...membersOf(read("studio/plugins/registry.ts"), "PluginNode"),
    ...membersOf(read("studio/plugins/types.ts"), "BoardPlugin"),
  ]
  assert.ok(fields.length > 30, `only found ${fields.length} fields`)
  const missing = fields.filter((field) => !guide.includes(`\`${field}\``))
  assert.deepEqual(missing, [], "add these to docs/PLUGINS.md")
})
