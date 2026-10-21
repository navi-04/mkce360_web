# Interiors: how they work, what is real and what is a placeholder

Only **block 1 (Dr. A.P.J. Abdul Kalam Block)** has an interior. It is built from the photos supplied for that block
(`assets/inside of APJ Block`, `assets/class rooms`, `assets/the floors and steps of all block`), but **which room is where is
not known**, so the layout, room numbers, names, capacities, departments, faculty and timetables are **SAMPLE placeholders**.
Every floor carries `"sample": true`, the room card says "Sample data", and the validator prints a warning for it.
The four-floor count is the only confirmed value.

The app code contains no campus facts. A building gets an interior when its `floorPlans` array in `src/data/campus.json`
is not empty. Nothing else is needed.

## Getting in: there is nothing to press

**The building is part of the world.** There is no Enter button, no Exit button, no floor selector and no stairs or lift prompt.
You walk (or drive) up to the porch, up its three steps, through the open doorway into the entrance hall, along the verandahs,
through the open doors of the rooms, out to the courtyard and up the stairs, and the floor under your feet decides where you are.

- The entrance of block 1 is in the middle of its **north face, the side facing the play ground**, under a porch about 20 m wide and
  6 m deep (a flat roof on six square columns, three steps, an open doorway 4.8 m wide, the name board on the front parapet).
  The facade is cut open there: from the forecourt you see the hall and, through its wide opening, the courtyard.
- Every doorway is open (the door leaf of a room stands open against the wall) and the entrance has no door at all.
- The stairs are real: a stair well in each corner with two flights of 11 steps and a landing; you climb a flight, cross the landing
  and climb the second to the next floor, and the eye height rises along the steps. The same well is repeated on every floor.
  The car is too wide for the 1.6 m flights and stops at their foot.
- The light follows you in: the daylight changes smoothly to the softer light of the building over the first 3 m inside.
- A room found in Search has **Go to room** (the viewer is moved in front of its door, on its floor, with the room card open); the
  card of a room, opened by tapping a door or a sign, has **Walk to the door**. Neither changes any mode.
- Overview shows the campus from the air with the courtyard of the block (the outer skin, the inner skin of the courtyard and
  some trees); the inside is not drawn from there.

## What the photos showed, and how the model follows it

| Seen in the photos | In the model |
| --- | --- |
| A ring of wings round a courtyard full of trees; grey hexagonal pavers with stone kerbs on the paths; lawn with fallen leaves and bare soil under the trees; bougainvillea shrubs; red soil beside the curb | `court` rectangle: a lawn cut from photo 2.34.15 PM (with baked tree shade and soil patches), two crossing paver paths cut from photo 2.34.13 PM (1) and straightened, kerbs, about 60 trees (slender leaning trunks with bark from photo 2.34.14 PM (1) under layered crowns of leaf cards), shrubs; sky overhead |
| The wings seen across the courtyard: cream parapets with X-shaped and slot openings, thick white slab edges, white columns, shaded verandahs with doors and windows | every storey is real geometry now: the parapet is cream with X and slots on the courtyard side and brown on the verandah side, white columns (solid), the slab edge, the verandah behind |
| Ground floor, courtyard side (photos 2.34.12 PM, 2.34.13 PM, 2.34.14 PM): polished granite floor, a dark green granite curb with red-brown sides, round steel-pipe columns, a dark steel beam and a white ribbed roof sheet with a curved, finely ribbed fascia | `groundCanopy` (3 m): a roofed walkway beyond the verandah, curb with granite posts, steel columns, beam, sloped roof (also seen from the upper floors) and fascia; two steps down to the lawn where each path meets it |
| Open verandah on the courtyard side of every upper wing: white columns, brown parapet 1 m high with square and slot openings, slab edge above | parapet and columns along the `court` edge, no wall; the viewer cannot step into the courtyard from the upper floors |
| Lattice ventilators above the doors and windows, white conduit along the corridor walls, cross beams at every column | ventilator pictures, conduit boxes and ceiling beams |
| Polished red granite in the corridors (concrete grey on one upper corridor) | `corridorFloor`: `granite` (default) or `concrete` |
| White corridor walls with a tan dado, steel-blue doors, steel windows with grilles, notice boards, fire extinguisher, water coolers | corridor wall texture, door leaf and jambs, window pictures, notice boards, extinguishers, coolers |
| The main entrance: a porch in the middle of the north face, about 20 m wide and 6 m deep, with steps in front and a curved forecourt with planted islands (satellite crop `assets/satellite/apj block.png`, rectified in a local frame) | `porch` on the building in campus.json (w 20, d 6, h 4.2, doorW 4.8, doorH 2.6): flat roof with a tall front parapet and the name board, six square columns, three steps, an open doorway; a paver forecourt in front; lamps and benches beyond it |
| Entrance hall: pale marble, brown honour boards, rows of steel seats, wall display, black directory board, ceiling fans | the `lobby` room type: the two middle bays of the north wing on the ground floor, behind the 4.8 m entrance, opening 6 m wide onto the verandah and the courtyard |
| Classrooms: green floor, cream walls, blue-grey desk-and-bench sets, a low wooden dais with two white boards and a wall panel, ceiling fans, curtains | the `classroom` room type: rows of bench sets in two groups, dais, boards, panel, fans |
| Wood-panelled lift with a steel door, wide straight stair flights with brown parapets and blue nosings | `lifts` (a closed block with a steel door: it only stands there) and `stairs` (real flights, see above) |

