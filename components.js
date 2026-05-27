/**
 * components.js — RainWise Shared Rendering Library
 * Requires: Chart.js 4.4.0 (CDN), styles.css, mockData.js
 */
(function () {

  /* ── Color constants ──────────────────────────────────────────── */
  const COLORS = {
    blue:    '#5da8ff',
    teal:    '#41b9a8',
    amber:   '#e6a52e',
    orange:  '#d46b2d',
    red:     '#cf4336',
    grey:    '#4a5568',
    darkRed: '#742a2a',
    gold:    '#d9b300',
    purple:  '#744ec2',
  };

  // Rainfall category → color mapping (dark-theme friendly)
  // Colors match PBI conditional formatting exactly (layout.json backColor rules)
  // 'Over 5.0 in' adapted from PBI's #000000 (invisible on dark bg) → deep crimson
  const RAIN_COLORS = {
    'Zero Rain':   '#1a2a3a',   // near-bg (blends into dark panel like PBI's white-on-white)
    '<0.3 in':     '#fbe99c',   // PBI pale yellow
    '0.3-1.0 in':  '#6ed7f7',   // PBI light blue
    '1.0-3.0 in':  '#e77946',   // PBI orange
    '3.0-5.0 in':  '#f5403b',   // PBI red
    'Over 5.0 in': '#b0001e',   // PBI black → deep crimson for dark bg
  };

  const RAIN_CATEGORIES = [
    'Zero Rain', '<0.3 in', '0.3-1.0 in', '1.0-3.0 in', '3.0-5.0 in', 'Over 5.0 in',
  ];

  const GAGE_COLORS = [
    '#5da8ff','#41b9a8','#e6a52e','#d46b2d','#cf4336','#744ec2',
    '#d9b300','#1aab40','#15c6f4','#4092ff','#ffa058','#be5dc9',
  ];

  /* ── Chart.js dark theme defaults ────────────────────────────── */
  function applyChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#b4c0d0';
    Chart.defaults.borderColor = 'rgba(139,175,214,0.18)';
    Chart.defaults.font.family = "'Segoe UI', Arial, sans-serif";
    Chart.defaults.font.size = 13;
    Chart.defaults.plugins.legend.labels.color = '#b4c0d0';
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(16,32,50,0.94)';
    Chart.defaults.plugins.tooltip.titleColor = '#f1f5fb';
    Chart.defaults.plugins.tooltip.bodyColor = '#b4c0d0';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(139,175,214,0.28)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
  }

  /* ── initPageScale — scales 1280px canvas to viewport ────────── */
  function initPageScale() {
    function scale() {
      const canvas = document.querySelector('.pbi-canvas');
      if (!canvas) return;
      const vw = window.innerWidth;
      const ratio = Math.min(1, (vw - 20) / 1280);
      canvas.style.transform = `scale(${ratio})`;
      canvas.style.transformOrigin = 'top left';
      document.body.style.height = (720 * ratio) + 'px';
    }
    scale();
    window.addEventListener('resize', scale);
  }

  /* ── makeTopBar ──────────────────────────────────────────────── */
  function makeTopBar(el, { title, subtitle = '', backHref = '../index.html' }) {
    el.innerHTML = `
      <div class="topbar" style="background:linear-gradient(90deg,#1a3a5c,#0e2035);padding:10px 18px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <a href="${backHref}" style="color:#5da8ff;text-decoration:none;font-size:22px;line-height:1;">&#8592;</a>
          <div>
            <div style="font-size:15px;font-weight:700;color:#f1f5fb;">${title}</div>
            ${subtitle ? `<div style="font-size:12px;color:#b4c0d0;margin-top:2px;">${subtitle}</div>` : ''}
          </div>
        </div>
        <div style="font-size:12px;color:#b4c0d0;">
          Last Update: ${window.MOCK?.Refresh_DateTime?.Date || '—'}
        </div>
      </div>`;
  }

  /* ── renderKPICard ───────────────────────────────────────────── */
  function renderKPICard(el, { label, value, unit = '', accentClass = 'accent-teal', subtext = '' }) {
    el.className = `kpi-card ${accentClass}`;
    el.innerHTML = `
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}${unit ? `<span style="font-size:16px;font-weight:400;margin-left:4px;color:var(--muted)">${unit}</span>` : ''}</div>
      ${subtext ? `<div style="margin-top:6px;font-size:12px;color:var(--muted)">${subtext}</div>` : ''}`;
  }

  /* ── renderSlicer ────────────────────────────────────────────── */
  function renderSlicer(el, { label, options, value, onChange }) {
    el.innerHTML = `
      <div style="padding:4px 6px;">
        <div style="font-size:10px;color:var(--muted);font-weight:600;margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em;">${label}</div>
        <select class="select-field" style="height:32px;font-size:12px;padding:0 8px;">
          <option value="">All</option>
          ${options.map(o => `<option value="${o}" ${o == value ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>`;
    el.querySelector('select').addEventListener('change', e => onChange && onChange(e.target.value));
  }

  /* ── renderBarChart ──────────────────────────────────────────── */
  function renderBarChart(canvas, { labels, datasets, yLabel = '', title = '' }) {
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: datasets.map((ds, i) => ({
        backgroundColor: ds.color || GAGE_COLORS[i % GAGE_COLORS.length],
        borderRadius: 3,
        ...ds,
      }))},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1 }, title: { display: !!title, text: title, color: '#f1f5fb', font: { size: 13, weight: '700' } } },
        scales: {
          x: { grid: { color: 'rgba(139,175,214,0.1)' }, ticks: { maxRotation: 45, font: { size: 11 } } },
          y: { grid: { color: 'rgba(139,175,214,0.1)' }, ticks: { font: { size: 11 } }, title: { display: !!yLabel, text: yLabel, color: '#b4c0d0' } },
        },
      },
    });
    canvas._chart = chart;
    return chart;
  }

  /* ── renderLineChart ─────────────────────────────────────────── */
  function renderLineChart(canvas, { labels, datasets, yLabel = '', title = '' }) {
    if (canvas._chart) canvas._chart.destroy();
    const chart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets: datasets.map((ds, i) => ({
        borderColor: ds.color || GAGE_COLORS[i % GAGE_COLORS.length],
        backgroundColor: 'transparent',
        tension: 0.35, pointRadius: 3, borderWidth: 2,
        ...ds,
      }))},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1 }, title: { display: !!title, text: title, color: '#f1f5fb', font: { size: 13, weight: '700' } } },
        scales: {
          x: { grid: { color: 'rgba(139,175,214,0.1)' } },
          y: { grid: { color: 'rgba(139,175,214,0.1)' }, title: { display: !!yLabel, text: yLabel, color: '#b4c0d0' } },
        },
      },
    });
    canvas._chart = chart;
    return chart;
  }

  /* ── renderDataTable ─────────────────────────────────────────── */
  function renderDataTable(el, { columns, rows, maxHeight = 620, colorRowFn = null }) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.style.maxHeight = maxHeight + 'px';
    wrap.style.overflowY = 'auto';
    wrap.innerHTML = `
      <table>
        <thead><tr>${columns.map(c => `<th>${c.label}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map(row => {
            const cls = colorRowFn ? colorRowFn(row) : '';
            return `<tr class="${cls}">${columns.map(c => {
              let val = row[c.key] ?? '—';
              if (c.format) val = c.format(val, row);
              return `<td>${val}</td>`;
            }).join('')}</tr>`;
          }).join('')}
        </tbody>
      </table>`;
    el.innerHTML = '';
    el.appendChild(wrap);
  }

  /* ── renderHeatMap ─────────────────────────────────────────────
   * Renders a date × gage matrix with color-coded cells by rain amount.
   * Used for Near Realtime Daily Rainfall and Weekly Rainfall pages.
   * ─────────────────────────────────────────────────────────────── */
  function renderHeatMap(el, { data, gages, maxDays = 60, showValues = true }) {
    if (!data || !data.length) { el.innerHTML = '<div class="empty-state">No data</div>'; return; }

    // Get sorted unique dates (most recent first, limited to maxDays)
    const allDates = [...new Set(data.map(r => r.Date))].sort((a,b) => b.localeCompare(a)).slice(0, maxDays);
    const displayGages = gages || [...new Set(data.map(r => r.Gage))].sort((a,b) => a-b);

    // Build lookup: date+gage → row
    const lookup = {};
    for (const r of data) lookup[r.Date + '|' + r.Gage] = r;

    const CELL_W = Math.max(36, Math.floor((el.offsetWidth - 60) / displayGages.length));
    const CELL_H = 18;

    let html = `
      <div style="overflow:auto;height:100%;font-size:11px;">
        <table style="border-collapse:collapse;white-space:nowrap;">
          <thead>
            <tr>
              <th style="position:sticky;left:0;z-index:2;background:#162436;padding:3px 6px;min-width:70px;text-align:left;color:#b4c0d0;font-size:11px;">Date</th>
              ${displayGages.map(g => `<th style="padding:2px 3px;min-width:${CELL_W}px;text-align:center;color:#b4c0d0;font-size:10px;">${g}</th>`).join('')}
            </tr>
          </thead>
          <tbody>`;

    for (const date of allDates) {
      html += `<tr>
        <td style="position:sticky;left:0;background:#162436;padding:2px 6px;color:#b4c0d0;font-weight:600;font-size:10px;border-bottom:1px solid rgba(139,175,214,0.08);">${date}</td>`;
      for (const g of displayGages) {
        const row = lookup[date + '|' + g];
        const rain = row ? row.rain : null;
        const cat  = row ? row.Event_Category : null;
        const bg   = cat ? RAIN_COLORS[cat] : '#1a2a3a';
        const textColor = rain && rain >= 1.0 ? '#fff' : (rain === 0 || rain === null ? '#4a5568' : '#e8f2ee');
        const display = rain !== null ? (rain === 0 ? '·' : rain.toFixed(2)) : '';
        html += `<td style="background:${bg};color:${textColor};text-align:center;padding:1px 2px;height:${CELL_H}px;border:1px solid rgba(0,0,0,0.15);font-size:9px;" title="${cat || 'No data'}: ${rain !== null ? rain + ' in' : 'N/A'}">${showValues ? display : ''}</td>`;
      }
      html += '</tr>';
    }

    html += `</tbody></table></div>`;

    // Legend
    html += `<div style="display:flex;gap:10px;padding:6px 4px;flex-wrap:wrap;">
      ${RAIN_CATEGORIES.map(c => `<span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#b4c0d0;">
        <span style="display:inline-block;width:12px;height:12px;background:${RAIN_COLORS[c]};border-radius:2px;"></span>${c}
      </span>`).join('')}
    </div>`;

    el.innerHTML = html;
  }

  /* ── eventCategoryColor ──────────────────────────────────────── */
  function eventCategoryColor(cat) {
    return RAIN_COLORS[cat] || '#3d4f61';
  }

  /* ── Expose window.Components ─────────────────────────────────── */
  window.Components = {
    COLORS,
    RAIN_COLORS,
    RAIN_CATEGORIES,
    GAGE_COLORS,
    applyChartDefaults,
    initPageScale,
    makeTopBar,
    renderKPICard,
    renderSlicer,
    renderBarChart,
    renderLineChart,
    renderDataTable,
    renderHeatMap,
    eventCategoryColor,
  };

  console.log('[components] Ready');
})();
