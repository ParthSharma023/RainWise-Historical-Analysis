# RainWise — Static HTML Dashboard

## Project Goal
**What:** Static HTML rebuild of the RainWise Smart Rainfall Intelligence Power BI report for Houston Water / COH Wastewater Infrastructure Planning.  
**Measures:** Near-realtime HCFCD daily rainfall per gage, wet weather SSO (sanitary sewer overflow) event correlation with 2-day antecedent rainfall, historical frequency analysis, and RainClass trend tracking.  
**Users:** Houston Water Wastewater Operations, Planning & Compliance teams (WWTP operators, planners, regulatory staff).  
**Output:** `file://` compatible — opens by double-clicking on a network drive (E drive). No server, no build step, no npm. Vanilla JS + Chart.js 4.4.0 via CDN.  
**Theme:** Dark (`styles.css` canonical dark theme — do not edit).

---

## Source Files

| File | Description |
|---|---|
| `../extract/database.json` | Full pbi-tools data model — tables, columns (with DAX), measures, relationships, Power Query M |
| `../extract/layout.json` | UTF-8 decoded Layout JSON — all pages and visual container positions (px) |
| `../extract/visual_inventory.json` | All 13 pages × 108 visuals with px coords, visualType, fields, priority flag |
| `../extract/report_theme.json` | Theme CY23SU08 — data colors, background `#FFFFFF`, foreground `#252423` |
| `../pbi-data-model-complete.md` | PRIMARY REFERENCE — full schema, measures, M code with plain-English step-by-step |
| `../reference/screenshots/` | 9 screenshots of live report pages |
| `../reference/assets/` | 3 embedded assets: GeoJSON basin boundaries, custom JSON, PNG rainfall image |
| `../reference/schema.csv` | 106 columns across 10 tables |
| `../reference/measures.csv` | 9 DAX measures |
| `../reference/relationships.csv` | 7 relationships |

---

## Drive & Path Mappings

Known mappings between SharePoint/network paths in the Power BI model and local E: drive locations.

| SharePoint / Network Path | Local E: Drive Path | Status |
|---|---|---|
| `houtx.sharepoint.com/sites/Ready-to-ConsumeDataWarehouse/Shared Documents/General/GIS Database/` | `E:\landing\GIS Database` | Confirmed |
| `houtx.sharepoint.com/sites/HWiP-WWO/Shared Documents/WW_Reg_Compliance/SSO_Tracking/` | Unknown | Not yet mapped |
| `\\10.120.148.123\hwDataLakeWWIP_s3\DaaP\Rain_Frequency\rain_gauge_frequency\all_rain_gauge_frequency.csv` | Unknown | Network share — used by Combined_Rain and Combined_Frequency tables |

---

## Data Model Summary

### Core Tables
| Table | Role | Source |
|---|---|---|
| `Realtime_rainfall_hcfcd_daily` | Fact — daily rainfall | Power Platform Dataflow (`wwip_rainfall_1_day`) |
| `vt_WW-SSO_Lisa` | Calculated fact — wet weather + public SSOs only | DAX filter on `SSO_Data_Lisa` |
| `SSO_Data_Lisa(SharePoint)` | Full SSO log 2001–present | SharePoint Excel |
| `RainGauge_HCFCD` | Gage dimension | SharePoint CSV |
| `BasinUnique_Raingage` | Basin→gage mapping (deduped) | SharePoint CSV |
| `MeterBasin_RainGauge` | Basin→gage with coordinates | SharePoint CSV |
| `Combined_Frequency` | Historical return frequency per gage/duration | Network share data lake |
| `Combined_Rain` | Historical peak rainfall per gage/duration | Network share data lake (same CSV) |
| `Excursion Category` | SSO cause→category lookup | SharePoint Excel |
| `Refresh_DateTime` | Single-row refresh timestamp | `DateTime.LocalNow()` |

### Key Relationships (all active, bidirectional)
- `Realtime_rainfall_hcfcd_daily[Gage]` → `RainGauge_HCFCD[Raingage]` (Many→One)
- `vt_WW-SSO_Lisa[DateGage]` → `Realtime_rainfall_hcfcd_daily[DateGage]` (Many→Many) — **2-day rainfall join**
- `vt_WW-SSO_Lisa[Basin]` → `BasinUnique_Raingage[METERBASIN]` (Many→One)
- `Combined_Frequency[UniqueID]` → `Combined_Rain[UniqueID]` (One→Many)
- `SSO_Data_Lisa(SharePoint)[ExcursionCause]` → `Excursion Category[Excursion Cause]` (Many→One)