Shapes follow the satellite footprint of block 1 (92 x 113 m ring; the wings are 12.2 m thick and the courtyard 67.6 x 88.6 m, which is
what the rectified satellite image shows). Dimensions inside (room depth 9 m, verandah 3.2 m, storey 3.6 m, canopy 3 m) are estimates
from the photos.

**The entrance (user, then the satellite).** The side is the user's: the entrance is on the north face. The satellite crop shows a porch
in the middle of that face and nothing comparable on the east face, so the east-face door that the first version had (a guess, matched to
"main gate to the entrance, 102 m") is gone. The place along the face (the middle), the porch size and the width are read off that
crop, so check them with `?calibrate=1`. The road distance from the main gate to the new door is about 133 m, so the 102 m cannot refer
to it (the straight line is already 117 m); the number is not used any more.

**Assumption to confirm:** the photos show the steel-column walkway on at least one wing, but not which. The sample puts it on all
four wings of the ground floor (`groundCanopy`), in front of the ground verandah. Likewise the wings are all four storeys high, while
one photo shows a three-storey wing next to a two-storey one. Tell me which wings differ and the model changes with it.

**Photo textures.** `scripts/make-interior-photo-textures.py` cuts the lawn, the pavers and the bark out of the (git-ignored) photos
and writes three small JPEGs to `public/textures/interior/` (about 50 KB in all; no people, no text). The app loads them at
start-up and keeps its canvas textures if they are missing.

## How it is built

- **One world.** The floors of a building stand in the scene at the place and turn of the building, on top of each other, the
  ground floor on a 0.45 m plinth. `buildings.js` builds the *outside* of the building as a skin (outer walls with the doorway cut
  open, the roof, the porch, and in Overview the inner skin of the courtyard); `interiors.js` builds the *inside* (every floor and
  the garden). The skin has no collider; the walls come from the floor plans.
- **Where you stand.** `src/interiors/ground.js` (pure code, also used by the Node tests): `BuildingPhysics` gives the height of the
  ground under a spot for a viewer at some height (the floor, the yard of the ground floor, the steps and landings of the stairs;
  the highest surface within 0.6 m above the viewer is taken), the floor the viewer is on, and the obstacles of that floor in
  world coordinates; `WorldGround` adds the campus, the steps of the porch and a list of obstacles that come and go (a parked car).
  `WalkMode` and `DriveMode` ask it every frame (`app.ground`).
- **What is drawn.** A building is drawn when the viewer is inside it or within 38 m of its door (the hall is seen through the
  entrance), never in Overview. Its floors are built one part per frame after start-up and the static meshes of all floors are merged
  into one mesh per kind. Deep inside (more than 9.5 m from the outer wall) the far palms and trees are not drawn.
- **Furniture** of a room is built the first time the viewer comes within 15 m, on the floors above and below as well.

