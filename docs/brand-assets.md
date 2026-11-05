# Command Center icon

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
