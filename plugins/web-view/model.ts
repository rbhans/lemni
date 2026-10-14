// Web view address handling. Pure (no React, no DOM, relative imports only) so
// `node --test` can run it.

export type AddressResult = { url: string } | { error: string }

/**
 * Turns what someone typed into an address the web view may load. Bare hosts get
 * https://; only http and https load; addresses with a password in them are refused
 * (the board file would keep it), and the board can't show itself.
 */
export function normalizeAddress(
  input: string,
  appOrigin: string | null = null
): AddressResult {
  const text = input.trim()
  if (!text) return { error: "Enter an address." }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text)
    ? text
    : `https://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return { error: "That doesn't look like a web address." }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { error: "Only http and https addresses can be shown." }
  if (url.username || url.password)
    return {
      error:
        "Leave the login out of the address and sign in on the page instead; the board would save it.",
    }
  if (appOrigin && url.origin === appOrigin)
    return { error: "A board can't show itself in a web view." }
  return { url: url.href }
}

/** Short name for the title bar: the host (and port, when there is one). */
export function siteLabel(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
