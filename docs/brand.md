# Control-tower icon

The user requested a generated airport control-tower icon to replace the
four-square mark. The selected transparent PNG is
`src/assets/airport-control-tower.png`; the same asset supplies app branding
and the favicon. It was generated with the built-in image_gen tool. No private
reference image or environment data was supplied. The original alpha is kept.

The asset uses cyan and cool white to remain visible on the graphite surfaces.
Branding stays at the far right of the workspace navigation bar. CSS scales
the mark without adding an image-processing dependency.

Exact generation prompt:

```text
+Use case: logo-brand.
Asset type: app icon and favicon for Command Center NG, an elegant dark web dashboard.
Primary request: a distinctive airport air traffic control tower icon.
Subject: one immediately recognizable tower, with a broad angular glazed control cab, a slim tapered column and a simple base. A single short antenna is optional only if it remains legible.
Style: crisp, minimal, flat graphic mark, bold simple shapes, two-tone cyan (#68d9fa) and cool near-white (#e4eaf3), suitable on graphite UI surfaces.
Composition: a single centered freestanding mark on a square canvas; occupy most of the canvas with a small clear margin; readable when scaled down to 24–32 pixels.
Background: genuinely transparent alpha, no background panel.
Constraints: original design, no words or letters, no watermark, no airplane, no buildings around it, no checkerboard pattern, no four-square/grid motif, no badge frame, no gradients or drop shadows. Keep details very restrained.
```
