# Interiors: how they work, what is real and what is a placeholder

Only **block 1 (Dr. A.P.J. Abdul Kalam Block)** has an interior. It is built from the photos supplied for that block
(`assets/inside of APJ Block`, `assets/class rooms`, `assets/the floors and steps of all block`), but **which room is where is
not known**, so the layout, room numbers, names, capacities, departments, faculty and timetables are **SAMPLE placeholders**.
Every floor carries `"sample": true`, the room card says "Sample data", and the validator prints a warning for it.
The four-floor count is the only confirmed value.

The app code contains no campus facts. A building gets an interior when its `floorPlans` array in `src/data/campus.json`
is not empty. Nothing else is needed.

## Getting in

- Outdoors, standing within 8 m of the door of a building that has an interior shows **Enter <building>** at the bottom.
- The building card has **Go inside**, the arrival card of a guided walk has **Enter building**, and a room found in Search
  has **Go to room** (goes in, to the right floor, and stands in front of that door with the room card open).
- Inside, **Exit** (top left) or the exit prompt at the entrance door leaves again; the floor selector (G 1 2 3) is on the left.

## What the photos showed, and how the model follows it

| Seen in the photos | In the model |
| --- | --- |
| A ring of wings round a courtyard full of trees; hexagonal grey pavers on the paths; lawn | `court` rectangle with a lawn, two crossing paver paths and about 100 low-poly trees; sky overhead; the other wings are drawn across the courtyard, storey by storey |
| Open verandah on the courtyard side of every wing: white columns, brown parapet 1 m high with square and slot openings, slab edge above | parapet and columns along the `court` edge, no wall; the viewer cannot step into the courtyard |
| Polished red granite in the corridors (concrete grey on one upper corridor) | `corridorFloor`: `granite` (default) or `concrete` |
| White corridor walls with a tan dado, steel-blue doors, steel windows with grilles, notice boards, fire extinguisher, water coolers | corridor wall texture, door leaf and jambs, window pictures, notice boards, extinguishers, coolers |
| Entrance hall: pale marble, brown honour boards, rows of steel seats, wall display, black directory board, ceiling fans | the `lobby` room type |
| Classrooms: green floor, cream walls, blue-grey desk-and-bench sets, a low wooden dais with two white boards and a wall panel, ceiling fans, curtains | the `classroom` room type: rows of bench sets in two groups, dais, boards, panel, fans |
| Wood-panelled lift with a steel door, wide straight stair flights with brown parapets and blue nosings | `lifts` and `stairs` blocks (a flight rises into a wall; the stairs prompt moves one floor) |

Shapes follow the satellite footprint of block 1 (92 x 113 m ring). Dimensions inside (room depth 9 m, verandah 3.2 m, storey
3.6 m) are estimates from the photos.

## Where things are

| File | Purpose |
| --- | --- |
| `src/data/campus.json` | `buildings[].floorPlans`: the data |
| `scripts/generate-sample-interior.mjs` | writes the SAMPLE floors of block 1 into campus.json (delete it when real plans exist) |
| `src/interiors/plan.js` | floor plan to walls, doors, windows, furniture, stairs and garden (pure functions, no three.js) |
| `src/interiors/interiors.js` | builds the meshes, enter/exit, floors, stairs and lift, taps, prompts |
| `src/world/interior-textures.js` | canvas textures: granite, marble, green floor, walls, parapet, arcade, pavers, decor atlas |
| `src/ui/interior-ui.js` | floor selector, exit button, prompts (enter, exit, stairs, lift), room card |
| `scripts/test-interiors.mjs` | `npm run test:interiors`: walls, doors, walkability of the whole ring, courtyard, timetable |

## Format

Coordinates are metres in the floor's own system (x east, z south), unrelated to the campus map. Inside a building
the outdoor scene is hidden, so the two never meet.

