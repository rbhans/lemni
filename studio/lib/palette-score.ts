// Command palette matching. Pure module.

/**
 * Word-aware matching: every typed word must appear in the label or keywords. Labels
 * that start with (or contain) the query rank first. Avoids fuzzy matches that string
 * letters together across unrelated words.
 */
export function scoreEntry(
  label: string,
  keywords: readonly string[],
  search: string
): number {
  const query = search.trim().toLowerCase()
  if (!query) return 1
  const name = label.toLowerCase()
  if (name.startsWith(query)) return 1
  if (name.split(/\s+/).some((word) => word.startsWith(query))) return 0.9
  if (name.includes(query)) return 0.8
  const haystack = `${name} ${keywords.join(" ").toLowerCase()}`
  const words = query.split(/\s+/)
  return words.every((word) => haystack.includes(word)) ? 0.5 : 0
}