## Where things are

| File | Purpose |
| --- | --- |
| `src/data/campus.json` | `buildings[].floorPlans`: the data |
| `scripts/generate-sample-interior.mjs` | writes the SAMPLE floors of block 1 into campus.json (delete it when real plans exist) |
| `src/interiors/plan.js` | floor plan to walls, doors, windows, furniture, stair wells, garden and the heights of every surface (pure functions, no three.js) |
| `src/interiors/ground.js` | `BuildingPhysics`, `WorldGround`, `porchHeight`: height, floor and obstacles for a viewer (pure) |
| `src/interiors/interiors.js` | builds the meshes of every floor and the garden, decides what is drawn, switches the obstacles, the light, taps on doors and signs |
| `src/world/buildings.js` | the outside of a building: skin with a doorway, roof, porch (`shellGeo` in `world/geo.js`) |
| `src/world/interior-textures.js` | canvas textures: granite, marble, green floor, walls, parapets, roof sheet, leaves, pavers, decor atlas |
| `scripts/make-interior-photo-textures.py` | cuts lawn, pavers and bark out of the courtyard photos (needs Python + OpenCV) |
| `src/ui/interior-ui.js` | the room card |
| `scripts/test-interiors.mjs` | `npm run test:interiors`: walls, doors, stair wells, holes, a viewer who walks in and up all four stairs and back down, courtyard, timetable |

## Format

Coordinates are metres in the floor's own system (x east, z south, origin at the middle of the building, before the building's
turn), unrelated to the campus map: the building places it in the world.

```jsonc
"floorPlans": [
  {
    "level": 0,                       // 0 = ground floor; levels are 0, 1, 2 ... without gaps
    "label": "Ground floor", "short": "G",
    "sample": true,                   // true while the content is placeholder data
    "height": 3.6,                    // storey height in metres (default 3.6); the same on every floor
    "corridorFloor": "granite",       // granite | marble | green | concrete (default granite)
    "verandahDepth": 3.2,             // width of the verandah between the courtyard edge and the rooms (default 3.2)
    "groundCanopy": 3,                // metres of roofed walkway beyond the verandah on the ground floor (0 = none); put it on every floor
    "outline": { "x0": -46, "z0": -56.5, "x1": 46, "z1": 56.5 },   // outer rectangle
    "court":   { "x0": -33.8, "z0": -44.3, "x1": 33.8, "z1": 44.3 },// optional open courtyard (a hole in the ring)
    "entrance": { "x": 0, "z": -56.5, "facing": "north", "width": 4.8, "height": 2.6 }, // the doorway in the outline wall; ground floor only; width (2.4) and height (2.6) optional
    "rooms": [
      {
        "id": "room-g-02", "number": "G-02", "name": "Sample classroom B",
        "type": "classroom",          // classroom | lab | office | seminar | library | washroom | store | lobby | other
        "capacity": 60, "department": "...", "faculty": "...", "equipment": ["Whiteboards"],
        "timetable": [ { "day": "Mon", "start": "09:00", "end": "10:00", "title": "Sample session A" } ],
        "bounds": { "x0": 37, "z0": -30, "x1": 46, "z1": -20.71 },       // the room rectangle
        "door": { "side": "w", "at": -28.3 }       // wall (n, s, e, w) and the door's centre along it
        // optional: "floor": "green|marble|granite|concrete", "door": { ..., "w": 5, "h": 2.7, "open": true } (a wide opening, no leaf)
      }
    ],
    "stairs": [ { "id": "stairs-ne", "label": "Stairs", "foot": "w",
                  "bounds": { "x0": 41.2, "z0": -56.3, "x1": 45.8, "z1": -52.9 } } ],   // the same wells on every floor
    "lifts":  [ { "id": "lift-ne", "label": "Lift", "facing": "w",
                  "bounds": { "x0": 43.6, "z0": -52.1, "x1": 45.8, "z1": -49.9 }, "landing": { "x": 41.7, "z": -51 } } ]
  }
]
```

How the rectangles become a building:

- Every room gets its **own four walls inside its rectangle** (0.2 m), so the rectangle keeps its size. The face towards the room
  is cream, the face towards the corridor carries the white wall with the tan dado. Door openings are 1.2 m wide and 2.1 m high.
  The faces on the outline are not drawn (the skin of the building is the outside).
- What is inside `outline`, outside `court` and outside every room is **verandah, corridor or lobby**: granite floor, ceiling,
  and an outer wall wherever no room stands on the outline.
- The edge of `court` is an **open arcade** (parapet, columns, slab edge); the white columns are solid. Nothing blocks the view
  of the garden, but on the upper floors the viewer cannot walk into it. With `groundCanopy` the ground floor has no parapet: the
  walkway reaches out `groundCanopy` metres to a curb, and the yard inside it is walkable (0.45 m down the steps onto the lawn). The
  arcade has an odd number of bays, so a bay is in the middle of each side, where the entrance, the opening of the hall and the
  main path of the garden are.
- **Stairs** are a walled well with two flights side by side and a landing, opening on the side `foot` (`n s e w`), inside the
  rectangle `bounds` (the inside of the well, against the outer walls). The lane on the open side holds the lower flight (11 steps
  up to a landing half a storey up), the lane against the outer wall the upper flight (11 steps on to the next floor, arriving
  where the lower flight of the next floor begins). The wells must be the same on every floor (the validator checks). Slabs have
  holes where flights pass; the lane of the upper flight is closed at its foot on the ground floor, the other lane on the top floor.
  The well must be at least 2.6 m across and have 2.4 m of run beyond the landing.
- **Lifts** are decor: a cream block with a wood-panelled front and a closed steel door (`facing` is the side of the door, `landing`
  where its sign hangs).
- Furniture follows the room type and the door: for a classroom the front wall is the end wall nearer the door, with a dais,
  two boards and a panel; benches are in rows facing it with an aisle between the two groups. A clear path stays in front of the door.
  The entrance hall is furnished in the frame of its own wide opening, so it works on any wing.

## Timetable and "Now in session"

`day` is `Mon` to `Sun`, `start` and `end` are `HH:MM` (24 hour). The card compares them with the day and time of the
device. In tests the clock can be replaced: `window.__mkce.interiors.clock = () => new Date(...)`.

## Rules the validator enforces (`npm run validate`)

Outline present; `court` inside the outline; the entrance on the wall it faces and fitting on it, and facing the same way as the
building's `doorFacing`; `porch` (w, d, h, doorW) sensible; room bounds inside the outline, not overlapping each other or the courtyard;
every room has a door that fits on its wall; stair wells big enough, inside the outline, not overlapping a room or the courtyard,
the same on every floor; lift landings inside the floor, outside any room and the courtyard; floor levels 0, 1, 2 ... and the same
height on every floor; the room fields above. Warnings: floor count differing from `floors` when `verified.floors` is true, no
entrance on any floor, sample data, the wings outside as thick as the plan's, `heightM` equal to the floors together.

## Replacing the sample with the real interior

1. Get the real floor plans (or at least the room list per wing and floor). Photos of the printed directory boards are useful:
   the entrance directory lists offices, halls and labs with their floors. They are partly legible only, so nothing from them is used yet.
2. Replace `floorPlans` of block 1 (or run a new generator) and add `floorPlans` to other buildings the same way; give the building a
   `porch` (or leave it out: the doorway then is as wide as `entrance.width`, with no porch) and a `ring.thickness` equal to the plan's wings.
3. Remove `"sample": true` per floor once the data is verified, and `interiorNote` on the building. Delete
   `scripts/generate-sample-interior.mjs`.
4. Run `npm run validate` and `npm run test:interiors` (the latter asserts that exactly one building has floor plans and
   that the ring is fully connected; update those lines when the data changes).

## Performance

A floor builds in about 30 ms on a desktop and is cached; a room's furniture in about 1 ms. The floors are built one per frame after
start-up and their static meshes merged (one mesh per kind for all floors). In the courtyard the whole scene is about 46 draw
calls and 70 thousand triangles, in the hall about the same; with nothing of the building in view the campus is 24 draw calls. All
interior materials share the existing shader programs (Lambert with a map and vertex colours), so nothing compiles the first time
you walk in; their textures are uploaded at start-up.
