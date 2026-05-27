/**
 * mockData.js — RainWise Static Dashboard Mock Data
 *
 * RAW SOURCE DATA (from M code in pbi-data-model-complete.md):
 *   - Realtime rainfall: Power Platform Dataflow entity "wwip_rainfall_1_day"
 *     Raw columns: datetime, gauge_id, data_value
 *   - SSO events: SharePoint Excel "SSO Table and Data - Combined ETS and Infor.xlsx"
 *     Raw System values: "Public System" / "Private System"
 *   - Gage dimension: SharePoint CSV RainGauge_Poly.csv (RAINGAGEID renamed → Raingage)
 *   - Basin mapping: SharePoint CSV MeterBasin_RainGauge.csv (deduped on METERBASIN)
 *   - Frequency/Rain: \\10.120.148.123 data lake all_rain_gauge_frequency.csv
 *
 * TRANSFORMATIONS APPLIED (must match when connecting live data):
 *   - datetime → Date, gauge_id → Gage, data_value → rain
 *   - Gage duplicated as Gage_txt (string)
 *   - Event_Category bucketed from rain: 0="Zero Rain", <0.3="<0.3 in", <=1.0="0.3-1.0 in",
 *     <=3.0="1.0-3.0 in", <=5.0="3.0-5.0 in", else="Over 5.0 in"
 *   - DateCorrected = Date - 1 day (off-by-one correction in source)
 *   - DateGage = Date + String(Gage) (composite join key)
 *   - Year, Month, Weeknum derived from DateCorrected
 *   - Rain_PreviousDay = rain for same gage on Date-1
 *   - System normalized: "Public System"→"Public", "Private System"→"Private"
 *   - vt_WW_SSO_Lisa: filtered to ExcursionCause contains "Wet weather" AND System contains "ublic"
 *
 * LIVE PIPELINE CONTRACT: output must match field names and types in window.MOCK exactly.
 */

