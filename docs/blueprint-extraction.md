# MKCE 360 — Blueprint extraction (Step 2)

**Status: DRAFT, waiting for confirmation.** Nothing here has been verified by anyone who has seen the real campus. Per the brief, no campus fact is invented: every name below is either copied exactly as printed, or marked as a *legend guess* (inferred from ordering, unverified), or marked *not legible*.

---

## 1. Files inspected

| File | Format | Readable? | What it is |
| --- | --- | --- | --- |
| `assets/layout/1.jpeg` | JPEG 1156×867 | Yes | Photo of the whole printed "COLLEGE LAYOUT" signboard: oblique 3D illustration with numbered markers; left-hand legend partly visible |
| `assets/layout/2.jpeg` | JPEG 867×1156 | Yes | Close-up, left half: blocks 5, 19, 23, 2, sports courts 10–15, start of the ACADEMIC AREA legend |
| `assets/layout/3.jpeg` | JPEG 867×1156 | Yes | Close-up, centre: blocks 1, 3, 4, 6, 24–26, road, gate end |
| `assets/layout/4.jpeg` | JPEG 867×1156 | Yes | Close-up, right/front: track (8), 7, sheds 30/31, 17; part of a compass rose at the bottom edge; a different sign ("CAMPUS DIRE…") is in front of the board on the right |
| `assets/layout/5.jpeg` | JPEG 867×1156 | Yes | Close-up, front: gate/security office 16, "YOU'RE HERE", petrol bunk, FACILITIES and PARKING AND UTILITIES legend headings |
| `assets/campus-map.png` | PNG 540×578 | Yes | Top-down satellite crop. No scale bar, no coordinates, no north arrow |

No DWG/DXF/PDF was supplied. **There is no true blueprint.** The "layout" is five photos of a physical board, so:

- It is a **perspective illustration**, not a plan. Distances shrink toward the back of the board and there is no single scale.
- Buildings carry **numbers only**. Names exist only in the legend, and the legend is **cropped on the left in every photo** (the number column and the first characters of many lines are cut off).
- The board is partly occluded (a second sign on the right, glare, the board's left edge outside the frame).

**What would fix this (please send if you can):** straight-on, well-lit photos of the *three legend panels* in full (ACADEMIC AREA / hostels on the left, FACILITIES in the middle, PARKING AND UTILITIES on the right), including the numbers. If the college has the original artwork (PDF/AI/CDR from the printer), that is better than any photo, and a real site plan (DWG/PDF) would be best of all.

## 2. Scale: NOT determined

- The board has no scale bar and no stated ratio. A perspective illustration cannot have one scale anyway.
- The satellite image has no scale bar, no coordinate grid, and no known-size object I can verify (the athletics track does not appear in it as an oval).
- I will **not guess**. Instead, every footprint below is given in a relative unit:

> **1 U = the long outer side of building 1 (the ring-shaped block with solar panels and a tree courtyard) = about 158 px in `campus-map.png`** (ring measures ≈ 138 × 158 px).

Footprint in metres = value in U × (real length of that side of building 1 in metres). Once you give me one real distance, every number converts at once. Examples of what I need (any ONE of these):

1. The real length (m) of a side of building 1, or
2. Real distance (m) between two points that are clearly visible in `campus-map.png` (for instance measured with the *Measure distance* tool in Google Maps/Earth over the same buildings), naming both points, or
3. Confirmation that the athletics track (8) is a standard 400 m track (then I can use it, but the track is stylised on the board, so option 1 or 2 is safer).

## 3. Orientation: NOT resolved

- The compass rose on the board (partly visible, `4.jpeg`) shows N toward the top of the board, i.e. toward the back of the illustration (building 6 / palm grove), tilted by the photo angle. Confidence: medium.
- In `campus-map.png`, the dual carriageway runs along the right edge, and the paved/painted courts sit **between building 1 and that highway**. On the board, the courts (10–15) sit **to the left of the main road in front of building 1**, next to the front wall and the gate.
- Reading both together: either the satellite is not north-up, or the board's compass is only decorative, or I have matched the wrong things. **Working hypothesis (low confidence):** the main gate is on the highway side of the satellite crop, the board is viewed looking *away from the highway*, and the satellite's brown field at the top (x 265–480, y 0–120) is the athletics ground area.
- I need you to confirm: (a) is the top of `campus-map.png` north? (b) which side of the satellite crop is the main gate on, and is it on the highway?

Until then, signboard positions are expressed as **"left / right / front / back as drawn"**, and the satellite is used only for shapes and pixel sizes.

## 4. Legend as printed (only what is legible)

Texts copied exactly as printed (upper case as on the board). `…` marks characters cut off by the photo edge.

**ACADEMIC AREA** (title cropped to "…MIC AREA"; number column not visible)

Lines in the order they appear (these are legend *lines*, not building numbers):

- line 1: `A.P.J.ABDUL KALAM BLOCK`
- line 2: `…RADHAKRISHNAN BLOCK` (first characters cropped)
- line 3: `…ORATORIES SHED I` (first characters cropped)
- line 4: `…ORATORIES SHED II` (first characters cropped)
- *(blank gap; a sub-heading such as a hostels title may sit here, cropped)*
- line 5: `…EL` (cropped; probably ends in "HOSTEL")
- line 6: `…EL` (cropped; probably ends in "HOSTEL")
- line 7: `…AKSHMI REDDY HOSTEL` (first character cropped; probably "LAKSHMI REDDY HOSTEL")

**FACILITIES**

| No. | Label as printed |
| --- | --- |
| 16 | `SECURITY OFFICE` |
| 17 | `AXIS ATM` |
| 18 | `SBI ATM` |
| 19 | `OLYMPIA BLOCK` |
| 20 | `CANTEEN` (only the top of the line is visible; verify) |
| 21–29 | not visible |

**PARKING AND UTILITIES**

| No. | Label as printed |
| --- | --- |
| 30 | `TWO WHEELER PARKING` |
| 31 | `…WHEELER PARKING` (number and first word cropped; "FOUR" is likely, **unverified**) |
| 32–49 | not visible |

Sports (8–15) and everything numbered 33–49 have **no legible legend text**.

**Legend-order inference (unverified):** the ACADEMIC AREA list has 4 named blocks, a gap, then 3 hostel lines. That is 7 entries. The board's markers 1–7 are exactly the 7 large academic/residential buildings and 8 is the track. So I *suspect* 1 = A.P.J. Abdul Kalam Block, 2 = Radhakrishnan Block, 3 and 4 = Laboratories Sheds I and II, and 5, 6, 7 = the three hostels in some order. The look of the drawing agrees (3 and 4 are long low sheds; 7 is a tall hostel-style block). **I will not put these names into campus.json until you confirm.**

## 5. Numbered items on the signboard

Columns:
- **Label as printed** — exact printed text, otherwise *number only* plus the legend guess.
- **Kind** — inferred from the legend where legible, otherwise from the drawing (marked *drawing*).
- **Rel. footprint** — L × W in U (see §2), eyeballed from the perspective drawing. **Metres: pending scale** for every row.
- **Confidence** — in the *footprint and position*: high / medium / low. (Existence of the numbered item is high for all.)

| No. | Label as printed | Kind | Rel. footprint (U) | Conf. | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | *number only*. Legend guess: `A.P.J.ABDUL KALAM BLOCK` | academic building (drawing) | 1.0 × 0.9 | **medium** | Ring-shaped block, solar panels, tree courtyard. Same shape visible in satellite at x 270–408, y 135–293. Only building I can match to the satellite with reasonable confidence. |
| 2 | *number only*. Legend guess: `…RADHAKRISHNAN BLOCK` | academic building (drawing) | 0.8 × 0.4 | low | Large rectangular slab with flat roof, behind-left of 1 as drawn. |
| 3 | *number only*. Legend guess: `…ORATORIES SHED I` | lab shed (drawing) | 0.8 × 0.15 | low | Long low dark-roof shed behind the back wing of 1. |
| 4 | *number only*. Legend guess: `…ORATORIES SHED II` | lab shed (drawing) | 0.6 × 0.15 | low | Parallel to 3, nearer 24. |
| 5 | *number only*. Legend guess: a `…HOSTEL` line | hostel (drawing) | 0.9 × 0.25 | low | Long slab far left, solar roof (markers 41, 42). Joined to 23. |
| 6 | *number only*. Legend guess: a `…HOSTEL` line | hostel (drawing) | 0.9 × 0.2 | low | Long slab at the back of the plantation. |
| 7 | *number only*. Legend guess: a `…HOSTEL` line (possibly `LAKSHMI REDDY HOSTEL`) | hostel (drawing) | 1.1 × 0.3 | low | Drawn noticeably taller than the other blocks; at the right edge beside the track. Floors **not** extracted (per brief). |
| 8 | *number only* | sports: athletics track and field (drawing) | 1.6 × 0.9 (track only) | low | Red oval with green infield, on a large sand-coloured ground. Not visible as an oval in the satellite. |
| 9 | *number only* | sports courts (drawing) | 0.2 × 0.2 | low | Two small sand/clay courts beside the petrol bunk. Sport type unknown. |
| 10 | *number only* | sports/paved court (drawing) | 0.2 × 0.15 | low | Grey-brown paved area in front of 1, left of road. |
| 11 | *number only* | sports/paved court (drawing) | 0.2 × 0.15 | low | Sand-brown area next to 10. |
| 12 | *number only* | sports courts (drawing) | 0.35 × 0.3 (12 and 13 share one pink, fenced area) | low | Pink courts, basketball markings, purple fence. |
| 13 | *number only* | sports courts (drawing) | see 12 | low | Left half of the same pink area. |
| 14 | *number only* | sports courts (drawing) | 0.25 × 0.15 | low | Two orange (clay-coloured) courts. |
| 15 | *number only* | sports court (drawing) | 0.25 × 0.2 | low | Green court with white lines, inside the left wall. |
| 16 | `SECURITY OFFICE` | security cabin | 0.05 × 0.05 | low | Small cabin on the left side of the gate; the "YOU'RE HERE" marker is just below it. |
| 17 | `AXIS ATM` | ATM kiosk | 0.03 × 0.03 | low | Small glass kiosk in the front wall between 30 and 31. |
| 18 | `SBI ATM` | ATM | not drawn as a building | low | Marker on the walkway at the front-left corner of 1; no separate building visible. |
| 19 | `OLYMPIA BLOCK` | building | 0.3 × 0.25 | low | Two joined cream volumes, left of the courts, near the left wall. Markers 21, 22 sit on it. |
| 20 | `CANTEEN` (partly legible) | canteen | unknown | low | Marker at the walkway corner next to 19. The drawing shows no distinct canteen building. |
| 21, 22 | not legible | unknown | n/a | low | Small markers on block 19. |
| 23 | *number only* | building (drawing) | 0.4 × 0.3 | low | Cream building behind 5. Marker 36 on its roof edge. |
| 24 | *number only* | building (drawing) | 0.25 × 0.2 | low | Small white 2–3 storey block behind 3/4. |
| 25 | *number only* | building (drawing) | 0.45 × 0.15 (25 and 26 are one red-roof building) | low | Red tiled roof. |
| 26 | *number only* | building (drawing) | see 25 | low | Other section of the same red-roof building. |
| 27 | not legible | unknown | n/a | low | Small marker beside a tiny white kiosk at the end of 25/26. |
| 28, 44 | not legible | possible internal gate (drawing) | n/a | low | Two small markers at a dark gate-like opening at the left end of 7. |
| 29 | not legible | unknown | n/a | low | Small marker beside the blue courts, back-right corner. |
| 30 | `TWO WHEELER PARKING` | parking | 0.4 × 0.1 | low | Red-roofed shed along the front wall, right of the gate. |
| 31 | `…WHEELER PARKING` | parking | 0.9 × 0.2 | low | Large dark tiled shed along the front wall, right of 30. |
| 32 | *number only*. The canopy itself prints `PETROL BUNK` | petrol bunk or bus bay (**ambiguous**) | 0.3 × 0.25 | low | Marker sits on the bus beside the bunk. Not known whether 32 means the bunk or the bus parking. |
| 33 | not legible | sports/recreation (drawing) | 0.3 × 0.2 | low | Large marker on an orange hut with blue courts in the back-right corner. |
| 34 | not legible | junction/plaza (drawing) | n/a | low | Small marker on the paved plaza between 26 and 7. |
| 35 | not legible | unknown | n/a | low | Small marker at the right end of 6. |
| 36 | not legible | unknown | n/a | low | Small marker at the rear edge of 23. |
| 37, 38, 39, 40 | not legible | unknown (they sit on 1's solar-panel roof areas) | n/a | low | Could be wings or roof features of 1. **Not assumed to be solar.** |
| 41, 42 | not legible | unknown (on 5's solar roof) | n/a | low | |
| 43 | not legible | road marker (drawing) | n/a | low | On the main road at the curve before 1. |
| 45, 46 | not legible | unknown | n/a | low | 45 near the lawn edge of 2; 46 at the wall corner between 5 and 19. |
| 47, 48, 49 | not legible | unknown (each beside a small blue patch, possibly water) | n/a | low | 47 beside 24, 48 beside 4, 49 beside 2/23. |

## 6. Gates, roads, parking, sports, open space

### Gates

| ID | Label as printed | Footprint | Conf. | Notes |
| --- | --- | --- | --- | --- |
| Main gate | marker `YOU'RE HERE`; black name boards print `M. KUMARASAMY COLLEGE OF ENGINEERING` | gap ≈ road width, 2 lanes | medium | Iron gate leaves are drawn on both sides of the Security Office (16). The road leads straight from here into the campus. By the brief this is the origin. |
| Unlabelled-1 | none | ≈ pedestrian width | low | Smaller iron gate and name board to the left of 16, near the petrol bunk. May be a pedestrian gate. |
| Gate (28/44) | none | n/a | low | Dark gate-like opening at the left end of 7 (internal). Same as markers 28/44 above. |

### Roads and walkways (grey = road, orange/brown = paved walkway as drawn)

| ID | Description | Conf. |
| --- | --- | --- |
| R1 | Main approach: from the main gate, a two-lane dark-grey road curving up toward the front of 1 (marker 43 on it) | medium |
| R2 | Left fork of R1: runs past the petrol bunk and courts to the front of 1 and 18 | low |
| R3 | Right fork of R1: palm-lined avenue along the left edge of the track up to 28/44 and the plaza at 34 | low |
| R4 | Internal road between the 3/4 sheds and 25/26, ending at the 34 plaza | low |
| R5 | Grey winding road behind 24 curving toward 6 (marker 47) | low |
| R6 | Orange paved walkway band along the front and left of 1 and along the left edge of 19/courts | low |
| R7 | Paved plaza around 25/26/27/34 | low |
| Sat-R | Satellite: an E–W dirt/paved road along the south edge of the top brown field (≈ x 250–490, y 110–130) meeting the highway; an N–S track west of the ring building (≈ x 225–260, y 130–260) | low |

### Parking

| ID | Label as printed | Conf. | Notes |
| --- | --- | --- | --- |
| 30 | `TWO WHEELER PARKING` | low | Shed along the front wall |
| 31 | `…WHEELER PARKING` | low | Larger shed beside 30 |
| 32 | *(ambiguous, see §5)* | low | Bus/forecourt at the petrol bunk |
| Sat-P | Satellite: vehicles lined along the top edge (≈ x 330–465, y 0–8) and a long shed along the highway (≈ x 470–495, y 33–110) | low | May be bus/vehicle parking. |

### Sports areas

8 (track and field), 9, 10, 11, 12/13, 14, 15, 33 (+29). See §5. Satellite shows two court clusters east of building 1: a fenced green/orange painted pair (≈ x 440–495, y 195–265) and a clay-coloured plus grey court pair (≈ x 405–500, y 288–320).

### Open spaces

| ID | Description | Conf. |
| --- | --- | --- |
| Open-1 | Sand-coloured ground around the track and in front of 7 | medium |
| Open-2 | Very large palm/coconut plantation filling the back half of the board | medium |
| Open-3 | Tree courtyard inside building 1 | medium (also visible in satellite) |
| Open-4 | Green island with trees beside the main road near the gate | low |
| Open-5 | Satellite: large brown bare field at top (≈ x 265–480, y 0–120) | medium |
| Open-6 | Satellite: large bare field at bottom-left (≈ x 0–235, y 433–558) | medium |

### Boundary

Dark-grey wall drawn along the front (with the black name boards), the left (around courts, 19, 5, stepping in an L), the right (beside the track and 7) and the back (behind the plantation). Conf. low for exact line; existence high.

## 7. Satellite-only structures (`campus-map.png`, 540×578 px)

Boxes are `[x0, y0, x1, y1]` in image pixels. Because the board/satellite match is unresolved (§3), only the first row has a candidate number; all others are **Unlabelled**.

| ID | Pixel box | Description | Candidate signboard no. | Conf. |
| --- | --- | --- | --- | --- |
| (match) | [270, 135, 408, 293] | Ring block with solar panels and tree courtyard | 1 | medium |
| Unlabelled-2 | [152, 0, 262, 85] (cut by image top) | Rectangular courtyard block with white walkway strip on right | none | n/a |
| Unlabelled-3 | [205, 288, 312, 423] | Large multi-wing block with internal courtyards, below-left of 1 | none (2?) | low |
| Unlabelled-4 | [0, 255, 60, 410] | Long N–S block at left edge, red/orange roof | none | n/a |
| Unlabelled-5 | [375, 328, 448, 393] | L-shaped flat-roof building near the highway | none | n/a |
| Unlabelled-6 | [245, 463, 320, 535] | Grey flat-roof building, bottom centre | none | n/a |
| Unlabelled-7 | [332, 430, 360, 560] | Long thin N–S building with solar panels | none | n/a |
| Unlabelled-8 | [370, 432, 392, 560] | Second long thin N–S building | none | n/a |
| Unlabelled-9 | [470, 33, 495, 110] | Narrow roofed shed along the highway | none (30/31?) | low |
| Unlabelled-10 | [480, 319, 495, 333] | Small red-roof building near the highway | none (16?) | low |
| Unlabelled-11 | [178, 225, 195, 265] | Two small white buildings | none | n/a |
| Unlabelled-12 | [185, 128, 220, 165] | Small grey-roof compound west of the ring building | none | n/a |

## 8. What I need from you (the STOP checklist)

1. **Scale**: one real distance in metres (see §2 for the options).
2. **Orientation**: is the top of `campus-map.png` north? Which side of that crop is the main gate on?
3. **Legend**: confirm or correct the order inference in §4 (1 Kalam, 2 Radhakrishnan, 3/4 Lab Sheds I/II, 5/6/7 the three hostels), and send photos of the missing legend parts if you can (number columns, FACILITIES from 21, PARKING AND UTILITIES from 31 to the end, anything for 33–49).
4. **Items 21–29 and 33–49**: do you want them in the campus as points of interest (named once you tell me what they are), or ignore them for now? My suggestion: ignore until the legend is known.
5. **Which satellite structures are real campus buildings** that must appear even though they have no signboard number (Unlabelled-2 … -12)?
6. **Door sides** (needed in Step 3): the board shows entrances only for 16, 17 (front), 30/31 (open sheds). For every other building I need to know which side its main door is on, or I will place doors on the side nearest the road and flag them for calibration.
7. Corrections to anything else above.
