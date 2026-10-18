// Pages and their categories (Documents, UI, a plugin's own like the wire sheet). A
// category's `kind` decides which tools and panels a page offers.

export {
  categoryIdOf,
  customCategories,
  DEFAULT_CATEGORY,
  groupPages,
  kindOf,
  PAGE_KINDS,
  type CategoryWithPages,
  type PageCategory,
} from "@/studio/pages/categories"

export {
  createPageIn,
  currentPageKind,
  pageKindOf,
  setPageCategory,
  useCategories,
  usePageGroups,
} from "@/studio/pages/page-categories"
