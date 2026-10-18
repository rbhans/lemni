// Shapes beyond their ShapeUtil: what they're called in the UI, names and hidden flags
// people set, states a shape can show (running, alarm…), and binding behaviors to them.

/** The name a shape type shows in menus and the Layers panel ("Chart", "Panel"). */
export { registerShapeLabel, shapeLabel } from "@/studio/lib/shape-labels"

/** Names people give shapes, and the Layers panel's eye toggle. */
export {
  customShapeName,
  isHidden,
  renameShape,
  setHidden,
  shapeDisplayName,
} from "@/studio/lib/shape-names"

/** States a shape can be shown in, and the status a behavior has put it in. */
export {
  getShapeStates,
  ShapeStateContext,
  ShapeStatusContext,
  useShapeStateOverrides,
  useShapeStatus,
  type ShapeStateDef,
  type ShapeStateSource,
  type ShapeStateValues,
} from "@/studio/editor/shape-states"

/**
 * Lets a plugin bind behaviors to shapes without depending on the behaviors plugin:
 * the behaviors plugin registers the binder; others call `bindBehavior`.
 */
export {
  bindBehavior,
  canBindBehaviors,
  registerBehaviorBinder,
  type BindingRequest,
} from "@/studio/editor/behavior-binding"