### Key DAX Measures (all in `Realtime_rainfall_hcfcd_daily`)
| Measure | Purpose |
|---|---|
| `Total Daily Rainfall` | `SUM([rain])` — primary rainfall aggregation |
| `Total Weekly Rainfall` | `SUM([rain])` — same expression, weekly filter context |
| `Week Classification` | Returns "ZeroRain" / "Minor" / "Rainy" based on weekly total |
| `Rainfall for Previous Day` | `CALCULATE(SUM([rain]), PREVIOUSDAY([Date]))` |
| `DistictCountRecord` | `DISTINCTCOUNT([DateGage])` — unique date+gage combos |
| `CountRecord` | `COUNT([DateGage])` — total date+gage records |
| `DynamicTitle` | `"Raingage " & SELECTEDVALUE([Gage])` — visual title |
| `DynamicTitle (RainClass)` | `"Count of days for Category, " & SELECTEDVALUE([Event Category])` |

---

## CRITICAL DATA MODEL CORRECTIONS

### 1. DateCorrected Off-by-One
`[DateCorrected] = [Date] - 1`. The `Month` and `Weeknum` calculated columns use `DateCorrected`, NOT `Date`. The `Weekly Rainfall` measure filters on `DateCorrected`. **All weekly/monthly aggregations are one day shifted from the raw Date.** Mock data and live pipeline must reproduce this.

### 2. vt_WW-SSO_Lisa Filter — "ublic" substring
The calculated table filters `System` using `CONTAINSSTRING(..., "ublic")` — this matches both "Public" and "public" (case-insensitive). The raw `SSO_Data_Lisa` has been normalized by Power Query from `"Public System"` → `"Public"` already, so in practice this is redundant but intentional. **Do not change to exact match.**

### 3. DateGage Composite Key (M:M relationship)
`vt_WW-SSO_Lisa[DateGage] = StartDate & Related(BasinUnique_Raingage[RAINGAGEID])` — joins SSO events to rainfall via date+gage string concatenation. This is a Many-to-Many relationship. In JS, replicate as: `sso.StartDate.slice(0,10) + String(gage)` to match `rainfall.Date.slice(0,10) + String(rainfall.Gage)`.

### 4. BasinUnique_Raingage Deduplication is Arbitrary
The M query does `Table.Distinct(#"...", {"METERBASIN"})` with no ORDER BY — picks the first gage for each basin in whatever row order the CSV arrives. If the CSV row order changes, basin→gage assignments change. Flag for live pipeline.

### 5. Lat/Long in SSO_Data_Lisa are Strings
`Lat` and `Long` columns are `type any` (string) in Power Query, not numbers. Map visuals geocode from these strings. In JS, parse with `parseFloat()` and handle nulls.

### 6. Same CSV → Two Tables
`Combined_Frequency` and `Combined_Rain` both read `all_rain_gauge_frequency.csv`. The split is: rows with `Attribute` containing `"return_frequency"` → Combined_Frequency; rows with `"max_value"` → Combined_Rain. UniqueID is built identically in both, enabling the join.

### 7. Raw Source Column Names (for live pipeline)
The `wwip_rainfall_1_day` dataflow entity exposes: `datetime`, `gauge_id`, `data_value` — Power Query renames these to `Date`, `Gage`, `rain`. Live pipeline must output the renamed schema matching `mockData.js`.

---

## mockData.js API

```javascript
window.MOCK = {
  RainGauge_HCFCD: [{ Raingage, LOCATION, LONGITUDE, LATITUDE }],
  Realtime_rainfall_hcfcd_daily: [{
    Date,          // "YYYY-MM-DD"
    Gage,          // integer
    rain,          // decimal inches
    Gage_txt,      // string version of Gage
    Event_Category, // "Zero Rain"|"<0.3 in"|"0.3-1.0 in"|"1.0-3.0 in"|"3.0-5.0 in"|"Over 5.0 in"
    Year, Month, Weeknum,
    Year_Mon,      // "YYYY-MM"
    Year_Wk,       // "YYYY-WW"
    DateGage,      // Date + String(Gage)
    DateCorrected, // "YYYY-MM-DD" (Date - 1 day)
    Rain_PreviousDay,
    Rain_SSO_PrevDay
  }],
  vt_WW_SSO_Lisa: [{
    InternalExcursionID, StartDate, Address, Manhole,
    Basin, ExcursionCause, System, WWTP,
    StructureType, Blockage_Loc_Asset_Type,
    Year, DateGage
  }],
  BasinUnique_Raingage: [{ METERBASIN, RAINGAGEID, CRMPyn }],
  Excursion_Category: [{ Excursion_Cause, SSO_Count, Excursion_Cause_Category }],
  Refresh_DateTime: { DateTime, Date, Time }
};

window.MEASURES = {
  filter(data, { gage, startDate, endDate, eventCategory, basin, wwtp }) { ... },
  totalDailyRainfall(data, filters),   // SUM(rain)
  totalWeeklyRainfall(data, filters),  // SUM(rain)
  weekClassification(data, filters),   // "ZeroRain"|"Minor"|"Rainy"
  rainfallPreviousDay(data, filters),  // SUM(rain) for Date-1
  distinctCountRecord(data, filters),  // DISTINCTCOUNT(DateGage)
  countRecord(data, filters),          // COUNT(DateGage)
  dynamicTitle(gage),                  // "Raingage N"
  dynamicTitleRainClass(category),     // "Count of days for Category, X"
};
```

