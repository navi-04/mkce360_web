# Driving

Next to Overview and Walk there is a third mode, **Drive**: a small red car you steer round the campus. It goes anywhere the walking
viewer goes, **in through the entrance of block 1 and along its ground floor too**, because the building is part of the world
(see [interiors.md](interiors.md)). It is a toy, not a simulator: the physics is arcade.

## Controls

| | Computer | Phone |
| --- | --- | --- |
| Accelerate | W or Up | the gold **Gas** pedal (bottom right) |
| Brake, and back up when stopped | S or Down | the red **Brake** pedal (next to it) |
| Steer left / right | A and D, or Left and Right | the **Left** and **Right** buttons (bottom left) |
| Handbrake | Space | (none: the brake does it) |
| View from behind / from the driver seat | C | the **View** button (right column) |

The two thumbs work at the same time (each control is its own touch target, 64 to 96 px), so you can steer and press a pedal at once.
The speed is shown in km/h. The mode tabs at the top switch between Overview, Walk and Drive.

- **Getting in:** the **Drive** tab puts the car where you stand, facing the way you look. If you left the car within 14 m, it is that
  car, where you left it.
- **Getting out:** the **Walk** tab puts you beside the car (on the driver's side, the right: traffic keeps left). The car stays
  parked, drawn and solid.
- A guided walk is for walking: starting one switches to Walk, and Drive ends a route in progress (the line of a route you walk
  yourself stays).

## What it does

- Top speed about 85 km/h, 0 to 80 in 5 s, braking from top speed in about 1.2 s, reverse up to 22 km/h. The car is 3.9 x 1.75 m.
- Walls, other buildings, the arcade columns, the curbs and posts of the courtyard walkway, furniture, the porch columns, tree
  trunks, palms, lamp posts and benches stop it (it slides along them and loses speed); the campus boundary keeps it inside.
- The ground under its four wheels is followed: the three steps of the porch, the 0.45 m steps down from the walkway to the lawn,
  and the nose rises on slopes.
- At a crawl (under 2 m/s) with the gas or the brake on, the car also swings round on the spot, so it gets round the corners of the
  3.2 m verandahs. The stairs are narrower than the car: it stops at their foot.
- The camera follows from behind, wider at speed, pulled in where a wall is in the way and kept under the ceiling indoors.

## How it is built

- `src/modes/car.js`: the physics, pure code (a bicycle model for steering, three circles for collisions, a nose and side tilt from the
  ground). `scripts/test-car.mjs` (`npm run test:car`) checks it and drives a simple autopilot from the forecourt, through the porch,
  the hall and the verandah, down onto the courtyard lawn, and 330 m round the ground-floor verandahs, with no browser.
- `src/modes/drive.js`: the mode (car mesh, keys, camera, parking). The car mirrors its place into the walking viewer
  (`walk.pos`, `yaw`, `groundY`), so the mini-map, routes and buildings treat a driver like a walker.
- `src/ui/drive-ui.js` and the `.drive` rules in `style.css`: the phone controls.
- The car is one merged mesh plus four wheels with the same shader as the buildings' details: no new shader program.
