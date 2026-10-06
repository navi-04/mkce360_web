# MKCE 360 — Blueprint extraction (Step 2, revision 2)

**Status: waiting for confirmation of the open items in §9.** Nothing here has been verified on site. Names are copied exactly as printed on the board legend. Everything I inferred is labelled *candidate* or given a confidence of *low*.

Revision 2 adds: your scale (building 1 = 113 × 92 m), your orientation (gate faces East on NH-44), and the two new legend photos (`6.jpeg`, `7.jpeg`). The annotated check image is [satellite-candidates.png](satellite-candidates.png).

---

## 1. Files inspected

| File | Format | What it is |
| --- | --- | --- |
| `assets/layout/1.jpeg` | JPEG 1156×867 | Whole "COLLEGE LAYOUT" signboard, oblique 3D illustration with numbered markers 1–49 |
| `assets/layout/2.jpeg` – `5.jpeg` | JPEG 867×1156 | Close-ups of the board (left blocks and courts; centre; track/front; gate and petrol bunk) |
| `assets/layout/6.jpeg` | JPEG 867×1156 | **Full FACILITIES and PARKING AND UTILITIES legend** (items 16–49) |
| `assets/layout/7.jpeg` | JPEG 867×1156 | **Full LEGEND: ACADEMIC AREA, HOSTELS, SPORTS FACILITIES** (items 1–15) plus FACILITIES 16–29 |
| `assets/campus-map.png` | PNG 540×578 | Top-down satellite crop. No scale bar or coordinates |

No DWG/PDF exists. The layout is photographs of a printed perspective illustration, so it has no uniform scale. It is used for **what exists and how things relate**; the satellite image is used for **shapes, sizes and metric positions**.

## 2. Scale — RESOLVED

User-supplied: **building 1 is 113 m long and 92 m wide.**

I measured building 1 on `campus-map.png` as a slightly rotated rectangle with corners (292,135), (406,152), (388,293), (270,274) px: **141.4 px long (N–S) × 117.4 px wide (E–W)**.

| Dimension | Real | Pixels | Scale |
| --- | --- | --- | --- |
| Length | 113 m | 141.4 px | 0.799 m/px |
| Breadth | 92 m | 117.4 px | 0.784 m/px |

The two independent scales agree within **1.9%**, which is good evidence that both your figures and my reading of the ring are right. **Adopted scale: 0.792 m/px.** The satellite crop therefore covers about **428 m (E–W) × 458 m (N–S)**.

Cross-check with "main gate to the entrance = 102 m": building 1's east face centre is about 109 m in a straight line from my candidate gate position (§3). A road path to the entrance being around 102 m is plausible, but this check is loose because both the gate position and which entrance you mean are uncertain (see §9, Q2).

Building 1 is **rotated about 8.7° from true north–south** (E–W edge 8.5°, N–S edge 9.0°). Rotation will be stored as an optional `rotationDeg` per building (an addition to the schema in the brief; see §9, Q6).

**Footprints for buildings that are only on the board** are the board's perspective drawing measured relative to building 1 and multiplied by 113 m. Treat them as **±40%** and always `low` confidence. The calibration mode in Step 4 is where they get fixed.

## 3. Orientation — RESOLVED (user-supplied) and applied

