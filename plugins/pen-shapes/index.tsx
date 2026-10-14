import {
  ArrowUpRight01Icon,
  CircleIcon,
  CloudIcon,
  DiamondIcon,
  Eraser01Icon,
  HexagonIcon,
  HighlighterIcon,
  LineIcon,
  MousePointerClickIcon,
  PencilIcon,
  ShapesIcon,
  SquareIcon,
  StarIcon,
  StickyNote02Icon,
  TextFontIcon,
  Triangle01Icon,
} from "@hugeicons/core-free-icons"
import { GeoShapeGeoStyle } from "tldraw"

import type { BoardPlugin } from "@/studio/plugins/types"

import {
  hasStyleTarget,
  hasTextStyles,
  StyleSection,
  TextSection,
} from "./style-section"

const GEO_TOOLS = [...GeoShapeGeoStyle.values]

export const penShapes: BoardPlugin = {
  id: "pen-shapes",
  name: "Pen & shapes",
  version: "0.1.0",
  description:
    "Pen, highlighter, eraser, arrows, lines, text, notes and basic shapes.",
  category: "drawing",
  icon: PencilIcon,
  ownsTldrawTools: [
    "draw",
    "highlight",
    "eraser",
    "arrow",
    "line",
    "text",
    "note",
    "laser",
    ...GEO_TOOLS,
  ],

  // Basic shapes live in the toolbar's Shapes button, not the Library.
  toolbar: [
    {
      id: "draw",
      group: "draw",
      order: 10,
      label: "Pen",
      icon: PencilIcon,
      tool: "draw",
    },
    {
      id: "eraser",
      group: "draw",
      order: 20,
      label: "Eraser",
      icon: Eraser01Icon,
      tool: "eraser",
    },
    {
      id: "arrow",
      group: "draw",
      order: 30,
      label: "Arrow",
      icon: ArrowUpRight01Icon,
      tool: "arrow",
    },
    {
      id: "text",
      group: "draw",
      order: 40,
      label: "Text",
      icon: TextFontIcon,
      tool: "text",
    },
    {
      id: "note",
      group: "draw",
      order: 50,
      label: "Note",
      icon: StickyNote02Icon,
      tool: "note",
    },
    {
      id: "shapes",
      group: "draw",
      order: 60,
      label: "Shapes",
      icon: ShapesIcon,
      variants: [
        {
          id: "rectangle",
          label: "Rectangle",
          icon: SquareIcon,
          tool: "rectangle",
        },
        { id: "ellipse", label: "Ellipse", icon: CircleIcon, tool: "ellipse" },
        {
          id: "triangle",
          label: "Triangle",
          icon: Triangle01Icon,
          tool: "triangle",
        },
        { id: "diamond", label: "Diamond", icon: DiamondIcon, tool: "diamond" },
        { id: "hexagon", label: "Hexagon", icon: HexagonIcon, tool: "hexagon" },
        { id: "star", label: "Star", icon: StarIcon, tool: "star" },
        { id: "cloud", label: "Cloud", icon: CloudIcon, tool: "cloud" },
        { id: "line", label: "Line", icon: LineIcon, tool: "line" },
        {
          id: "highlight",
          label: "Highlighter",
          icon: HighlighterIcon,
          tool: "highlight",
        },
      ],
    },
    {
      id: "laser",
      group: "present",
      order: 10,
      label: "Laser pointer",
      icon: MousePointerClickIcon,
      tool: "laser",
    },
  ],

  inspectorSections: [
    {
      id: "style",
      tab: "design",
      title: "Appearance",
      order: 30,
      when: hasStyleTarget,
      component: StyleSection,
    },
    {
      id: "text",
      tab: "design",
      title: "Text",
      order: 40,
      when: hasTextStyles,
      component: TextSection,
    },
  ],
}
