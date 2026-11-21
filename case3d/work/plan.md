# Chest camera viewer implementation plan

Goal: deliver outputs/index.html, a single Three.js CDN file with configurable mm-scale primitives, Thai UI and STL part export. User request is the design specification.

Design: X horizontal, Y up, +Z faces outward from chest. Battery below upper board. Front and rear shell seam at Z=0. Separate render assemblies and export groups; STL export resets exploded offsets and places parts on Z=0. Ports are actual openings. Approximate contact geometry is explicitly described. All physical dimensions, masses and display scales live in CONFIG at file top. Scene has no logos or downloaded models.

- [ ] Build layout formulas and geometry. Check both batteries, angles 0/10/20, mounts and wall clearances.
- [ ] Integrate Thai controls, camera framing, torso, labels, FOV, exploded view, opacity and mass panel.
- [ ] Export clean printable-part meshes (front/back/mount/button cap), remove internal assembly-only hardware, normalize origin independently of UI.
- [ ] Run real Three.js geometry tests including closed STL edges and camera direction; browser smoke test and visual review.

Decisions: no external board model. USB bottom represents charge-only extension to onboard charging, pending real connector routing. MicroSD position is configurable and access can be conditional. Need real board, connectors, LiPo, screw fit and mount measurements before print. This authorized prototype is implemented directly under the developer autonomy instructions.
