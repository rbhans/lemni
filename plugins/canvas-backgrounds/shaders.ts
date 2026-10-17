/**
 * Fragment shaders for the animated canvas backgrounds. Each one only works out a
 * pattern: `a` is how strongly to tint a pixel (0–1) and `t` mixes between the two
 * theme tints. The shared wrapper keeps every background faint away from the
 * cursor, so the grid and shapes above it stay easy to read.
 *
 * Inputs every body can use:
 * - `uv`: height-normalized, centred, drifting with the camera; `suv` is the same
 *   without the drift (screen-fixed, matches `mouse`).
 * - `mouse`, `hover` (0–1, eases in and out), `u_mouseVel` (suv units/s).
 * - `ripple(i)`: one of 4 recent clicks as (suv position, age in seconds; age < 0 is unused).
 * - `bayer8(cell)`: ordered dither threshold.
 * - `css`: this pixel in CSS px from the top left; `u_mousePx`, `u_ripples` (CSS px
 *   and start time), `u_grid` (dot offset x, y and spacing in CSS px; spacing 0
 *   when the grid is off).
 */

export interface ShaderBackground {
  id: string
  label: string
  /** GLSL body that sets `float a` and `float t`. */
  body: string
  /** Fraction of the device pixel ratio to render at. Soft patterns can go lower. */
  resolution: number
  /** Multiplies the shared strength, for patterns that only cover a little area. */
  gain?: number
  /**
   * A feedback simulation run before each frame into a low-res texture the body
   * reads as `u_sim`. Sets `vec4 state` from `vec4 prev` (this texel last frame).
   */
  sim?: string
  /** Simulation texture size as a fraction of the canvas's CSS size. */
  simScale?: number
  /**
   * Characters drawn into an atlas the body samples as `u_glyphs` (one cell per
   * character, left to right, `u_glyphCount` of them), each `width`×`height` CSS px.
   */
  glyphs?: { chars: string; width: number; height: number }
}

const HEADER = /* glsl */ `#extension GL_OES_standard_derivatives : enable
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform vec2 u_css;
uniform float u_scale;
uniform float u_time;
uniform float u_dt;
uniform vec2 u_offset;
uniform vec2 u_mousePx;
uniform vec2 u_mouseVel;
uniform float u_hover;
uniform vec4 u_ripples[4];
uniform vec3 u_grid;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    v += amp * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    amp *= 0.5;
  }
  return v;
}

/** CSS px (top-left origin) to screen uv. */
vec2 toUv(vec2 px) {
  vec2 device = vec2(px.x, u_css.y - px.y) * u_scale;
  return (device - 0.5 * u_res) / u_res.y;
}

/** Click i as (screen uv, age in seconds); age is negative when unused. */
vec3 ripple(int i) {
  vec4 r = u_ripples[0];
  if (i == 1) r = u_ripples[1];
  if (i == 2) r = u_ripples[2];
  if (i == 3) r = u_ripples[3];
  return vec3(toUv(r.xy), r.z < 0.0 ? -1.0 : u_time - r.z);
}

/** Ordered (Bayer) dither threshold for an integer cell, 0–1. */
float bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

/** Pushes p away from m, strongest within radius. */
vec2 repel(vec2 p, vec2 m, float amount, float radius) {
  vec2 d = p - m;
  float r = length(d);
  return p + d / max(r, 1e-4) * amount * exp(-(r * r) / (radius * radius));
}
`

export function fragmentSource(background: ShaderBackground): string {
  return `${HEADER}
uniform vec3 u_tintA;
uniform vec3 u_tintB;
uniform float u_strength;
uniform sampler2D u_sim;
uniform sampler2D u_glyphs;
uniform float u_glyphCount;
void main() {
  vec2 suv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 uv = suv + u_offset;
  vec2 css = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_scale;
  vec2 mouse = toUv(u_mousePx);
  float hover = u_hover;
  float time = u_time;
  float a = 0.0;
  float t = 0.5;
  ${background.body}
  a = clamp(a * u_strength, 0.0, 1.0);
  vec3 color = mix(u_tintA, u_tintB, clamp(t, 0.0, 1.0));
  gl_FragColor = vec4(color * a, a);
}`
}

