# Command Center icon

## Current: operations console in 0.27.2

The shared header/favicon asset, `src/assets/command-center-icon.png`, depicts
a very schematic operations center: a curved control console with three button
marks and three blank monitors arranged along a matching arc. White artwork
on the existing graphite background preserves the monochrome appearance. Bold
shapes and blank screens avoid clutter. Earlier integrated icons remain in Git
history. No dependency or layout change was introduced.

The built-in image-generation tool produced the asset with this exact prompt:

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
