"use client"

// Word documents become HTML (mammoth), cleaned before it's shown: no scripts, no
// event handlers, links only to web or mail addresses, images only inline. Headings
// split the document into sections, which work like pages for navigation and links.

export interface WordDocument {
  html: string
  sections: string[]
}

const DROP = "script, style, iframe, object, embed, link, meta, form, base"

function clean(raw: string): WordDocument {
  const doc = new DOMParser().parseFromString(raw, "text/html")
  doc.querySelectorAll(DROP).forEach((el) => el.remove())
  for (const el of doc.body.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith("on")) el.removeAttribute(attr.name)
      else if (name === "href" && !/^(https?:|mailto:|#)/.test(value))
        el.removeAttribute(attr.name)
      else if (name === "src" && !value.startsWith("data:image/"))
        el.removeAttribute(attr.name)
    }
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank")
      el.setAttribute("rel", "noopener noreferrer")
    }
  }
  const sections: string[] = []
  doc.body.querySelectorAll("h1, h2").forEach((heading) => {
    sections.push(
      heading.textContent?.trim() || `Section ${sections.length + 1}`
    )
    heading.setAttribute("data-section", String(sections.length))
  })
  return {
    html: doc.body.innerHTML,
    sections: sections.length ? sections : ["Document"],
  }
}

const cache = new Map<string, Promise<WordDocument>>()

/** Converts (and caches) a .docx. */
export function wordDocument(
  key: string,
  bytes: () => Promise<ArrayBuffer>
): Promise<WordDocument> {
  let doc = cache.get(key)
  if (!doc) {
    doc = (async () => {
      const mammoth = (await import("mammoth")).default
      const result = await mammoth.convertToHtml({ arrayBuffer: await bytes() })
      return clean(result.value)
    })()
    cache.set(key, doc)
    doc.catch(() => cache.delete(key))
  }
  return doc
}

/** Each section's text (sections split at h1/h2 headings, as on the card). */
export function sectionTexts(doc: WordDocument): string[] {
  const body = new DOMParser().parseFromString(doc.html, "text/html").body
  const texts = doc.sections.map(() => "")
  let current = 0
  for (const node of [...body.children]) {
    const marker = node.getAttribute("data-section")
    if (marker)
      current = Math.min(texts.length - 1, Math.max(0, Number(marker) - 1))
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim()
    if (text) texts[current] += `${text}\n`
  }
  return texts.map((text) => text.trim())
}
