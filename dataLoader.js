/**
 * dataLoader.js — RainWise Real Data Loader
 *
 * Reads window.DIMS (from data/dims.js) and window.RAIN_YYYY (from data/rain_YYYY.js)
 * and assembles window.MOCK in the same schema as mockData.js so all pages work unchanged.
 *
 * Load order in HTML:
 *   data/dims.js → data/rain_2015.js … data/rain_2026.js → dataLoader.js → components.js
 */
(function () {

  /* ── Derived-field helpers ─────────────────────────────────────── */
  function rainCategory(r) {
    if (r === 0)  return 'Zero Rain';
    if (r < 0.3)  return '<0.3 in';
    if (r < 1.0)  return '0.3-1.0 in';
    if (r < 3.0)  return '1.0-3.0 in';
    if (r < 5.0)  return '3.0-5.0 in';
    return 'Over 5.0 in';
  }

  // DateCorrected = Date - 1 day (model off-by-one; Month/Weeknum use this)
  function dateCorrected(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function isoWeekNum(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const start = new Date(jan4);
    start.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
    return String(Math.floor((d - start) / 604800000) + 1).padStart(2, '0');
  }

  /* ── Merge year chunks ────────────────────────────────────────── */
  const YEARS = [2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];
  const rainfall = [];

  for (const yr of YEARS) {
    const chunk = window['RAIN_' + yr];
    if (!chunk) continue;
    for (const row of chunk) {
      // row = [Date, Gage, rain, Rain_PreviousDay, Rain_SSO_PrevDay]
      const date = row[0];
      const gage = row[1];
      const rain = row[2];
      const prev = row[3];
      const sso2 = row[4];
      const dc   = dateCorrected(date);
      const dcD  = new Date(dc + 'T00:00:00');
      rainfall.push({
        Date:              date,
        Gage:              gage,
        rain:              rain,
        Gage_txt:          String(gage),
        Event_Category:    rainCategory(rain),
        Year:              dcD.getFullYear(),
        Month:             dcD.getMonth() + 1,
        Weeknum:           isoWeekNum(dc),
        Year_Mon:          dc.slice(0, 7),
        Year_Wk:           dc.slice(0, 4) + '-' + isoWeekNum(dc),
        DateGage:          date + String(gage),
        DateCorrected:     dc,
        Rain_PreviousDay:  prev,
        Rain_SSO_PrevDay:  sso2,
      });
    }
  }

  /* ── Assemble window.MOCK ─────────────────────────────────────── */
  const dims = window.DIMS || {};

  const now = new Date();
  window.MOCK = {
    RainGauge_HCFCD:               dims.RainGauge_HCFCD      || [],
    Realtime_rainfall_hcfcd_daily:  rainfall,
    vt_WW_SSO_Lisa:                 dims.vt_WW_SSO_Lisa       || [],
    BasinUnique_Raingage:           dims.BasinUnique_Raingage  || [],
    MeterBasin_RainGauge:           dims.MeterBasin_RainGauge  || [],
    Excursion_Category:             dims.Excursion_Category   || [],
    Refresh_DateTime: {
      DateTime: now.toISOString().slice(0, 19).replace('T', ' '),
      Date:     now.toISOString().slice(0, 10),
      Time:     now.toISOString().slice(11, 19),
    },
  };

  console.log(
    '[dataLoader] Ready —',
    rainfall.length.toLocaleString(), 'rainfall rows |',
    (dims.vt_WW_SSO_Lisa || []).length, 'SSO events |',
    (dims.RainGauge_HCFCD || []).length, 'gages'
  );

})();
