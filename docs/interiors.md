# Interiors: data format and how to add a building

Step 7 adds walk-through interiors. Only **block 1 (Dr. A.P.J. Abdul Kalam Block)** has any, and all of it is **SAMPLE data**:
the layout, room numbers and names, capacities, department, faculty, equipment and timetables are placeholders that show
how the feature works. Only the four-floor count of block 1 is a real, confirmed value. Every sample floor carries
`"sample": true`, the room card says "Sample data", and the validator prints a warning for it.

The app code contains no campus facts. A building gets an interior when its `floorPlans` array in `src/data/campus.json`
is not empty. Nothing else is needed.

## Where things are

| File | Purpose |
| --- | --- |
| `src/data/campus.json` | `buildings[].floorPlans`: the data |
| `src/interiors/plan.js` | floor plan to wall, door, sign and furniture description (pure functions, no three.js) |
| `src/interiors/interiors.js` | builds the meshes, enter and exit with a fade, floors, stairs and lift prompts, taps |
| `src/ui/interior-ui.js` | floor selector, exit button, prompts, room card |
| `scripts/test-interiors.mjs` | `npm run test:interiors`: walls, doors, walkability and the timetable logic |

## Format

A floor is one rectangle (the outline) with rooms inside it. Coordinates are metres in the floor's own system
(x east, z south), unrelated to the campus map. Inside a building the outdoor scene is hidden, so the two never meet.

```jsonc
"floorPlans": [
  {
    "level": 0,                      // 0 = ground floor; levels must be unique and include 0
    "label": "Ground floor",         // optional (default "Ground floor" / "Floor N")
    "short": "G",                    // optional floor-selector label (default "G", "1", "2" ...)
    "sample": true,                  // true while the content is placeholder data
    "height": 3.4,                   // optional storey height in metres
    "outline": { "x0": -22, "z0": -8, "x1": 22, "z1": 8 },
    "entrance": { "x": 22, "z": 0, "facing": "east" },   // optional; the exit door. Needed on the ground floor.
    "rooms": [
      {
        "id": "room-g-01", "number": "G-01", "name": "Sample classroom A",
        "type": "classroom",         // classroom | lab | office | seminar | library | washroom | store | other
        "capacity": 60,              // integer or null
        "department": "Sample department (placeholder)",   // text or null
        "faculty": "Sample faculty (placeholder)",         // text or null
        "equipment": ["Projector (sample)"],
        "timetable": [ { "day": "Mon", "start": "09:00", "end": "10:00", "title": "Sample session A" } ],
        "bounds": { "x0": -14, "z0": -8, "x1": -5, "z1": -1.5 },   // the room rectangle
        "door": { "side": "s", "at": -9.5 }    // wall of the room (n, s, e, w) and the door's centre along it
      }
    ],
    "stairs": [ { "id": "stairs-0", "label": "Stairs", "bounds": { "x0": -22, "z0": -8, "x1": -17, "z1": -2.5 }, "landing": { "x": -15.4, "z": -5.2 } } ],
    "lifts":  [ { "id": "lift-0",   "label": "Lift",   "bounds": { "x0": -22, "z0": 3,  "x1": -20.2, "z1": 6.5 }, "landing": { "x": -18.2, "z": 4.75 } } ]
  }
]
```

Walls are generated: the outline and every room edge become 0.2 m walls (shared edges merge), door openings are 1.2 m
wide and 2.1 m high, and the entrance is 1.8 m wide. Space inside the outline that no room covers is corridor or lobby.
Furniture is placed by room type and leaves a clear aisle in front of each door. The brown dado, red granite floor and
cream walls follow the corridor photos supplied for block 1.

`stairs[].landing` and `lifts[].landing` are the spots where the prompt appears and where the player arrives on another
floor; they must be in open space (not inside a room or the stair block). The floor selector (G, 1, 2, ...) jumps to the lift
landing; the stairs prompt moves one floor up or down.

## Timetable and "Now in session"

`day` is `Mon` to `Sun`, `start` and `end` are `HH:MM` (24 hour). The card compares them with the day and time of the
device. In tests the clock can be replaced: `window.__mkce.interiors.clock = () => new Date(...)`.

## Rules the validator enforces (`npm run validate`)

Outline present; room bounds inside the outline and not overlapping; every room has a door that fits on its wall;
stairs and lift landings inside the floor, outside any room; unique levels including 0; the room fields above.
Warnings: floor count differing from `floors` when `verified.floors` is true, no entrance on any floor, sample data.

## Adding a real interior later

1. Replace the sample `floorPlans` of block 1 or add `floorPlans` to another building (one array entry per floor).
2. Remove `"sample": true` per floor once the data is verified, and `interiorNote` on the building.
3. Run `npm run validate` and `npm run test:interiors` (the latter currently asserts that exactly one building has floor
   plans; update that line when a second building gets an interior).

## Limits of this first version

A floor is a single rectangle with rooms in two rows on either side of one corridor plus two end lobbies. Rings, wings
and courtyards (such as the real shape of block 1) are not modelled yet; that needs a richer layout format once real plans
exist. There are no windows to the outside, and the room interiors are simple furniture boxes.
