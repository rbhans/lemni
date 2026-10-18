// Where a click can take people: a page, a shape, a page of a document card, a station
// point, or a web address, stored as one string ("a target") so it fits in any setting.

export {
  parseTarget,
  safeUrl,
  serializeTarget,
  type NavTarget,
} from "@/studio/navigation/targets"

/** Goes to a target (fits the view to a shape, opens a URL, reveals a point). */
export { goTo, targetLabel, type Framing } from "@/studio/navigation/navigate"

/** A property-panel field for choosing a target, including picking a shape on the board. */
export { TargetField } from "@/studio/navigation/target-field"
