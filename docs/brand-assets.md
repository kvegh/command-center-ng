# Command Center icon

## Current: transparent operations console in 0.27.3

The shared header/favicon asset, `src/assets/command-center-icon.png`, depicts
a very schematic operations center: a curved control console with three button
marks and three blank monitors arranged along a matching arc. White artwork
on a genuinely transparent background preserves the monochrome appearance. Bold
shapes and blank screens avoid clutter. Earlier integrated icons remain in Git
history. No dependency or layout change was introduced.

Version 0.27.3 removes the dark background from the exact accepted 0.27.2 image,
including negative space inside the screens and console. Two generative edit
attempts added artifacts and were rejected. The user then approved direct pixel
editing. Existing Node.js standard-library tooling decoded the original PNG and
added alpha without redrawing, cropping or resizing the artwork; no software was
installed and no image-processing code was added to the application runtime.

The conversion preserves opaque foreground RGB. For each original pixel,
`alpha = clamp(2 * (max(R, G, B) - 64), 0, 255)`; partial-alpha edges use white
RGB to avoid dark fringes. The half-opacity contour matches the original
half-brightness contour at every pixel. The 1254 by 1254 canvas is unchanged.
All background samples and monitor interiors are transparent; a checkerboard
composite was inspected separately and is not baked into the final PNG.

The built-in image-generation tool produced the original opaque asset with this
exact prompt; only background removal was applied afterward:

> Use case: logo-brand. Asset: tiny square application icon for Command Center
> NG. A VERY VERY SCHEMATIC critical-infrastructure operations control center:
> a shallow curved crescent control console at the bottom, with just THREE
> LARGE simple button/switch marks on its upper surface; above it, THREE LARGE
> BLANK rectangular monitors arranged along a matching gentle curved arc,
> central monitor facing front and side monitors turned slightly inward. Bold
> clean white geometric pictogram on a uniform solid dark graphite #101824
> background filling the entire square canvas. Front view with only enough
> elevated perspective to recognize the curved desktop. Symmetrical centered
> composition, generous even margins, very few shapes, thick clean lines and
> large negative spaces, recognizable at 24–32 pixels. Only pure white
> foreground and dark graphite negative spaces. No people, chairs, text,
> screen content, numbers, status lights, tiny controls, wiring, tower, signal
> arcs, gradients, shadows, glow, texture, realism, detailed illustration, or
> decorative border. A minimal operations-center console symbol, not a room scene.

## Previous: white tower in 0.27.1

Version 0.27.1 replaces the cyan signal-arc icon with a white airport control
tower. A broad windowed cabin, projecting roof, tapered shaft and small base
make the building recognizable at small sizes. The header and browser favicon
share `src/assets/command-center-icon.png`.

The final PNG uses white artwork on the existing opaque graphite background.
Transparent generation attempts produced rough edges and window artifacts;
the clean opaque version was selected after visual inspection. No image-editing
dependency or runtime styling change was added.

Both earlier integrated icons remain recoverable in Git. The detailed tower
also remains tracked at `src/assets/airport-control-tower.png`.

The final asset was generated with the built-in image-generation tool using
this prompt:

> Use case logo-brand. Design a minimal AIRPORT CONTROL TOWER app icon. Square
> canvas filled edge-to-edge with uniform solid dark graphite #101824
> background, absolutely no transparency. Foreground pure solid white only.
> Precisely drawn crisp flat geometric vector-style shapes. A recognizable
> white air traffic control tower: broad enclosed trapezoid observation cabin,
> flat overhanging roof, THREE BIG SIMPLE DARK RECTANGULAR WINDOWS neatly cut
> into the cabin, tall tapered supporting shaft and small base. All white
> shapes uniformly filled, edges smooth and perfectly clean. Centered with
> balanced generous margins, strong silhouette legible at 24 pixels. No
> texture, no grit, no speckles, no weathering, no thin strokes, no gradients,
> no lighting, no shadows, no glow, no signal arcs, no cyan, no text. A clean
> professional white-on-dark UI glyph, not illustration.
