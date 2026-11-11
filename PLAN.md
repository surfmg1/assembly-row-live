# Assembly Row: Live — PLAN

Written 10 November 2026 against the master build prompt of the same date.

## 0. Update, later on 10 November: a playable Assembly Row

You asked for a game on Assembly Row you could play in a browser tonight, with invented train times. That is now the default build. It is **not** Milestone 2 as the brief defines it: the map is laid out by hand from general knowledge of the neighborhood, not ingested from MassGIS, LiDAR or OpenStreetMap, because this workspace cannot download them. Street positions are approximate and distances are compressed. See ADR 0005.

In the build: the street grid (Assembly Row, Grand Union Boulevard, Great River Road, Canal Street, Artisan Way, Foley Street, Revolution Drive), the station with a footbridge and island platform, Orange Line trains on a made-up 80-second timetable, the brick-toy attraction with a climbable rainbow giraffe, the cinema with a scaffold route to the roof, the hotel block and plaza, a parking garage with a switchback ramp, the Marketplace strip and lot, Baxter Riverfront Park with Ford-plant trusses, Draw Seven Park, the Amelia Earhart Dam, I-93, the Mystic with kayaking from two docks, a compressed river corridor to the boathouse, and a backdrop of the casino, the Boston skyline and the Zakim. Pedestrians, geese that chase you, and one security guard who chases skateboards in the hotel plaza. Twenty Ford rivets to find, and a station-to-boathouse time trial.

Decisions taken on your say-so: river corridor added; dammed, non-tidal basin; no MBTA key. Rating target is being treated as T.

**One more correction to the brief, from memory and not re-checked today:** the brief puts the Orange Line on the west with I-93. As I understand the site, I-93 is on the west and the Orange Line runs along the *east* side of Assembly Row, between the shops and Draw Seven Park, which is how this map is built. Worth confirming against a map.

Still not built from the brief: e-scooter, bike, driving, paddleboard, riding the T, free climbing beyond ledge grabs, the Sims layer, the mischief layer and Heat, LLM-driven characters, the AI Director, day and night, weather, Gaussian splats, real facades.

## 1. Where things stand

| Milestone | Status | Notes |
|---|---|---|
| 1. Movement lab | **Built, playable.** Two of three acceptance checks met; the third needs people. | See `reports/milestone-1-metrics.md` |
| 2. Data skeleton | **Blocked on environment and decisions** (section 5) | Needs package registry access, GIS downloads, an MBTA API key |
| 3. Vertical slice | Not started | Needs your approval of a real-world capture plan |
| 4. The river | Not started | Design must change first: the Mystic at Assembly is dammed (section 2) |
| 5. Living neighborhood | Not started | Needs a paid-API budget for LLM dialogue |
| 6. Public build | Not started | Needs your sign-off before anything is published |

## 2. Facts re-checked today, and what is out of date

Confidence: **checked** means I read a source today; **unverified** means I could not confirm it today and it stays on the list for Milestone 2.

| Brief says | Finding | Action |
|---|---|---|
| The playable map is Assembly Square, "roughly 45 acres" | Checked. 45 acres is the Assembly Row development. The district the stated bounds describe (I-93 to Draw Seven Park, the river to Sullivan Square) is about 143 acres. | Budget the map as ~143 acres, about 60 chunks of 100 m, not 45 acres |
| Blessing of the Bay Boathouse is an anchor, "about a mile west" | Checked: 32 Shore Drive, and Paddle Boston describes it as about a one-mile walk from Assembly station. It is west of I-93, so it is **outside the version 1 bounds as written**. | Add a river corridor to the bounds (decision 5.3) |
| Water is driven "by a tide value so the Mystic changes through the day"; "king tide flooding the river path" | **Out of date as designed.** The Amelia Earhart Dam spans the Mystic between Somerville and Everett, beside Draw Seven Park. It was built to regulate tidal effects and keep salt water out of the basin upstream, and has three boat locks. Assembly's waterfront, the boathouse and the Malden River mouth are all upstream of it. | Model a managed basin level upstream and tides only below the dam. Flood events become storm-surge stories about the dam. The locks are a ready-made kayak mission. |
| Draw Seven Park is a "quiet nature edge" | Checked: the state funded $15M to renovate the park (including a flood berm) and $13M to redesign the dam's elevation. | Confirm the park's current layout before modeling it |
| LEGO Discovery Center, 598 Assembly Row, with a giant LEGO giraffe | Partly checked: it reopened in May 2023 after a renovation under the name LEGO Discovery Center (formerly LEGOLAND Discovery Center). I did not confirm the street number or the giraffe today. | Confirm on site during capture |
| 12-screen cinema | Checked: listed as AMC Assembly Row 12 | None |
| The Row Hotel | Partly checked: a 200-room hotel is confirmed; the current name is unverified | Confirm |
| Marketplace strip with TJ Maxx, Trader Joe's and others | Trader Joe's checked (133 Middlesex Ave, in the strip, announced for late 2017). TJ Maxx unverified. Kmart closed in November 2019; Burlington replaced Sports Authority in 2018. | Pull the tenant list from OSM at ingest, then confirm by eye |
| Office and lab towers | Checked: Mass General Brigham, SmartBear and Puma's North American HQ are in the district | None |
| Three.js with the WebGPU renderer, plus a separate splat renderer | **Newer than the brief.** Current release is r187 (30 October 2026). r186 merged a native Gaussian splat renderer for WebGPU. It is limited: flat colour per splat, no level of detail, no streaming. WebGPU is on by default in Safari 26 and in Firefox on Windows and Apple Silicon; Firefox on Linux and Android still needs a flag, so the WebGL2 fallback matters. | Evaluate the built-in splat renderer against a dedicated one at Milestone 3 |
| Rapier (WASM) | Partly checked: Apache-2.0. The npm page I read showed 0.13.1, which I believe is not the newest. | Pin the version at first install |
| Genie 3 and Project Genie, 60-second generations | Checked: Genie 3 in August 2025, Project Genie on 29 January 2026 for Google AI Ultra subscribers over 18, 60-second cap, no public API found. Several blogs describe a "Genie 4"; I found no primary source. | Re-check before the "dream mode" stretch goal |
| MBTA V3 API under the MassDOT Developers License Agreement, free key | Checked. 1,000 requests a minute with a key; the plan's one request per 15 s is far inside that. I have not read the licence PDF itself. | Read it before Milestone 2 ships |
| MassGIS structures "edits through May 2026", 2021 QL1 LiDAR, TRELLIS 2, WebSplatter, the Lublin splat, Brush, Mapillary terms, Riverfest fireworks | Unverified today | Verify at ingest |

