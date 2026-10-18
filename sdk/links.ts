// Links between places on the board (a pin on a floor plan ↔ a page of a submittal),
// kept in the document so they travel with the board.

export {
  connects,
  endKey,
  linksOf,
  otherEnd,
  remapLinks,
  sameEnd,
  shapeOf,
  sideOf,
  type BoardLink,
  type LinkEnd,
} from "@/studio/links/model"

export {
  addLinks,
  createLink,
  deleteLink,
  endExists,
  endLabel,
  endPageId,
  endPlace,
  getLinks,
  goToEnd,
  installLinkPruning,
  isLinkable,
  linkMark,
  linkToMark,
  markForLink,
  newLinkId,
  pendingComment,
  registerLinkable,
  selectedEnd,
  selectedLink,
  setLinkComment,
  useLinks,
} from "@/studio/links/links"