(function () {

  /* ── helpers ─────────────────────────────────────────────────── */
  function addDays(dateStr, n) {
    const d = new Date(dateStr); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10);
  }
  function fmt(d) { return d.toISOString().slice(0, 10); }
  function isoYM(d) { return d.toISOString().slice(0, 7); }
  function weekNum(d) {
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const startOfWeek1 = new Date(jan4); startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    const diff = d - startOfWeek1; const wk = Math.floor(diff / 604800000) + 1;
    return String(wk).padStart(2, '0');
  }
  function rainCategory(rain) {
    if (rain === 0)  return 'Zero Rain';
    if (rain < 0.3)  return '<0.3 in';
    if (rain < 1.0)  return '0.3-1.0 in';
    if (rain < 3.0)  return '1.0-3.0 in';
    if (rain < 5.0)  return '3.0-5.0 in';
    return 'Over 5.0 in';
  }
  function rnd(min, max) { return +(Math.random() * (max - min) + min).toFixed(2); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ── RainGauge_HCFCD ─────────────────────────────────────────── */
  const RainGauge_HCFCD = [
    { Raingage: 410,  LOCATION: 'Addicks Reservoir',         LONGITUDE: -95.6432, LATITUDE: 29.7654 },
    { Raingage: 420,  LOCATION: 'Barker Reservoir',          LONGITUDE: -95.7219, LATITUDE: 29.7523 },
    { Raingage: 430,  LOCATION: 'Brays Bayou at Main St',    LONGITUDE: -95.3701, LATITUDE: 29.7243 },
    { Raingage: 510,  LOCATION: 'Buffalo Bayou at Shepherd', LONGITUDE: -95.4102, LATITUDE: 29.7558 },
    { Raingage: 520,  LOCATION: 'Greens Bayou',              LONGITUDE: -95.2943, LATITUDE: 29.8211 },
    { Raingage: 610,  LOCATION: 'Hunting Bayou',             LONGITUDE: -95.3344, LATITUDE: 29.7901 },
    { Raingage: 620,  LOCATION: 'White Oak Bayou',           LONGITUDE: -95.4019, LATITUDE: 29.7812 },
    { Raingage: 710,  LOCATION: 'Sims Bayou',                LONGITUDE: -95.3512, LATITUDE: 29.6934 },
    { Raingage: 720,  LOCATION: 'Beltway 8 @ Brays',        LONGITUDE: -95.4687, LATITUDE: 29.7123 },
    { Raingage: 810,  LOCATION: 'Clear Creek',               LONGITUDE: -95.1823, LATITUDE: 29.5834 },
    { Raingage: 820,  LOCATION: 'Chocolate Bayou',           LONGITUDE: -95.4521, LATITUDE: 29.5312 },
    { Raingage: 910,  LOCATION: 'Cypress Creek',             LONGITUDE: -95.5891, LATITUDE: 29.9102 },
    { Raingage: 1010, LOCATION: 'Spring Creek',              LONGITUDE: -95.4238, LATITUDE: 30.0234 },
    { Raingage: 1110, LOCATION: 'Vince Bayou',               LONGITUDE: -95.2017, LATITUDE: 29.7412 },
    { Raingage: 1210, LOCATION: 'Halls Bayou',               LONGITUDE: -95.3156, LATITUDE: 29.8112 },
    { Raingage: 1310, LOCATION: 'Little Cypress Creek',      LONGITUDE: -95.6712, LATITUDE: 29.9534 },
    { Raingage: 1410, LOCATION: 'Turkey Creek',              LONGITUDE: -95.5234, LATITUDE: 29.8934 },
    { Raingage: 1510, LOCATION: 'Armand Bayou',              LONGITUDE: -95.1023, LATITUDE: 29.6234 },
    { Raingage: 1610, LOCATION: 'Cedar Bayou',               LONGITUDE: -95.0534, LATITUDE: 29.7834 },
    { Raingage: 1670, LOCATION: 'Galveston Bay Tributary',   LONGITUDE: -95.0123, LATITUDE: 29.7012 },
  ];

  /* ── Realtime_rainfall_hcfcd_daily ───────────────────────────── */
  // 2 years of daily data for all gages (sampled for performance)
  const dailyRainfall = [];
  const START = '2024-01-01';
  const END   = '2026-05-19';

  // Seasonal rain probability pattern (Houston: wet Apr-Oct, drier Nov-Mar)
  const monthRainProb = [0.18,0.20,0.28,0.38,0.42,0.45,0.40,0.38,0.36,0.30,0.22,0.18];
  const monthRainMax  = [1.2, 1.5, 2.0, 3.5, 4.0, 5.5, 4.5, 5.0, 4.2, 3.0, 2.0, 1.5];

  // Key storm events (simulate memorable Houston rain events)
  const stormEvents = {
    '2024-05-02': 3.8, '2024-05-03': 2.1,
    '2024-06-17': 5.2, '2024-06-18': 3.4,
    '2024-07-08': 1.8,
    '2024-09-12': 4.6, '2024-09-13': 2.9,
    '2024-10-03': 2.3,
    '2025-04-21': 6.1, '2025-04-22': 4.2,
    '2025-05-14': 3.1,
    '2025-06-30': 2.8,
    '2025-08-19': 7.2, '2025-08-20': 5.1,
    '2025-09-04': 3.3,
    '2025-11-01': 1.9,
    '2026-03-15': 4.4, '2026-03-16': 2.6,
    '2026-04-28': 5.8,
  };

  let cur = new Date(START);
  const endD = new Date(END);
  const prevDayRain = {}; // track previous day per gage

  while (cur <= endD) {
    const dateStr = fmt(cur);
    const mon = cur.getMonth();
    const correctedDate = new Date(cur); correctedDate.setDate(cur.getDate() - 1);
    const correctedStr = fmt(correctedDate);
    const ym = isoYM(cur);
    const wk = weekNum(cur);

    for (const g of RainGauge_HCFCD) {
      // Determine rain amount
      let rain = 0;
      const stormBase = stormEvents[dateStr];
      if (stormBase) {
        // Vary by gage with ±30%
        rain = +(stormBase * (0.7 + Math.random() * 0.6)).toFixed(2);
      } else if (Math.random() < monthRainProb[mon]) {
        rain = +Math.min(rnd(0.05, monthRainMax[mon]), 8.0).toFixed(2);
      }

      const prevKey = `${g.Raingage}`;
      const prevRain = prevDayRain[prevKey] || 0;
      prevDayRain[prevKey] = rain;

      dailyRainfall.push({
        Date: dateStr,
        Gage: g.Raingage,
        rain: rain,
        Gage_txt: String(g.Raingage),
        Event_Category: rainCategory(rain),
        Year: cur.getFullYear(),
        Month: correctedDate.getMonth() + 1,
        Weeknum: parseInt(wk),
        Year_Mon: ym,
        Year_Wk: `${cur.getFullYear()}-${wk}`,
        DateGage: dateStr + String(g.Raingage),
        DateCorrected: correctedStr,
        Rain_PreviousDay: prevRain,
        Rain_SSO_PrevDay: +(rain + prevRain).toFixed(2),
      });
    }
    cur.setDate(cur.getDate() + 1);
  }

  /* ── vt_WW_SSO_Lisa (wet weather + public only) ──────────────── */
  const BASINS = ['CH013','CH021','CH020','AS002','IB043','IB022','SB152','SB089','GR009','BW246','IIP28'];
  const WWTPS  = ['69th Street','Almeda Sims','Beltway','Chocolate Bayou','69th Street','Sims Bayou','Upper Brays'];
  const ADDRESSES = [
    '6429 INNSBRUCK MEADOWS LN','11018 JUTLAND','10718.5 SCOTT',
    '4500 NAVIGATION BLVD','8901 HOMESTEAD RD','12200 BEECHNUT ST',
    '3300 SYNOTT RD','7600 WESTHEIMER RD','2200 HOLLY HALL ST',
    '9100 SOUTH MAIN ST','5500 CULLEN BLVD','1800 MAIN ST',
    '4200 TELEPHONE RD','6800 HARRISBURG BLVD','3100 LEELAND ST',
  ];
  const CAUSES = [
    'Collection system – wet weather','Collection system – wet weather',
    'Collection system – wet weather – infiltration/inflow',
    'Collection system – wet weather – capacity',
    'Collection system – wet weather',
  ];
  const STRUCTURE_TYPES = ['Manhole','Cleanout','Lift Station','Gravity Line'];
  const BLOCK_ASSETS = ['Gravity Sewer','Force Main','Manhole','Lateral'];

  const vt_WW_SSO_Lisa = [];
  const ssoStormDates = [
    '2024-05-02','2024-06-17','2024-09-12',
    '2025-04-21','2025-08-19','2025-09-04',
    '2026-03-15','2026-04-28',
  ];

  let ssoId = 35000;
  for (const storm of ssoStormDates) {
    const count = Math.floor(Math.random() * 4) + 2; // 2-5 SSOs per storm
    for (let i = 0; i < count; i++) {
      const basin = pick(BASINS);
      // Find gage for this basin (simplified mapping)
      const gageMap = {
        'CH013': 430, 'CH021': 430, 'CH020': 430,
        'AS002': 710, 'IB043': 520, 'IB022': 520,
        'SB152': 820, 'SB089': 820, 'GR009': 910,
        'BW246': 410, 'IIP28': 610,
      };
      const gage = gageMap[basin] || 430;
      vt_WW_SSO_Lisa.push({
        InternalExcursionID: ssoId++,
        StartDate: storm,
        Address: pick(ADDRESSES),
        Manhole: `${basin}${String(Math.floor(Math.random()*9000)+1000)}`,
        Basin: basin,
        ExcursionCause: pick(CAUSES),
        System: 'Public',
        WWTP: pick(WWTPS),
        StructureType: pick(STRUCTURE_TYPES),
        Blockage_Loc_Asset_Type: pick(BLOCK_ASSETS),
        Year: parseInt(storm.slice(0,4)),
        DateGage: storm + String(gage),
      });
    }
  }

  /* ── BasinUnique_Raingage ────────────────────────────────────── */
  const BasinUnique_Raingage = [
    { METERBASIN: 'IB043', RAINGAGEID: 520,  CRMPyn: 'CRMP' },
    { METERBASIN: 'IB022', RAINGAGEID: 520,  CRMPyn: 'CRMP' },
    { METERBASIN: 'IB032', RAINGAGEID: 510,  CRMPyn: 'CRMP' },
    { METERBASIN: 'IIP28', RAINGAGEID: 610,  CRMPyn: 'CRMP' },
    { METERBASIN: 'II255', RAINGAGEID: 620,  CRMPyn: 'CRMP' },
    { METERBASIN: 'AS025', RAINGAGEID: 710,  CRMPyn: 'CRMP' },
    { METERBASIN: 'SB152', RAINGAGEID: 820,  CRMPyn: 'CRMP' },
    { METERBASIN: 'SB147', RAINGAGEID: 820,  CRMPyn: 'CRMP' },
    { METERBASIN: 'SB149', RAINGAGEID: 820,  CRMPyn: 'CRMP' },
    { METERBASIN: 'SB089', RAINGAGEID: 810,  CRMPyn: 'CRMP' },
    { METERBASIN: 'SBP19', RAINGAGEID: 810,  CRMPyn: 'CRMP' },
    { METARBESIN: 'GR009', RAINGAGEID: 910,  CRMPyn: 'CRMP' },
    { METERBASIN: 'II015', RAINGAGEID: 620,  CRMPyn: 'CRMP' },
    { METERBASIN: 'BW246', RAINGAGEID: 410,  CRMPyn: 'CRMP' },
    { METERBASIN: 'SBP02', RAINGAGEID: 810,  CRMPyn: 'CRMP' },
    { METERBASIN: 'CH013', RAINGAGEID: 430,  CRMPyn: 'Other' },
    { METERBASIN: 'CH021', RAINGAGEID: 430,  CRMPyn: 'Other' },
    { METERBASIN: 'CH020', RAINGAGEID: 430,  CRMPyn: 'Other' },
    { METERBASIN: 'AS002', RAINGAGEID: 710,  CRMPyn: 'Other' },
    { METERBASIN: 'II010', RAINGAGEID: 610,  CRMPyn: 'Other' },
  ];

  /* ── Excursion_Category ──────────────────────────────────────── */
  const Excursion_Category = [
    { Excursion_Cause: 'Collection system – wet weather',                           SSO_Count: 245, Excursion_Cause_Category: 'Wet Weather' },
    { Excursion_Cause: 'Collection system – wet weather – infiltration/inflow',     SSO_Count: 89,  Excursion_Cause_Category: 'Wet Weather' },
    { Excursion_Cause: 'Collection system – wet weather – capacity',                SSO_Count: 34,  Excursion_Cause_Category: 'Wet Weather' },
    { Excursion_Cause: 'Collection system – dry weather – grease',                  SSO_Count: 178, Excursion_Cause_Category: 'Dry Weather' },
    { Excursion_Cause: 'Collection system – dry weather – roots',                   SSO_Count: 92,  Excursion_Cause_Category: 'Dry Weather' },
    { Excursion_Cause: 'Collection system – dry weather – structural defect',       SSO_Count: 56,  Excursion_Cause_Category: 'Dry Weather' },
    { Excursion_Cause: 'Collection system – dry weather – other',                   SSO_Count: 43,  Excursion_Cause_Category: 'Dry Weather' },
    { Excursion_Cause: 'Force main failure',                                         SSO_Count: 29,  Excursion_Cause_Category: 'Infrastructure' },
    { Excursion_Cause: 'Vandalism/unauthorized connection',                          SSO_Count: 8,   Excursion_Cause_Category: 'Other' },
  ];

  /* ── Refresh_DateTime ───────────────────────────────────────── */
  const now = new Date();
  const Refresh_DateTime = {
    DateTime: now.toISOString().slice(0, 19).replace('T', ' '),
    Date: now.toISOString().slice(0, 10),
    Time: now.toISOString().slice(11, 19),
  };

  /* ── Expose globals ─────────────────────────────────────────── */
  window.MOCK = {
    RainGauge_HCFCD,
    Realtime_rainfall_hcfcd_daily: dailyRainfall,
    vt_WW_SSO_Lisa,
    BasinUnique_Raingage,
    Excursion_Category,
    Refresh_DateTime,
  };

  /* ── window.MEASURES ────────────────────────────────────────── */
  window.MEASURES = {

    filter(data, filters = {}) {
      let d = data;
      if (filters.gage)          d = d.filter(r => r.Gage === +filters.gage || r.Gage === filters.gage);
      if (filters.gages)         d = d.filter(r => filters.gages.includes(r.Gage));
      if (filters.startDate)     d = d.filter(r => r.Date >= filters.startDate);
      if (filters.endDate)       d = d.filter(r => r.Date <= filters.endDate);
      if (filters.eventCategory) d = d.filter(r => r.Event_Category === filters.eventCategory);
      if (filters.yearMon)       d = d.filter(r => r.Year_Mon === filters.yearMon);
      if (filters.year)          d = d.filter(r => r.Year === +filters.year);
      if (filters.basin) {
        const bu = (window.MOCK.BasinUnique_Raingage || []).find(b => b.METERBASIN === filters.basin);
        if (bu) d = d.filter(r => r.Gage === bu.RAINGAGEID);
      }
      return d;
    },

    totalDailyRainfall(data, filters) {
      return this.filter(data, filters).reduce((s, r) => s + (r.rain || 0), 0);
    },

    totalWeeklyRainfall(data, filters) {
      return this.filter(data, filters).reduce((s, r) => s + (r.rain || 0), 0);
    },

    weekClassification(data, filters) {
      const total = this.totalWeeklyRainfall(data, filters);
      if (total === 0)  return 'ZeroRain';
      if (total < 1)    return 'Minor';
      return 'Rainy';
    },

    rainfallPreviousDay(data, filters) {
      return this.filter(data, filters).reduce((s, r) => s + (r.Rain_PreviousDay || 0), 0);
    },

    distinctCountRecord(data, filters) {
      const filtered = this.filter(data, filters);
      return new Set(filtered.map(r => r.DateGage)).size;
    },

    countRecord(data, filters) {
      return this.filter(data, filters).length;
    },

    dynamicTitle(gage) {
      return gage ? `Raingage ${gage}` : 'All Raingages';
    },

    dynamicTitleRainClass(category) {
      return category ? `Count of days for Category, ${category}` : 'Count of days by Rainfall Category';
    },

    // Count of days per category per year-month (for RainClass Trends)
    countDaysByCategory(data, filters, category) {
      const filtered = this.filter(data, filters).filter(r => r.Event_Category === category);
      // Group by Date+Gage → Date, then count distinct dates
      return new Set(filtered.map(r => r.Date)).size;
    },

    // Summarize by year-month: { yearMon, category, count }
    rainClassByMonth(data, filters) {
      const filtered = this.filter(data, filters);
      const map = {};
      for (const r of filtered) {
        const key = `${r.Year_Mon}||${r.Event_Category}`;
        if (!map[key]) map[key] = { yearMon: r.Year_Mon, category: r.Event_Category, count: 0 };
        map[key].count++;
      }
      return Object.values(map).sort((a,b) => a.yearMon.localeCompare(b.yearMon));
    },

    // Heatmap data: { date, gage, rain, category } sorted by date desc
    heatmapData(data, filters) {
      return this.filter(data, filters)
        .sort((a, b) => b.Date.localeCompare(a.Date));
    },
  };

  console.log('[mockData] Ready —',
    window.MOCK.Realtime_rainfall_hcfcd_daily.length, 'rainfall rows,',
    window.MOCK.vt_WW_SSO_Lisa.length, 'SSO events,',
    window.MOCK.RainGauge_HCFCD.length, 'gages'
  );
})();