- The main gate faces **East** onto **NH-44 (Salem–Karur)**, which runs N–S in front of the college. Vehicles enter and head **West**.
- The highway is vertical on the right of `campus-map.png`, so **the top of the satellite image is north** (assumed from your statement; see Q1).
- Mapping the board onto compass directions (this also explains my earlier contradiction: the board's compass rose is decorative or misleading, and the board is viewed from the gate looking west):

| On the board | Real direction |
| --- | --- |
| front (nearest the viewer, the gate wall) | East |
| back (palm plantation, hostel 6) | West |
| left (courts 9–15, fuel station, building 19) | South |
| right (track 8, hostel 7) | North |

Evidence: the sports courts are south of the road in front of building 1 on the board, and in the satellite the court cluster sits east of building 1 at the same side as the highway; the large brown field north-east of building 1 matches the track position.

**Coordinate system used from Step 3 onward:** origin = main gate, **+x = East, +z = South, +y = up**, units = metres. Satellite pixel `(px, py)` converts to `x = (px − 497) × 0.792`, `z = (py − 128) × 0.792`. The campus therefore extends mainly toward **negative x** (west) from the gate.

**Main gate position (candidate, medium–low confidence):** satellite pixel **(497, 128)**, where the E–W dirt road along the south edge of the north field meets the highway, just south of the long parking shed and north of the fuel station. This is the origin unless you correct it.

> The satellite crop only covers the **east part** of the campus (up to ~430 m west of the highway). Board items 6, 7, 23–28 and the plantation are probably beyond the crop. See Q3.

## 4. Legend — complete as printed (from `6.jpeg`, `7.jpeg`)

**ACADEMIC AREA**: 1. `Dr.A.P.J.ABDUL KALAM BLOCK` · 2. `Dr.S.RADHAKRISHNAN BLOCK` · 3. `LABORATORIES SHED I` · 4. `LABORATORIES SHED II`

**HOSTELS**: 5. `VEDA HOSTEL` · 6. `OCTA HOSTEL` · 7. `Dr. MUTHULAKSHMI REDDY HOSTEL`

**SPORTS FACILITIES**: 8. `PLAY GROUND` · 9. `BALL BADMINTON COURT` · 10. `KABADDI COURT` · 11. `KHO-KHO COURT` · 12. `BASKET BALL COURT` · 13. `CRICKET PRACTICE NET` · 14. `VOLLEY BALL COURT` · 15. `TENNIS COURT`

**FACILITIES**: 16. `SECURITY OFFICE` · 17. `AXIS ATM` · 18. `SBI ATM` · 19. `OLYMPIA BLOCK` · 20. `CANTEEN` · 21. `GYM` · 22. `GUEST HOUSE` · 23. `BOYS MESS` · 24. `STAFF QUARTERS` · 25. `STORAGE YARD` · 26. `POWER HOUSE` · 27. `SNACK CORNER` · 28. `GIRLS MESS` · 29. `MAIN TRANSFORMER`

**PARKING AND UTILITIES**: 30. `TWO WHEELER PARKING` · 31. `FOUR WHEELER PARKING` · 32. `FUEL STATION` · 33. `SEWAGE TREATMENT PLANT` · 34, 35, 36 `BIO GAS POINT` · 37, 38, 39, 40, 41, 42 `SOLAR PV 250 kW` · 43, 44, 45, 46 `EMERGENCY ASSEMBLY POINT` · 47, 48, 49 `WELL`

Now confirmed (my earlier guesses were right): 1–7 are the four academic buildings and three hostels. Corrections to my earlier readings: 28/44 is **not a gate** (28 = Girls Mess, 44 = emergency assembly point); 37–42 **are** solar PV, as the roof panels suggested; 47–49 (the blue patches) **are wells**; the petrol bunk's printed canopy text is `PETROL BUNK`, while the legend calls item 32 `FUEL STATION`. The word "library" does not appear anywhere on the board.

## 5. Numbered items (1–49)

*Footprint is L × W in metres, ±40%, unless the Confidence says otherwise. "Sat" = candidate match in `campus-map.png` (pixel box in §8). "Proposed type" is the `type` I would use in Step 3.*

| No. | Label as printed | Proposed type | Footprint (m) | Position basis | Conf. |
| --- | --- | --- | --- | --- | --- |
| 1 | Dr.A.P.J.ABDUL KALAM BLOCK | department | **113 × 92**, rot. 8.7° (user-supplied) | Sat ring, centre x = −125, z = +68 | **high** size, **medium** position |
| 2 | Dr.S.RADHAKRISHNAN BLOCK | department | board 90 × 45; sat candidate 85 × 107 | Sat Unlabelled-3 (SW of 1) | low |
| 3 | LABORATORIES SHED I | lab | 90 × 15 | board only (Sat Unlabelled-7 is a candidate) | low |
| 4 | LABORATORIES SHED II | lab | 70 × 15 | board only (Sat Unlabelled-8 is a candidate) | low |
| 5 | VEDA HOSTEL | hostel | 100 × 30 | board only (Sat Unlabelled-4 is a candidate) | low |
| 6 | OCTA HOSTEL | hostel | 100 × 25 | board only, far west / back | low |
| 7 | Dr. MUTHULAKSHMI REDDY HOSTEL | hostel | 125 × 35, drawn tallest | board only, north-west beside the track | low |
| 8 | PLAY GROUND | sports | 180 × 100 (board); sat field 170 × 95 | Sat field north-east of 1 | medium |
| 9 | BALL BADMINTON COURT | sports | 20 × 20 | board only: next to fuel station | low |
| 10 | KABADDI COURT | sports | 25 × 15 | board only | low |
| 11 | KHO-KHO COURT | sports | 25 × 15 | board only | low |
| 12 | BASKET BALL COURT | sports | 40 × 35 (12 and 13 share a fenced pink area) | Sat painted court pair | low |
| 13 | CRICKET PRACTICE NET | sports | within area of 12 | Sat painted court pair | low |
| 14 | VOLLEY BALL COURT | sports | 30 × 15 | Sat clay court | low |
| 15 | TENNIS COURT | sports | 30 × 25 | Sat grey court | low |
| 16 | SECURITY OFFICE | other (admin?) | 5 × 5 | beside main gate, south side | low |
| 17 | AXIS ATM | other | 3 × 3 | kiosk in front wall between 30 and 31 | low |
| 18 | SBI ATM | other | marker only | at front-left corner of 1 | low |
| 19 | OLYMPIA BLOCK | other (contains 21 Gym, 22 Guest House) | 35 × 30 | Sat L-shaped building | low |
| 20 | CANTEEN | canteen | not drawn separately | marker at walkway beside 19 | low |
| 21 | GYM | sports | marker on 19 | inside 19 | low |
| 22 | GUEST HOUSE | other | marker on 19 | inside 19 | low |
| 23 | BOYS MESS | canteen | 45 × 35 | board only, behind 5 (west) | low |
| 24 | STAFF QUARTERS | other | 30 × 25 | board only, behind sheds 3/4 | low |
| 25 | STORAGE YARD | other | 50 × 15 (shares a red-roof building with 26) | board only | low |
| 26 | POWER HOUSE | other | see 25 | board only | low |
| 27 | SNACK CORNER | canteen | small kiosk | board only, by 25/26 | low |
| 28 | GIRLS MESS | canteen | small | board only, at the end of 7 | low |
| 29 | MAIN TRANSFORMER | other | small | board only, back-right | low |
| 30 | TWO WHEELER PARKING | parking | 45 × 10 | Sat shed along highway (shared with 31?) | low |
| 31 | FOUR WHEELER PARKING | parking | 100 × 20 | Sat shed along highway | low |
| 32 | FUEL STATION (canopy prints `PETROL BUNK`) | other | 35 × 30 (board); sat 27 × 32 | Sat compound south of gate | low–medium |
| 33 | SEWAGE TREATMENT PLANT | other | 35 × 25 | board only, far back-right (north-west) | low |
| 34, 35, 36 | BIO GAS POINT | other (point) | marker | board only | low |
| 37–42 | SOLAR PV 250 kW | other (point) | markers on roofs of 1 (37–40) and 5 (41, 42) | roofs | medium |
| 43, 44, 45, 46 | EMERGENCY ASSEMBLY POINT | other (point) | marker | 43 on main road curve, 44 beside 28, 45 near 2, 46 near 5/19 | low |
| 47, 48, 49 | WELL | other (point) | marker | 47 near 24, 48 near 4, 49 near 2/23 | low |

## 6. Gates, roads, parking, sports, open space

### Gates

| ID | Label as printed | Notes | Conf. |
| --- | --- | --- | --- |
| Main gate | marker `YOU'RE HERE`; black boards `M. KUMARASAMY COLLEGE OF ENGINEERING` | Faces East onto NH-44. Candidate position: sat px (497,128), the origin. Iron gate leaves are drawn both sides of Security Office 16. | medium–low (position) |
| Unlabelled-1 | none | Smaller iron gate and name board south of 16 (probably a pedestrian gate) | low |

### Roads and walkways

| ID | Description | Conf. |
| --- | --- | --- |
| R1 | Main approach: from the gate west along the south edge of the north field (sat: E–W road at y ≈ 110–130 px), then to the front of building 1. Vehicles enter turning west. | medium |
| R2 | Branch toward the fuel station, courts and the front of 1 (south side) | low |
| R3 | Palm avenue along the south edge of the track toward 28/44 and the plaza at 34 (north-west) | low |
| R4 | Internal road between sheds 3/4 and the red-roof building 25/26, ending at the plaza | low |
| R5 | Grey winding road behind 24 toward hostel 6 | low |
| R6 | Orange paved walkway band along building 1's front and the courts | low |
| Sat-R2 | N–S dirt track west of building 1 (px ≈ x 225–260, y 130–260) | low |

### Parking

30 two-wheeler and 31 four-wheeler sheds; bus bay at the fuel station (32); vehicles lined up in the north field's east edge (px ≈ x 460–465, y 80–115), probably the parking area the board shows as the sheds.

### Sports areas

Items 8 (play ground) and 9–15 (courts). Satellite court clusters: painted pair (px 440,195 – 495,265), clay court (405,258 – 445,315), grey court (445,262 – 495,312).

### Open spaces

| ID | Description | Conf. |
| --- | --- | --- |
| Open-1 | North field (px 265,0 – 480,120; 170 × 95 m): candidate for the play ground 8. No oval track is visible in this image, which may predate the track. | medium |
| Open-2 | Palm/coconut plantation filling the west and the back of the campus | medium |
| Open-3 | Tree courtyard inside building 1 | high |
| Open-4 | Bare field south-west (px 0,433 – 235,558; 186 × 99 m), also a ground-sized field | low (purpose unknown) |
| Open-5 | Green strip with trees beside the main approach road near the gate | low |

### Boundary

Dark-grey wall: east side along the highway (sat: thin wall line at x ≈ 497 px from y ≈ 200 to 320) with the gate; other sides inferred from the board only. Low confidence on exact line.

## 7. Unlabelled structures

| ID | Where | Description |
| --- | --- | --- |
| Unlabelled-1 | beside Security Office 16 | Small side gate and name board |
| Unlabelled-2 | sat [152,0,262,85] | Courtyard block with white walkway strip, north-west of the field (87 × 67 m, cut by the image edge) |
| Unlabelled-6 | sat [245,463,320,535] | Grey flat-roof building, 59 × 57 m |
| Unlabelled-9 | sat [480,126,492,136] | Small cabin by the road at the gate (maybe the Security Office) |
| Unlabelled-10 | sat [178,225,195,265] | Two small white buildings, west of 1 |
| Unlabelled-11 | sat [185,128,220,165] | Small grey-roof compound west of 1 |

## 8. Satellite structures (px box → metres, ×0.792; position of centre relative to gate, x East, z South)

| Structure | Pixel box | Size E–W × N–S | Centre (x, z) | Candidate board no. |
| --- | --- | --- | --- | --- |
| Building 1 ring | quad (292,135)(406,152)(388,293)(270,274) | 92 × 113 (rot. 8.7°) | (−125, +68) | **1** (confirmed by your dimensions) |
| North field | [265,0,480,120] | 170 × 95 | (−99, −54) | 8 (medium) |
| Painted court pair | [440,195,495,265] | 44 × 55 | (−23, +81) | 12/13 |
| Clay court | [405,258,445,315] | 32 × 45 | (−49, +117) | 14 |
| Grey court | [445,262,495,312] | 40 × 40 | (−23, +119) | 15 |
| Parking shed on highway | [470,33,495,110] | 20 × 61 | (−11, −45) | 30/31 |
| Fuel-station compound | [458,146,492,186] | 27 × 32 | (−17, +30) | 32 |
| L-shaped building | [375,328,448,393] | 58 × 51 | (−68, +184) | 19 |
| Multi-wing block | [205,288,312,423] | 85 × 107 | (−189, +180) | 2 |
| Long left block | [0,255,60,410] | 48 × 123 | (−370, +162) | 5 |
| Thin block A | [332,430,360,560] | 22 × 103 | (−120, +291) | 3? |
| Thin block B | [370,432,392,560] | 17 × 101 | (−92, +291) | 4? |
| Courtyard block (north) | [152,0,262,85] | 87 × 67 | (−230, −68) | none (Unlabelled-2) |
| Grey flat-roof building | [245,463,320,535] | 59 × 57 | (−170, +294) | none (Unlabelled-6) |

The overlay `docs/satellite-candidates.png` draws all of these so you can check them in one look.

## 9. Open items (STOP: need your answers or corrections)

1. **North:** I am assuming the top of `campus-map.png` is north (the highway is vertical on the right, which matches your description). Correct me if not.
2. **Gate and the 102 m:** (a) Is the main gate where the red marker is on `satellite-candidates.png` (east boundary, just south of the parking shed)? (b) Does "main gate to the entrance, 102 m" mean to building 1's main door, measured along the road?
3. **Wider satellite image:** the crop shows only ~430 m west of the highway, so the hostels (5, 6, 7), the messes (23, 28), the plantation and the back of the campus are partly or fully outside it. Can you export a wider satellite screenshot at the same zoom (more to the west and north), or tell me roughly how far west the campus extends?
4. **Candidate matches** on `satellite-candidates.png`: please say yes/no for each, or the right one: 8 north field, 12/13 painted courts, 14 clay court, 15 grey court, 30/31 shed, 32 fuel station, 19 L-shaped building, **2 multi-wing block** (its shape differs from my board reading), 5 long left block, 3/4 the two thin blocks.
5. **Door sides** (Step 3 needs them): which side is the main door on for 1 (east face?), 2, 3, 4, 5, 6, 7 and the other buildings? Otherwise I place doors on the side nearest the road and flag them for calibration.
6. **Schema additions** I propose beyond the brief, unless you object: optional `rotationDeg` on buildings (building 1 needs 8.7°), and `kind: "point"` for the wells, bio gas, solar and emergency assembly markers (34–49) so they are points of interest, not buildings. The brief's type list has no `library` entry and the board lists none, so none will be created.
7. **Proposed types** in §5: please correct (for example is "Security Office" `admin` or `other`, and are the messes `canteen`?).


---

## 10. Revision 3 (Step 3): what went into `src/data/campus.json`

`campus.json` is now the **single source of truth**. This document records how it was derived; if they disagree, the JSON wins.

**Corrections to §8.** Several centre coordinates in §8 were computed by hand and were wrong (for example the clay court is centred at x = −57, z = +125.5, and the grey court at x = −21.4, z = +126, not the values shown). The generated tables below replace them.

**How positions were derived**
- *Satellite-matched buildings* use the pixel box converted at 0.792 m/px with the gate at pixel (497, 128).
- *Board-only buildings* use a perspective (homography) fit of the signboard photo `1.jpeg` onto metres, anchored on four ground corners of building 1, the gate, the fuel station and the two courts (residuals 1–10 m). It was **validated on points that were not used as anchors**: block 2 landed 22 m from the multi-wing block, 19 within 19 m of the L-shaped building, 6 within 29 m of the long west block, and 24 near the two small white buildings. Beyond about 300 m west of the gate the fit is extrapolation, so far-west items (29, 33, hostel 7's exact position, the west boundary) are the least reliable.
- *Building 1's main door* is placed on the east face at z = 31 m, which makes the road distance from the gate **102.5 m**, matching your measurement of about 102 m.
- Doors of all other buildings are on the side nearest the path (flagged unverified, as asked).
- Heights (`heightM`) are visual estimates from the board and your photos and are flagged unverified. Only building 1 has `floors` other than 1: **4**, read from the directory sign photographed at its entrance (levels Ground to Third; the photo is low-resolution, so flagged unverified).
- Schema additions beyond the brief: `rotationDeg`, `heightM`, `form`, optional `ring` and `parts`, a `verified` flag set, `confidence`/`source`, and a separate `points[]` list for markers 21, 22 and 34–49.

### Buildings (x East, z South, metres; origin = main gate)

| No. | Name (as printed) | Type | Centre x, z | Size w × d (m) | Height (m) | Conf. | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Dr.A.P.J.ABDUL KALAM BLOCK | department | -125.1, 67.7 | 92 × 113 (rot 8.7°) | 15 | medium | satellite + user dimensions (113 x 92 m) |
| 2 | Dr.S.RADHAKRISHNAN BLOCK | department | -188.9, 180.2 | 84.7 × 106.9 (rot 4°) | 12 | low | satellite candidate (multi-wing block SW of block 1) |
| 3 | LABORATORIES SHED I | lab | -207, 61 | 20 × 95 | 5 | low | board + satellite (long dark strip west of block 1) |
| 4 | LABORATORIES SHED II | lab | -233, 58 | 15 × 60 | 5 | low | board only |
| 5 | VEDA HOSTEL | hostel | -106.9, 290.7 | 47.5 × 103 | 15 | low | board + satellite candidate (two parallel solar-roof wings) |
| 6 | OCTA HOSTEL | hostel | -369.9, 162 | 47.5 × 122.8 | 15 | low | board + satellite candidate (long block at the west edge of the crop) |
| 7 | Dr. MUTHULAKSHMI REDDY HOSTEL | hostel | -270, -125 | 125 × 35 | 28 | low | board only (outside the satellite crop) |
| 8 | PLAY GROUND | sports | -103.4, -53.9 | 160.8 × 95 | 0 | medium | satellite candidate (bare field NE of block 1; top edge clipped by the crop) |
| 9 | BALL BADMINTON COURT | sports | -44, 28 | 20 × 18 | 0 | low | board only |
| 10 | KABADDI COURT | sports | -53.5, 85 | 12 × 12 | 0 | low | board only |
| 11 | KHO-KHO COURT | sports | -53.5, 66 | 12 × 22 | 0 | low | board only |
| 12 | BASKET BALL COURT | sports | -23.4, 78 | 43.6 × 49.9 | 0 | low | satellite candidate (painted court pair) |
| 13 | CRICKET PRACTICE NET | sports | -12, 154 | 28 × 10 | 0 | low | board only |
| 14 | VOLLEY BALL COURT | sports | -57.8, 126.7 | 30.1 × 42.8 | 0 | low | satellite candidate (clay-coloured court) |
| 15 | TENNIS COURT | sports | -21, 126.3 | 38.8 × 38.8 | 0 | low | satellite candidate (grey court) |
| 16 | SECURITY OFFICE | admin | -4, 10 | 5 × 5 | 3.2 | low | board (next to the main gate) |
| 17 | AXIS ATM | other | -8, -38.5 | 5 × 5 | 3 | low | board (front wall between 30 and 31) |
| 18 | SBI ATM | other | -58, 30 | 4 × 4 | 3 | low | board (near the front of block 1) |
| 19 | OLYMPIA BLOCK | other | -67.7, 184.1 | 57.8 × 51.5 | 12 | low | satellite candidate (L-shaped building); contains legend items 21 GYM and 22 GUEST HOUSE |
| 20 | CANTEEN | canteen | -100, 148 | 16 × 12 | 4 | low | board marker only; footprint is a placeholder |
| 23 | BOYS MESS | canteen | -169.9, 293.8 | 59.4 × 57 | 8 | low | board + satellite candidate (grey flat-roof building) |
| 24 | STAFF QUARTERS | other | -253, 93.5 | 14 × 43 | 9 | low | board + satellite candidate (two small white buildings) |
| 25 | STORAGE YARD | other | -236, 5 | 24 × 12 | 6 | low | board + satellite candidate (small compound) |
| 26 | POWER HOUSE | other | -236, 19 | 24 × 12 | 6 | low | board + satellite candidate (small compound) |
| 27 | SNACK CORNER | canteen | -214, 4 | 8 × 6 | 3.5 | low | board only |
| 28 | GIRLS MESS | canteen | -250, -22 | 20 × 14 | 5 | low | board only |
| 29 | MAIN TRANSFORMER | other | -485, -70 | 6 × 6 | 4 | low | board only (outside the satellite crop) |
| 30 | TWO WHEELER PARKING | parking | -11, -24 | 18 × 22 | 3.5 | low | board + satellite candidate (shed along the highway wall) |
| 31 | FOUR WHEELER PARKING | parking | -11, -58 | 18 × 32 | 3.5 | low | board + satellite candidate (shed along the highway wall) |
| 32 | FUEL STATION | other | -17.4, 30.1 | 26.9 × 31.7 | 5.5 | low | board + satellite candidate; the canopy prints PETROL BUNK |
| 33 | SEWAGE TREATMENT PLANT | other | -470, -45 | 30 × 22 | 4 | low | board only (outside the satellite crop) |
| – | Unlabelled-2 | other | -229.7, -67.7 | 87.1 × 67.3 | 10 | low | satellite only; courtyard block with no matching board number (top edge clipped by the crop) |

### Points

| No. | Name (as printed) | Kind | x, z |
| --- | --- | --- | --- |
| 21 | GYM | room-marker | -67.7, 184.2 |
| 22 | GUEST HOUSE | room-marker | -67.7, 190.2 |
| 34 | BIO GAS POINT | biogas | -268, -18 |
| 35 | BIO GAS POINT | biogas | -370, 92 |
| 36 | BIO GAS POINT | biogas | -170, 335 |
| 37 | SOLAR PV 250 kW | solar-pv | -132.1, 113.2 |
| 38 | SOLAR PV 250 kW | solar-pv | -163.7, 82 |
| 39 | SOLAR PV 250 kW | solar-pv | -157.7, 42.5 |
| 40 | SOLAR PV 250 kW | solar-pv | -110.2, 23.4 |
| 41 | SOLAR PV 250 kW | solar-pv | -119.6, 290.7 |
| 42 | SOLAR PV 250 kW | solar-pv | -91.9, 291.5 |
| 43 | EMERGENCY ASSEMBLY POINT | assembly | -45, -12 |
| 44 | EMERGENCY ASSEMBLY POINT | assembly | -225, -30 |
| 45 | EMERGENCY ASSEMBLY POINT | assembly | -136, 150 |
| 46 | EMERGENCY ASSEMBLY POINT | assembly | -78, 220 |
| 47 | WELL | well | -290, 100 |
| 48 | WELL | well | -215, 38 |
| 49 | WELL | well | -140, 205 |

### Still open

1. Does the 4-level reading for building 1 match reality? (Floors for every other building are 1 by default.)
2. Please check the candidate matches on `docs/satellite-candidates.png` using the calibration mode (`?calibrate=1`) once the world is running.
3. A wider satellite image would remove most of the extrapolation uncertainty in the west.
