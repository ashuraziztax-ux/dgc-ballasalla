# DGC Ballasalla Phase 4 — Control Panel Changelog

All versions committed to `main` → deployed at  
`https://ashuraziztax-ux.github.io/dgc-ballasalla/control-panel.html`

---

## v125 — 17 May 2026
**H&S Toolbox Talk register goes live (Dave persona)**
- Toolbox Talk Register is now localStorage-backed — the 6 existing talks (Apr–May) are pre-loaded as DEFAULT_TOOLBOX_TALKS so the register shows real history on first load
- "+ Add Toolbox Talk" button now opens an inline form: date, topic, attendees, led by, signed-off checkbox — saves immediately to localStorage
- "Sign Off" button on unsigned talks marks them signed
- H&S KPI tile "Toolbox Talks" updates live from the store
- Plant tab: "+ Log Delivery" now redirects to the Cash Flow tab (orders + delivery log already live there)

## v124 — 17 May 2026
**Plant tab: localStorage-backed hired plant tracker (Jake persona)**
- "Plant on Hire" section is now fully dynamic — backed by DEFAULT_HIRE_RECORDS (JCB JS131, Terex TA6, Road Saw pre-seeded)
- KPI row (Items on Hire, Daily Rate, Total Cost, Total Items) calculates live from hire dates
- Days on hire auto-calculated from on-hire date to today (or off-hire date if set)
- "✓ Off-Hire Today" button sets return date and status in one click
- "+ Log Hire Item" form: item name, make/model, supplier, on-hire date, day rate
- ph-notice updated to reflect live system

## v123 — 17 May 2026
**Cash Flow: CSV export + payments-due-soon panel (Rachel/Accountant persona)**
- "📥 Export CSV" button added to the Order & Expenditure Log header — downloads orders + AFP data as a dated .csv file
- "⚡ Payments due within 7 days" amber panel injects automatically above the order table when any invoiced/ordered items have a payment date due within 7 days (red if overdue)
- `cfExportCSV()` function: separate sections for orders and AFP in the CSV, auto-filename includes today's date

## v122 — 17 May 2026
**"Coming soon" buttons fixed + Dashboard RAG status bar (Ash/Tom/Dave/Jake personas)**
- Field tab: "⚠ Report Now" → `fieldReportNearMiss()` — navigates to Risk Tickets with H&S pre-checked
- Field tab: "✓ Log It" → `fieldLogProgress()` — saves activity + note to localStorage (dgc_field_log), shows toast
- Field tab: "🖨 Print Briefing" → `window.print()`
- Field tab selects given IDs: `field-act-sel`, `field-note-inp`
- H&S tab: "+ Log Incident / Near Miss" → `fieldReportNearMiss()`
- Plant tab: "+ Add Plant Item" → `ownedPlantAdd()` + scrolls to owned plant section
- Dashboard: RAG status bar injected above alerts area — green/amber/red from `DS.daysLateEarly`; auto-renders on tab load and page load

## v121 — 17 May 2026
**Data integrity + AFP corrections (Emma/QS, Rachel/Accountant, Jamie/Programme personas)**
- "Data frozen" notice reworded to "📸 Snapshot as of 14 May 2026" — less alarming, clearer intent
- AFP1 row: shows "Combined → App.1" — reflects Dandara combined AFP1+2 into one Self-Billing Invoice
- AFP2 row: updated from "Due 28 May" to "Received 12 May 2026" — matches real payment received
- AFP2 breakdown: updated to match Dandara Self-Billing Invoice SC193064-x17 (Gross £164,028.11 | Discount −£2,441.04 | Retention −£4,847.61 | Net £156,739.46)
- Alerts: `afp2-received` question removed (duplicate), `afp1-received` changed from question to info confirmation, new `eot-d-to-i` warning added for £16,167 EoT prelims not yet submitted
- DELAY_DEFAULTS: D014 (was bundled EOT-C/D/E/F/G) split into 5 separate entries; EOT-H (4 days, £4,880) and EOT-I (0.5 days, £685) added — were completely missing

## v120 — 17 May 2026
**Risk Tickets: real data pre-loaded from PDFs**
- All 20 RCT/RT tickets extracted from physical PDF records (OneDrive `Risk Tickets/` folder) and embedded as `DEFAULT_RISK_TICKETS` — the Risk Tickets tab now shows real site history on first load rather than an empty register
- Tickets covered: RCT 101004–101016 and RT 101303–101311 (RT 101305 not filed; Near Miss Reports folder empty)
- Expanded ticket detail view now shows linked CCE reference where applicable
- New tickets raised via the form continue from RT-101312

## v119 — 16 May 2026
**Final Account tab from BA4 Estimated Final Account spreadsheet**
- New "Final A/c" tab wired from `BA4 - DGC Estimated Final Account.xlsx`
- EFA summary KPI strip: Contract Sum £450,142 | Variations £10,847 | EFA Gross £463,089 | Retention 1.5% | EFA Net £456,143 | Received £156,739 | Still to Come £299,403
- Progress bar showing 34% of EFA net collected
- Full variations register — all 18 numbered variations + EoT A–I with status badges (Certified / Estimated / Omit at FA / Goodwill / Not yet submitted)
- EoT D–I (£16,167 potential) flagged as not yet submitted
- Cash Flow KPI row: new "Still to Come (EFA net)" purple tile

## v118 — 16 May 2026
**Cash Flow AFP: real figures from Dandara Self-Billing Invoice SC193064-x17**
- Replaced invented AFP placeholder data with actual Dandara certified figures:
  - Gross certified: £164,028.11 | Settlement discount: £2,441.04 | Retention: £4,847.61 | Net payable: £156,739.46
- AFP table now shows 5-column breakdown: Gross | Discount | Retention | Net Receivable
- KPI "Cash Received (AFP)" now shows correct £156,739 (was £246,414)
- QS note: Dandara PDF shows £475,142.39 vs system £450,142 — reconciled via Main Contractors Discount (see v119)

## v117 — 15 May 2026
**Programme tab: fix three-number contradiction**
- Root cause: `parseDate()` used midnight local time; `forecastDate` built from noon → 12-hour BST gap → `Math.round(0.5) = 1` → showed "+1 day" even when forecast = deadline
- Fix: `parseDate()` now uses `T12:00:00` (noon, BST-safe everywhere)
- `buildProgrammeHeader()` now reads `DS.daysLateEarly` directly (single source) instead of recalculating from date object
- Removed "At Programme Pace" tile (gave contradictory date via old WD method); replaced with "Contract Deadline" countdown showing calendar days to 26 Jun

## v116 — 14 May 2026
**Weather widget, Cash Flow database, 4 template tabs**
- Ronaldsway Airport live weather chip in header (Open-Meteo API, 30-min cache, groundworks suitability rating)
- Cash Flow tab: full localStorage-backed supplier payment database, purchase order log, AFP tracker
- New tabs (template shells): Waste & Spoil, DOI / Licences, Tender / Quote, Handover

## v115 — 13 May 2026
**Owned Plant break-even calculator**
- Plant tab: localStorage-backed ROI calculator for owned equipment
- Shows hire-value-generated vs purchase + maintenance cost, break-even day count, % cost recovered progress bar
- Inline editable — click any value to update

## v114 and earlier
Pre-CHANGELOG. Core dashboard built: Programme, Gantt, Daily Log, Delays, Variations, Risk Tickets form, Staff Hours, Financial, Forecast, Efficiency, Site Map, Portfolio, Documents, H&S, Valuations, Field tabs.
