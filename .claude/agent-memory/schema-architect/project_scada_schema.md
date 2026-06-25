---
name: SCADA Schema Findings
description: Key facts about the SCADA editor module schema — widget types, field names, Go JSON tags, data binding, and API contracts — derived from full source analysis.
type: project
---

SCADA editor schema fully documented in `web/src/scada/SCHEMA.md` (written 2026-04-19, commit ~4a3fdb7).

**Why:** The schema document serves as the single source of truth for the canvas JSON stored in `ScadaInfo.canvas_data` and all widget contract details. It was requested to support future schema/ directory work.

**How to apply:** Always consult `web/src/scada/SCHEMA.md` before writing SCADA-related schemas in `schema/scada/`. Verify source files haven't drifted by checking `scadaSchema.js` and `scadaEventAnim.js`.

## Key Source File Locations

- Canvas + widget normalizers: `web/src/scada/scadaSchema.js`
- Event & animation fields: `web/src/scada/scadaEventAnim.js`
- ECharts option builders: `web/src/scada/scadaChartOptions.js`
- STOMP subscription: `web/src/scada/useScadaPointStream.js`
- Go models: `server/models/scada_core.go`, `scada_sim.go`, `scada_customize.go`, `scada_deploy.go`
- REST handlers: `server/api/scada.go`

## Widget Type Strings (exact values from normalizeWidget whitelist)

`text`, `value`, `rect`, `image`, `gauge`, `chart`, `topo`, `button`, `switch`, `input`, `table`

Unknown types are coerced to `value` on load.

## Topo Kind Strings

`pipe`, `valve`, `pump`, `tank`, `meter`, `motor`

## Chart Kind Strings

`line`, `bar`, `pie`, `gauge`, `radar`, `scatter`

## Field Name Conventions

- Canvas uses `w` and `h` (NOT `width`/`height`) for widget dimensions.
- All linkName fields are trimmed strings; empty string = no binding.
- All JSON tags on Go models use snake_case, matching frontend property names exactly.
- `ScadaInfo.canvas_data` is a raw JSON string (not a nested object) in the DB.
- `ScadaInfo.content_version` auto-increments on every save and publish.

## STOMP Topic Pattern

`/topic/scada/point-data/{scadaCode}` — message is flat JSON object `{ linkName: number }`.

## Key Constraints

- `scada_code` is unique; max 100 chars.
- `tableTitles` max 8 columns; `tableCells` max 40 rows.
- `evtLoadScript` stored but NOT executed in preview/share pages.
- `tableColumnLinks` only affects row index 0 (first data row).
- No explicit zIndex field — z-order is array position in `canvas.widgets`.
