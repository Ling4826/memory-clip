# Round 3 — รุ่น 2 print package

Spec: user's Round 3 request, 22 October 2026. Work in case3d, no git; preserve supplied backup. The requested implementation and overlapping-solid fallback are authorized.

Architecture: buildDevice/exportParts remain the geometry authority. A shared print module loads CONFIG/model, places printable objects, creates a small CONFIG-based tolerance gauge, and parses binary STL. Export uses the existing STLExporter. Separate rendering and handout scripts consume the exported manifest. No dependencies or duplicated device geometry.

- [x] Test first: disk STL validity, complete expected triangle inventory and v2 feature counts, closed source shells, positive volume, bed placement/size, CONFIG structural walls. Missing/altered additions must fail.
- [x] Export front, three backs, cap, clip, magnet plate and gauge. Include microphone duct with front. Front/cap outside down; ordinary backs/plate rear down; clip arm flat down; clip back long side down to avoid suspending the entire rear face above its hinge.
- [x] Offline local Edge rendering of each exported STL plus assembled/exploded v2. PNGs and self-contained A4 Thai handout/README with measured bounds and explicitly estimated hardware dimensions, mass and time.
- [x] Link main export UI, rebuild and run all tests. Independent final review, append Thai PROGRESS entry with exact evidence.

Review focus: excluded physical hardware; missing small additions; touching/overlapping solids and volume double counting; clip-back support access; gauge estimate under 20 min is not a slicer guarantee; regenerated CONFIG and documentation consistency.

Wall method: check CONFIG-derived shell skins and radial boss walls, plus ray checks of representative planar walls. Small functional lips, duct and magnet retention film are separately disclosed, not claimed to meet the shell-body wall minimum.

Final review: independent reviewer found coupon USB stop geometry and stale handout tolerance text. Both fixed with RED→GREEN regression tests (disk PCB length/stopGap, changed-CONFIG document fixture). Final 14-test suite PASS.

Ruling: minimum wall criterion applies to structural shell skins and bosses, as allowed by the CONFIG-derived check; smaller original functional lips/duct/film/hinge leaves retained and explicitly disclosed. This is not a claim that every narrow feature is >=1.2 mm. Faculty must confirm thin-feature slicing and strength.

No deferred code review findings. No git operations, dependency installs or backup changes. All 13 A4 preview sections visually inspected; offline image loading and page-height checks passed.
