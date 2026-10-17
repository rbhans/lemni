# Symbol library: base parts (Plate style)

Each piece is a standalone SVG with its own styles. Properties are switched by adding classes to the root `<svg>`.
The `.nx` class must stay on it.

## Grid
- Coil = 100 px tall, and sizes are in 10 px steps.
- The duct or pipe line runs through the **center** of the viewBox, so rotate and flip work around the center.
- The base orientation is horizontal, with flow left to right. Roof fans are the exception: the duct comes up from below.
- Lines (`duct`, `pipe`) and junctions have no margin, so segments join end to end.

## Root classes
| class | effect |
|---|---|
| `dk` | dark theme (light is the default) |
| `on` | active: color on moving/active parts, plus animation |
| `ccw` | fans, pumps, chiller: mirrors the blades and reverses the spin (plug fan: blades run the other way) |
| `flow` | duct / pipe: animated flow along the line |
| `parallel` | damper: parallel blades (opposed is the default) |
| `loaded` | filter: dirty |
| `st-alarm` `st-fault` `st-down` `st-overridden` `st-stale` `st-disabled` | status: the plate takes Niagara's status color and steps out to 6 px; disabled also grays out its lines and active color (faces stay solid) |

## Status plate
Every piece except duct, pipe and their junctions has one `.plate` group: a copy of its outline at +4 px, drawn behind everything in the shadow color. At ok it is the normal shadow; a status class colors it.

## CSS variables
- `--blade`: damper blade angle. `0deg` is open, `90deg` is closed; the default is `45deg`.
- `--level`: tank fill, from 0 to 1; the default is `.6`.
- `--sash`: fume hood sash opening, from 0 (closed) to 1 (fully open); the default is `.5`.

## Groups
- `.body`: the drawing.
- `.label`: sensor text. When the module flips a piece, it should counter-flip this group so the text stays readable.

## Phoenix valve
- `on`: the cone slides along the shaft into the venturi throat and back, while the spring compresses and relaxes.
  This is how the valve holds constant airflow as duct pressure changes.
