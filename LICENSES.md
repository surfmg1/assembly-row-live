# Licences and data sources

From Milestone 2 this file is generated from the ingest manifest. Until then it is written by hand.

## Shipped in the Milestone 1 build

| Item | Use | Licence |
|---|---|---|
| Barlow Condensed (Google Fonts) | HUD lettering, loaded at runtime | SIL Open Font License 1.1 |
| IBM Plex Mono (Google Fonts) | HUD numerals, loaded at runtime | SIL Open Font License 1.1 |

The build contains no third-party code, map data, imagery, audio or brand marks. The orange accent matches the MBTA Orange Line colour as a reference to the place; no MBTA logo or name appears.

## Build-time tools (not shipped)

esbuild 0.28.2 (MIT), TypeScript 6.0.3 (Apache-2.0), tsx 4.23.12 (MIT), Playwright 1.63.0 (Apache-2.0).

## Planned sources (none ingested yet)

| Source | Licence as stated in the brief | Checked on 2026-11-10? | Open question |
|---|---|---|---|
| MassGIS Building Structures | Public state data, credit MassGIS | No | |
| MassGIS / USGS 3DEP LiDAR | Public domain | No | |
| OpenStreetMap | ODbL | No | Are our chunk files a derived database that must be shared alike? |
| Overture Maps | Per theme | No | Record the licence of each theme used |
| MBTA V3 API, GTFS-realtime | MassDOT Developers License Agreement | Name and free key confirmed; licence text not yet read | Display guidelines for real-time data |
| Mapillary imagery | CC BY-SA | No | Is a facade spec written by a vision model a derivative work? |
| Own capture | Ours | n/a | Faces and plates must be avoided or blurred |
| Google Maps, Street View, 3D Tiles | **Never used** | n/a | |