## 3. Other things in the brief I would change or want decided

1. **Player movement should not run on Rapier.** Arcade parkour and skating feel right on a hand-written kinematic controller, which is what Milestone 1 uses (ADR 0003). Rapier still earns its place for props, vehicles, boats and ragdolls.
2. **Rating target.** Shoplifting and pickpocketing as playable systems sit uneasily with E10+. The tone rules are good; the realistic target is the "T-style" end of the range the brief allows.
3. **Real institutions.** The brand layer swaps store names for public builds. MBTA Transit Police and the MBTA's own marks should go through the same layer.
4. **Share-alike reach.** Chunk files built from OpenStreetMap are likely a derived database under ODbL, and facade specs produced by a vision model from CC BY-SA Mapillary photos may be derivative works. Both are questions for a lawyer before a public build; until then the pipeline keeps them in separate, attributed folders as the brief asks.
5. **Async ghosts and player graffiti** need a server and moderation before they are shown to anyone else. Neither is costed anywhere in the brief.

## 4. Plan from here

**Milestone 2, data skeleton.** Order of work once unblocked:
1. Repository scaffold on Three.js r187 with the WebGPU renderer and WebGL2 fallback; port the lab onto it (the simulation core does not change).
2. Ingest pipeline: MassGIS structures and LiDAR, OSM/Overture, MBTA GTFS. One local frame in metres with its origin at Assembly station. Versioned chunk files and a manifest that generates `LICENSES.md` and the credits screen.
3. Greybox of the whole district plus the river corridor, streamed in 100 m chunks.
4. Orange Line on the real timetable, with the 15-second proxy and silent fallback.
5. Acceptance: streets within 1 m of OSM, trains within 30 s of schedule, both as CI tests.

**Milestones 3 to 6** follow the brief, with the water model changed as in section 2.

**Carried forward from Milestone 1:** e-scooter, bike, driving, kayak and riding the T are not built. Free climbing exists only as ledge grabs. Sound is synthesised placeholder.

## 5. What I need from you

1. **Five playtesters for the lab.** The last Milestone 1 check is "5 playtesters do a trick within 60 seconds unprompted". Open the lab, hand it over without explaining, and read "first trick" in the Stats panel. My scripted input gets there in 5.5 s, which proves the level, not the people.
2. **A frame-rate reading on real hardware.** Stats shows median and 1% low. I can only render in software here.
3. **Map bounds:** add the river corridor to the boathouse (recommended), or move kayak rental to the Assembly waterfront.
4. **Water model:** accept the dammed-basin correction (recommended), or keep fictional tides.
5. **Where the project lives.** This workspace has no package registry or bulk-download access. Milestone 2 needs a repository and a machine that can run `npm install` and fetch several gigabytes of state GIS data.
6. **An MBTA API key** (free) when Milestone 2 starts.
7. **Budgets:** a ceiling for paid APIs and GPU time, before any LLM dialogue or splat training.
8. **Capture plan approval** before anyone films the landmarks.
9. **Rating target:** E10+ or T.