```jsonc
"floorPlans": [
  {
    "level": 0,                       // 0 = ground floor; levels must be unique and include 0
    "label": "Ground floor", "short": "G",
    "sample": true,                   // true while the content is placeholder data
    "height": 3.6,                    // storey height in metres (default 3.6)
    "corridorFloor": "granite",       // granite | marble | green | concrete (default granite)
    "outline": { "x0": -46, "z0": -56.5, "x1": 46, "z1": 56.5 },   // outer rectangle
    "court":   { "x0": -33.8, "z0": -44.3, "x1": 33.8, "z1": 44.3 },// optional open courtyard (a hole in the ring)
    "entrance": { "x": 46, "z": -37.15, "facing": "east" },        // the exit door; ground floor only
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
    "stairs": [ { "id": "stairs-ne", "label": "Stairs", "rise": "n", "arrive": "w",
                  "bounds": { "x0": 43.6, "z0": -52.3, "x1": 45.8, "z1": -47.7 }, "landing": { "x": 44.7, "z": -46 } } ],
    "lifts":  [ { "id": "lift-ne", "label": "Lift", "facing": "s", "arrive": "s",
                  "bounds": { "x0": 37.4, "z0": -55.7, "x1": 39.6, "z1": -53.5 }, "landing": { "x": 38.5, "z": -51.3 } } ]
  }
]
```

How the rectangles become a building:

- Every room gets its **own four walls inside its rectangle** (0.2 m), so the rectangle keeps its size. The face towards the room
  is cream, the face towards the corridor carries the white wall with the tan dado. Door openings are 1.2 m wide and 2.1 m high.
- What is inside `outline`, outside `court` and outside every room is **verandah, corridor or lobby**: granite floor, ceiling,
  and an outer wall wherever no room stands on the outline.
- The edge of `court` is an **open arcade** (parapet, columns, slab edge). Nothing blocks the view of the garden, but the
  viewer cannot walk into it.
- Furniture follows the room type and the door: for a classroom the front wall is the end wall nearer the door, with a dais,
  two boards and a panel; benches are in rows facing it with an aisle between the two groups. A clear path stays in front of the door.
- Stairs: `rise` is the direction the flight climbs (`n s e w`), `landing` is the spot where the prompt appears and where
  the viewer arrives (it must be in open space), `arrive` is the direction faced after arriving. Stair ids are the same on every
  floor so the stairs lead to the same corner. Lifts: `facing` is the side of the door. The floor selector goes to the lift landing.
- Furniture of a room is built the first time the viewer comes within 15 m, so a floor of 36 rooms stays light.

## Timetable and "Now in session"

`day` is `Mon` to `Sun`, `start` and `end` are `HH:MM` (24 hour). The card compares them with the day and time of the
device. In tests the clock can be replaced: `window.__mkce.interiors.clock = () => new Date(...)`.

## Rules the validator enforces (`npm run validate`)

Outline present; `court` inside the outline; room bounds inside the outline, not overlapping each other or the courtyard;
every room has a door that fits on its wall; stairs and lift landings inside the floor, outside any room and the courtyard;
unique levels including 0; the room fields above. Warnings: floor count differing from `floors` when `verified.floors`
is true, no entrance on any floor, sample data.

## Replacing the sample with the real interior

1. Get the real floor plans (or at least the room list per wing and floor). Photos of the printed directory boards are useful:
   the entrance directory lists offices, halls and labs with their floors. They are partly legible only, so nothing from them is used yet.
2. Replace `floorPlans` of block 1 (or run a new generator) and add `floorPlans` to other buildings the same way.
3. Remove `"sample": true` per floor once the data is verified, and `interiorNote` on the building. Delete
   `scripts/generate-sample-interior.mjs`.
4. Run `npm run validate` and `npm run test:interiors` (the latter asserts that exactly one building has floor plans and
   that the ring is fully connected; update those lines when the data changes).

## Performance

A floor builds in about 30 ms on a desktop and is cached; a room's furniture in about 1 ms. Static geometry is merged into
about a dozen meshes (walls in two materials, four floor kinds, ceiling, parapets, courtyard facade, details, windows, signs,
garden), 12 to 20 draw calls and 10 to 20 thousand triangles in view. All interior materials share the existing shader programs
(Lambert with a map and vertex colours), so nothing compiles the first time you walk in; their textures are uploaded at start-up.
