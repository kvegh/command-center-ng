# Control-tower icon and wordmark

The visible wordmark is **command center NG**. The user requested uppercase NG
without the former dot. Branding remains the final item at the right of the header.

The active header/favicon asset is now the white tower documented in
[brand assets](brand-assets.md). The earlier detailed illustration remains
tracked at `src/assets/airport-control-tower.png`; the cyan icon is retained in
Git history. The following describes the earlier illustration, not the active icon.

The original generated mark was insufficiently recognizable. Its replacement
uses a complete architectural control tower with a tall straight shaft, wide
glazed control room, projecting roof, observation ledge and antenna. The selected
transparent PNG is `src/assets/airport-control-tower.png`, formerly used for branding and
the favicon. It was generated with the built-in image_gen tool, copied into the
project and kept with its original alpha. No image-processing dependency or
private reference image was used.

Exact replacement generation prompt (built-in mode):

```text
Use case: logo-brand.
Asset type: transparent app logo and favicon for Command Center NG, a graphite web dashboard.
Primary request: a CLEARLY RECOGNIZABLE AIRPORT AIR-TRAFFIC CONTROL TOWER. The previous mark looked like a microphone or goblet; this must look unmistakably like an airport control tower.
Subject: show the complete freestanding building from base to antenna. A LONG slender straight architectural shaft takes about 60 percent of total height. At the top is a WIDE polygonal control room, with a strong projecting flat roof and a continuous band of dark wraparound slanted windows divided by a few thick vertical mullions. A small exterior observation ledge under the windows and one short rooftop radio antenna communicate the control-tower function. The cab is about three times the shaft width. Simple low building-like base, no stemware curves.
Style: bold crisp 2D pictogram, flat geometric architecture, slightly three-quarter view to clearly show the glazed control room, clean hard edges and large negative spaces. No soft rendering or gradients.
Palette: cyan #68d9fa, cool white #e4eaf3 and a small amount of deep navy #17283d for the glass; strong readability against dark surfaces.
Composition: centered complete tower on a square canvas with a small clear margin. Prioritize the distinctive T-shaped silhouette and readability at 24-36 pixels. Avoid tiny decorative details.
Background: actual transparent alpha with clean edges, no panel, no halo, no checkerboard baked into the image.
Constraints: one original tower mark; no text, letters, watermark, badges, four-square motif, plane, clouds, skyline or surrounding buildings. Not a water tower, lighthouse, goblet, microphone or observation monument.
```