---

## components.js API

```javascript
window.Components = {
  renderBarChart(canvas, { labels, datasets, yLabel, title }),
  renderLineChart(canvas, { labels, datasets, yLabel, title }),
  renderHeatMap(el, { data, dateField, gageField, valueField, colorFn, maxRows }),
  renderDataTable(el, { columns, rows, maxHeight, colorRowFn }),
  renderKPICard(el, { label, value, unit, accentClass, subtext }),
  renderSlicer(el, { label, options, value, onChange }),
  makeTopBar(el, { title, subtitle, backHref }),
  applyChartDefaults(),
  initPageScale(),
  COLORS: { blue, teal, amber, orange, red, grey, darkRed },
  eventCategoryColor(category),   // returns hex for rainfall category
  RAIN_GAGES: [...],              // canonical gage list from mock data
};
```

---

## Completed Pages

| Page | File | Notes |
|---|---|---|
| Summary KPIs | `pages/kpi-summary.html` | 8 KPI cards, tableEx (300 rows), 2 slicers (Year-Mon, Gage) |
| Near Realtime Daily Rainfall | `pages/near-realtime-daily-rainfall.html` | Date × gage heatmap + Leaflet map, 5 slicers (Gage multi-select, Category, Year-Mon, Basin, WWTP) |

---

## Priority Pages Still Needed

| Page | Key Visuals | File |
|---|---|---|
| Page 1 (KPI Summary) | 8 cards + tableEx + 2 slicers | `pages/kpi-summary.html` ✅ |
| Near Realtime Daily Rainfall | pivotTable heatmap + map + 5 slicers | `pages/near-realtime-daily-rainfall.html` ✅ |
| Weekly Rainfall | pivotTable heatmap + 4 slicers | `pages/weekly-rainfall.html` |
| WetWeather SSO 2-day Rainfall | tableEx + map + 5 slicers | `pages/wetweather-sso-2day.html` |
| Rainfall Events & Frequency | tableEx + map + 5 slicers | `pages/rainfall-events-frequency.html` |
| RainClass Trends | 4 columnCharts + 5 slicers | `pages/rainclass-trends.html` |
| Annual WW-SSO Trends | clusteredColumnChart + tableEx | `pages/annual-ww-sso-trends.html` |
| WW-SSO and 2-day Rainfall | tableEx + map + 5 slicers | `pages/ww-sso-2day-rainfall.html` |
| WW-SSO Location Analytics | 2×tableEx + shapeMap + map + chart | `pages/ww-sso-location-analytics.html` |
| Data QA/QC | pivotTable + map + slicers | `pages/data-qaqc.html` |

Use `/pbi-page <name>` to build each remaining page.

---

## Style Guide

**Stylesheet:** `styles.css` — do not edit.

**CSS custom properties:**
```css
--bg: #0c1522          /* page background */
--bg-soft: #152235     /* slightly lighter bg */
--panel: #162436       /* card/panel background */
--panel-2: #1b2a3d     /* nested panel */
--border: rgba(139,175,214,0.22)
--text: #f1f5fb        /* primary text */
--muted: #b4c0d0       /* secondary text */
--low: #41b9a8         /* teal — low severity */
--medium: #e6a52e      /* amber — medium */
--high: #d46b2d        /* orange — high */
--critical: #cf4336    /* red — critical */
```

**Rainfall category colors (custom, not in styles.css):**
```css
--rain-zero:    #4a5568   /* grey — Zero Rain */
--rain-trace:   #68d391   /* light green — <0.3 in */
--rain-light:   #38a169   /* green — 0.3-1.0 in */
--rain-moderate:#d69e2e   /* amber — 1.0-3.0 in */
--rain-heavy:   #e53e3e   /* orange-red — 3.0-5.0 in */
--rain-extreme: #742a2a   /* dark red — Over 5.0 in */
```

**Severity tiers** (for SSO/compliance pages):
- 1 = Low → `.tier-low` / `.accent-teal`
- 2 = Medium → `.tier-medium` / `.accent-orange`  
- 3 = High → `.tier-high`
- 4 = Critical → `.tier-critical` / `.accent-red`