export function simSource(background: ShaderBackground): string {
  return `${HEADER}
uniform sampler2D u_prev;
uniform vec2 u_simRes;
void main() {
  vec2 st = gl_FragCoord.xy / u_simRes;
  float aspect = u_simRes.x / u_simRes.y;
  vec2 mouse = vec2(u_mousePx.x / u_css.x, 1.0 - u_mousePx.y / u_css.y);
  float hover = u_hover;
  float time = u_time;
  float dt = u_dt;
  vec4 prev = texture2D(u_prev, st);
  vec4 state = prev;
  ${background.sim}
  gl_FragColor = clamp(state, 0.0, 1.0);
}`
}

export const VERTEX_SOURCE = /* glsl */ `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

export const shaderBackgrounds: ShaderBackground[] = [
  {
    id: "ink",
    label: "Liquid ink",
    resolution: 0.75,
    gain: 1.8,
    simScale: 0.3,
    // r: ink, g: which tint, b/a: velocity (0.5 is still), in screen heights per second.
    sim: /* glsl */ `
      vec2 vel = (prev.ba - 0.5) * 2.0;
      // Curl noise keeps the ink turning over even when nothing pushes it.
      vec2 p = vec2(st.x * aspect, st.y) * 2.5 + vec2(time * 0.04, -time * 0.03);
      float e = 0.02;
      vec2 curl = vec2(
        noise(p + vec2(0.0, e)) - noise(p - vec2(0.0, e)),
        noise(p - vec2(e, 0.0)) - noise(p + vec2(e, 0.0))
      ) / (2.0 * e);
      vec2 flow = vel + curl * 0.09;
      vec2 back = st - flow * dt * vec2(1.0 / aspect, 1.0);
      vec4 src = texture2D(u_prev, back);

      float ink = src.r;
      float hue = src.g;
      vec2 v = (src.ba - 0.5) * 2.0;
      // Fade by a fraction and a little constant, so 8-bit values still reach zero.
      ink = max(ink * exp(-dt * 0.45) - dt * 0.12, 0.0);
      float speed = length(v);
      v *= max(speed * exp(-dt * 1.1) - dt * 0.35, 0.0) / max(speed, 1e-4);

      vec2 d = vec2((st.x - mouse.x) * aspect, st.y - mouse.y);
      float splat = exp(-dot(d, d) / 0.0035) * hover;
      float push = clamp(length(u_mouseVel), 0.0, 3.0);
      v += splat * clamp(u_mouseVel * 0.9, -1.0, 1.0) * dt * 14.0;
      ink += splat * min(push * dt * 6.0, 0.6);
      hue = mix(hue, 0.5 + 0.5 * sin(time * 0.35), clamp(splat * push * dt * 8.0, 0.0, 1.0));

      // Two slow sources so there is always a little ink about.
      for (int i = 0; i < 2; i++) {
        float fi = float(i);
        vec2 c = vec2(0.5 + 0.38 * sin(time * (0.07 + fi * 0.03) + fi * 3.0),
                      0.5 + 0.32 * cos(time * (0.05 + fi * 0.04) + fi * 1.7));
        vec2 dc = vec2((st.x - c.x) * aspect, st.y - c.y);
        float s = exp(-dot(dc, dc) / 0.004);
        ink += s * dt * 0.5;
        hue = mix(hue, fi, s * dt * 2.0);
        v += s * vec2(-dc.y, dc.x) * dt * 6.0;
      }

      state = vec4(ink, hue, clamp(v * 0.5 + 0.5, 0.0, 1.0));
    `,
    body: /* glsl */ `
      vec4 s = texture2D(u_sim, gl_FragCoord.xy / u_res);
      float speed = length((s.ba - 0.5) * 2.0);
      a = smoothstep(0.0, 0.9, s.r) * (0.7 + speed * 0.9);
      t = s.g + speed * 0.4;
    `,
  },
  {
    id: "dot-lens",
    label: "Dot lens",
    resolution: 1,
    gain: 3,
    body: /* glsl */ `
      vec2 m = u_mousePx;
      float spot = exp(-dot(css - m, css - m) / (260.0 * 260.0)) * hover;
      a = spot * 0.12;
      t = 0.3;
      if (u_grid.z > 0.0) {
        vec2 cell = floor((css - u_grid.xy) / u_grid.z + 0.5);
        vec2 pt = cell * u_grid.z + u_grid.xy;
        float md = length(pt - m);
        float level = exp(-(md * md) / (150.0 * 150.0)) * hover;
        // A slow swell crossing the field keeps it alive with no cursor about.
        float swell = 0.5 + 0.5 * sin(pt.x * 0.006 - time * 0.5 + sin(pt.y * 0.004 + time * 0.2) * 2.5);
        level += pow(swell, 4.0) * 0.22;
        for (int i = 0; i < 4; i++) {
          vec4 r = u_ripples[i];
          if (r.z < 0.0) continue;
          float age = time - r.z;
          float ring = length(pt - r.xy) - age * 520.0;
          level += exp(-(ring * ring) / 1800.0) * exp(-age * 1.4);
        }
        float radius = 1.0 + 3.2 * clamp(level, 0.0, 1.2);
        float mask = smoothstep(radius + 0.9, radius - 0.6, length(css - pt));
        a = max(a, mask * clamp(0.12 + level, 0.0, 1.0));
        t = clamp(level, 0.0, 1.0) * 0.8 + swell * 0.2;
      }
    `,
  },
  {
    id: "flux",
    label: "Flux lines",
    resolution: 0.9,
    gain: 1.6,
    body: /* glsl */ `
      vec2 p = uv * 1.1;
      float field = fbm(p + vec2(time * 0.025, -time * 0.018)) * 3.2
                  + fbm(p * 0.5 - time * 0.01) * 1.5;
      // The cursor is a magnet: field lines curl into rings around it.
      vec2 dm = suv - mouse;
      float r = length(dm);
      field += hover * 0.55 * log(r + 0.04) * exp(-r * 1.6);
      for (int i = 0; i < 4; i++) {
        vec3 rp = ripple(i);
        if (rp.z < 0.0) continue;
        float ring = length(suv - rp.xy) - rp.z * 0.9;
        field += 0.35 * exp(-ring * ring * 60.0) * exp(-rp.z * 1.5);
      }
      float level = field * 6.0;
      float d = abs(fract(level + 0.5) - 0.5);
      float w = fwidth(level);
      float line = 1.0 - smoothstep(0.0, w * 1.6, d);
      float glow = (1.0 - smoothstep(0.0, w * 7.0, d)) * 0.25;
      float near = exp(-r * r * 9.0) * hover;
      a = (line + glow) * (0.32 + 1.3 * near);
      t = fract(field * 0.35) * 0.6 + near * 0.4;
    `,
  },
  {
    id: "waves",
    label: "Gradient waves",
    resolution: 0.5,
    body: /* glsl */ `
      vec2 q = repel(uv, mouse + u_offset, 0.09 * hover, 0.28);
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        float y = 0.16 * sin(q.x * 1.4 + time * (0.10 + fi * 0.03) + fi * 1.7)
                + 0.06 * sin(q.x * 3.2 - time * 0.08 + fi * 2.3)
                + (fi - 2.0) * 0.17;
        float band = smoothstep(0.22, 0.0, abs(q.y - y));
        a += band * 0.32;
        t += band * (fi / 4.0 - 0.5) * 0.6;
      }
      a *= 1.0 + 0.8 * exp(-dot(suv - mouse, suv - mouse) * 6.0) * hover;
    `,
  },
  {
    id: "aurora",
    label: "Aurora",
    resolution: 0.5,
    body: /* glsl */ `
      vec2 q = repel(uv, mouse + u_offset, 0.12 * hover, 0.35);
      float n = fbm(vec2(q.x * 1.6 + time * 0.04, time * 0.03));
      float curtain = smoothstep(0.35, 0.0, abs(q.y - 0.15 - (n - 0.5) * 0.9));
      float streaks = 0.55 + 0.45 * noise(vec2(q.x * 14.0 + n * 6.0, time * 0.2));
      float fade = smoothstep(-0.7, 0.4, q.y);
      float near = exp(-dot(suv - mouse, suv - mouse) * 5.0) * hover;
      a = curtain * streaks * fade * (1.0 + near) + near * 0.15;
      t = n + q.x * 0.3 + near * 0.3;
    `,
  },
  {
    id: "silk",
    label: "Silk",
    resolution: 0.5,
    body: /* glsl */ `
      vec2 p = repel(uv, mouse + u_offset, 0.15 * hover, 0.3) * 1.3;
      vec2 q = vec2(fbm(p + time * 0.05), fbm(p + vec2(5.2, 1.3) - time * 0.04));
      float n = fbm(p + 1.8 * q + time * 0.02);
      a = smoothstep(0.3, 0.68, n);
      t = q.x * 1.4 - 0.2;
    `,
  },
  {
    id: "contours",
    label: "Topography",
    resolution: 1,
    body: /* glsl */ `
      float n = fbm(uv * 1.1 + vec2(time * 0.015, -time * 0.01));
      // The cursor raises a hill, so new rings gather around it.
      vec2 dm = suv - mouse;
      n += hover * 0.22 * exp(-dot(dm, dm) * 14.0);
      float level = n * 14.0;
      float d = abs(fract(level + 0.5) - 0.5);
      a = 1.0 - smoothstep(0.0, fwidth(level) * 1.8, d);
      a *= 1.0 + 1.5 * exp(-dot(dm, dm) * 10.0) * hover;
      t = n * 1.6 - 0.3;
    `,
  },
  {
    id: "dither",
    label: "Dither",
    resolution: 1,
    gain: 1.4,
    body: /* glsl */ `
      // Chunky pixels, each lit when the field beats its Bayer threshold.
      float size = 3.0;
      vec2 cell = floor(css / size);
      vec2 c = toUv((cell + 0.5) * size);
      vec2 p = (c + u_offset) * 1.2;
      vec2 q = vec2(fbm(p + time * 0.04), fbm(p + vec2(4.1, 2.7) - time * 0.035));
      float field = smoothstep(0.25, 0.85, fbm(p + 1.6 * q));
      vec2 dm = c - mouse;
      float near = exp(-dot(dm, dm) * 12.0) * hover;
      field = field * 0.75 + near * 0.7;
      for (int i = 0; i < 4; i++) {
        vec3 rp = ripple(i);
        if (rp.z < 0.0) continue;
        float ring = length(c - rp.xy) - rp.z * 0.8;
        field += exp(-ring * ring * 300.0) * exp(-rp.z * 1.6) * 0.8;
      }
      float lit = step(bayer8(cell), field);
      a = lit * (0.45 + 0.55 * near);
      t = q.x * 1.3 - 0.15 + near * 0.4;
    `,
  },
  {
    id: "ascii",
    label: "ASCII",
    resolution: 1,
    gain: 1.6,
    glyphs: { chars: " .:-=+*%#@", width: 9, height: 15 },
    body: /* glsl */ `
      vec2 size = vec2(9.0, 15.0);
      vec2 cell = floor(css / size);
      vec2 local = fract(css / size);
      vec2 c = toUv((cell + 0.5) * size);
      vec2 p = (c + u_offset) * 1.4;
      float field = smoothstep(0.3, 0.8, fbm(p + vec2(time * 0.05, -time * 0.03)));
      vec2 dm = c - mouse;
      float near = exp(-dot(dm, dm) * 10.0) * hover;
      field = clamp(field * 0.7 + near * 0.8, 0.0, 1.0);
      for (int i = 0; i < 4; i++) {
        vec3 rp = ripple(i);
        if (rp.z < 0.0) continue;
        float ring = length(c - rp.xy) - rp.z * 0.8;
        field += exp(-ring * ring * 150.0) * exp(-rp.z * 1.6) * 0.8;
      }
      field = clamp(field, 0.0, 0.999);
      float index = floor(field * u_glyphCount);
      float ink = texture2D(u_glyphs, vec2((index + local.x) / u_glyphCount, local.y)).a;
      a = ink * (0.5 + 0.5 * field + near * 0.6);
      t = field * 0.7 + near * 0.3;
    `,
  },
]
