/* ============================================================
   popup.js — Popups dark glass au clic sur un datacenter
   ============================================================ */

let currentPopup = null;

const STRESS_LABELS = {
  'low':            { label: 'Faible',        cls: '' },
  'low-medium':     { label: 'Faible–Moyen',  cls: '' },
  'medium-high':    { label: 'Moyen–Élevé',   cls: '' },
  'high':           { label: 'Élevé',         cls: 'high' },
  'extremely-high': { label: 'Critique',      cls: 'extreme' },
  'arid':           { label: 'Aride',         cls: 'high' },
  'unknown':        { label: 'Inconnu',       cls: '' },
};

function formatNum(val, decimals = 0) {
  if (val == null) return '—';
  return Number(val).toLocaleString('fr-FR', { maximumFractionDigits: decimals });
}

function carbonColorClass(carbonVal) {
  if (!carbonVal) return 'm-pue';
  if (carbonVal <= 100) return 'm-pue';    // vert
  if (carbonVal <= 250) return 'm-water';  // cyan
  if (carbonVal <= 400) return 'm-power';  // ambre
  if (carbonVal <= 600) return 'm-co2';    // orange
  return 'm-co2';                          // rouge
}

function showPopup(feature, point) {
  closePopup();
  console.log('Popup data:', feature.properties);
  const p = feature.properties;
  const container = document.getElementById('popup-container');

  const popup = document.createElement('div');
  popup.className = 'dc-popup';
  popup.id = 'dc-popup';

  // Position initiale
  positionPopup(popup, point);

  // === HEADER ===
  const header = document.createElement('div');
  header.className = 'popup-header';

  const operatorEl = document.createElement('div');
  operatorEl.className = 'popup-operator';
  operatorEl.textContent = (p.operator || 'Opérateur inconnu').toUpperCase();

  const nameEl = document.createElement('div');
  nameEl.className = 'popup-name';
  nameEl.textContent = p.name || 'Datacenter';

  const locationEl = document.createElement('div');
  locationEl.className = 'popup-location';
  const locParts = [p.city, p.country].filter(Boolean).join(' · ');
  locationEl.textContent = locParts ? ('📍 ' + locParts) : '';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'popup-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Fermer');
  closeBtn.addEventListener('click', closePopup);

  header.appendChild(operatorEl);
  header.appendChild(nameEl);
  if (locParts) header.appendChild(locationEl);
  header.appendChild(closeBtn);

  // === BODY ===
  const body = document.createElement('div');
  body.className = 'popup-body';

  // Métriques 4 cases
  const metrics = document.createElement('div');
  metrics.className = 'popup-metrics';

  const co2Val = p.co2_annual_tonnes
    ? (p.co2_annual_tonnes >= 1000
        ? formatNum(p.co2_annual_tonnes / 1000, 1) + 'k'
        : formatNum(p.co2_annual_tonnes))
    : '—';

  const waterVal = p.water_withdrawal_m3_year
    ? (p.water_withdrawal_m3_year >= 1000000
        ? formatNum(p.water_withdrawal_m3_year / 1000000, 1) + 'M'
        : formatNum(p.water_withdrawal_m3_year / 1000, 0) + 'k')
    : '—';

  // Calcul équivalences
  const co2Equiv  = typeof getCO2Equivalence  === 'function' ? getCO2Equivalence(p.co2_annual_tonnes)           : null;
  const waterEquiv = typeof getWaterEquivalence === 'function' ? getWaterEquivalence(p.water_withdrawal_m3_year) : null;

  const metricData = [
    { val: p.co2_annual_tonnes ? co2Val : '—', unit: 't CO₂/an', label: 'ÉMISSIONS', cls: 'm-co2', equiv: co2Equiv },
    { val: waterVal, unit: 'm³/an', label: 'CONSOMM. EAU', cls: 'm-water', equiv: waterEquiv },
    { val: p.capacity_mw ? formatNum(p.capacity_mw, 0) + ' MW' : '—', unit: '', label: 'CAPACITÉ', cls: 'm-power', equiv: null },
    { val: p.pue ? Number(p.pue).toFixed(2) : '—', unit: 'PUE', label: 'EFFICACITÉ', cls: 'm-pue', equiv: null },
  ];

  metricData.forEach(({ val, unit, label, cls, equiv }) => {
    const card = document.createElement('div');
    card.className = 'metric-card';

    const valEl = document.createElement('div');
    valEl.className = 'metric-value ' + cls;
    valEl.textContent = val;

    const unitEl = document.createElement('div');
    unitEl.className = 'metric-unit';
    unitEl.textContent = unit;

    const labelEl = document.createElement('div');
    labelEl.className = 'metric-label';
    labelEl.textContent = label;

    card.appendChild(valEl);
    if (unit) card.appendChild(unitEl);
    card.appendChild(labelEl);

    if (equiv) {
      const equivEl = document.createElement('div');
      equivEl.className = 'metric-equiv';
      equivEl.title = equiv.text;
      equivEl.textContent = equiv.icon + ' ' + equiv.shortText;
      card.appendChild(equivEl);
    }

    metrics.appendChild(card);
  });

  // === CONSOMMATION ANNUELLE → FOYERS ===
  const annualKwh = p.capacity_mw && p.pue
    ? p.capacity_mw * p.pue * 8760 * 1000
    : (p.capacity_mw ? p.capacity_mw * 1.58 * 8760 * 1000 : null);
  const foyersEquiv = annualKwh ? getEnergyFoyersEquivalence(annualKwh) : null;
  const co2InhabEquiv = p.co2_annual_tonnes ? getCO2InhabitantsEquivalence(p.co2_annual_tonnes) : null;

  if (foyersEquiv || co2InhabEquiv) {
    const factsRow = document.createElement('div');
    factsRow.className = 'popup-facts';

    if (foyersEquiv) {
      const f = document.createElement('div');
      f.className = 'popup-fact';
      const icon = document.createElement('span');
      icon.className = 'popup-fact-icon';
      icon.textContent = foyersEquiv.icon;
      const txt = document.createElement('span');
      const bold = document.createElement('strong');
      bold.textContent = foyersEquiv.shortText.replace('≈ ', '');
      txt.append('Ce DC consomme autant que ', bold);
      f.append(icon, txt);
      factsRow.appendChild(f);
    }
    if (co2InhabEquiv) {
      const f = document.createElement('div');
      f.className = 'popup-fact';
      const icon = document.createElement('span');
      icon.className = 'popup-fact-icon';
      icon.textContent = co2InhabEquiv.icon;
      const txt = document.createElement('span');
      const bold = document.createElement('strong');
      bold.textContent = co2InhabEquiv.shortText.replace('≈ ', '');
      txt.append('Émissions = ', bold);
      f.append(icon, txt);
      factsRow.appendChild(f);
    }
    body.appendChild(factsRow);
  }

  body.appendChild(metrics);

  // === MIX ÉNERGÉTIQUE : RÉALITÉ VS ENGAGEMENT ===
  const hasGrid = p.grid_renewable_pct != null;
  const hasOp   = p.energy_source_pct_renewable != null;

  if (hasGrid || hasOp || p.carbon_intensity_gco2_kwh != null) {
    const energySection = document.createElement('div');
    energySection.className = 'popup-energy-section';

    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'popup-section-title';
    sectionTitle.textContent = 'MIX ÉNERGÉTIQUE';
    energySection.appendChild(sectionTitle);

    if (hasGrid) {
      const bar = createBar(
        '⚡ Mix réseau réel (' + (p.country || '') + ')',
        p.grid_renewable_pct.toFixed(1) + '%',
        p.grid_renewable_pct, 100, 'bar-green'
      );
      bar.title = 'Source : Our World in Data — mix électrique réel du réseau national';
      energySection.appendChild(bar);
    }

    if (hasOp) {
      const isInflated = hasGrid && (p.energy_source_pct_renewable - p.grid_renewable_pct) > 30;
      const bar = createBar(
        (p.operator || 'Opérateur') + ' — déclaré',
        p.energy_source_pct_renewable + '%',
        p.energy_source_pct_renewable, 100,
        isInflated ? 'bar-claim' : 'bar-green'
      );
      bar.title = 'Source : rapport RSE opérateur. Peut inclure des certificats REC/PPA.';
      energySection.appendChild(bar);

      if (isInflated) {
        const gap = document.createElement('div');
        gap.className = 'popup-gap-alert';
        gap.textContent = '⚠ Écart de ' + Math.round(p.energy_source_pct_renewable - p.grid_renewable_pct)
          + ' pts avec le réseau réel — compensé par achats REC/PPA';
        energySection.appendChild(gap);
      }
    }

    // Mini-graphique mix par source
    let mix = null;
    try { mix = p.grid_mix ? JSON.parse(p.grid_mix) : null; } catch(e) {}
    if (mix) {
      energySection.appendChild(createMixChart(mix, p.country));
    } else {
      // Fallback : barres séparées si pas de mix détaillé
      if (p.grid_low_carbon_pct != null && p.grid_low_carbon_pct > (p.grid_renewable_pct || 0) + 5) {
        energySection.appendChild(createBar(
          '⚛ Bas-carbone (+ nucléaire)',
          p.grid_low_carbon_pct.toFixed(1) + '%',
          p.grid_low_carbon_pct, 100, 'bar-lowcarbon'
        ));
      }
    }

    if (p.carbon_intensity_gco2_kwh != null) {
      energySection.appendChild(createBar(
        '☁ Intensité carbone réseau',
        p.carbon_intensity_gco2_kwh + ' gCO₂/kWh',
        p.carbon_intensity_gco2_kwh, 900, 'bar-carbon'
      ));
    }

    body.appendChild(energySection);
  }

  // === TAGS ===
  const tags = document.createElement('div');
  tags.className = 'popup-tags';

  const qualityTag = document.createElement('span');
  qualityTag.className = p.data_quality === 'verified' ? 'tag tag-verified' : 'tag tag-estimated';
  qualityTag.textContent = p.data_quality === 'verified' ? '✓ VÉRIFIÉ ESG' : '~ ESTIMÉ';
  tags.appendChild(qualityTag);

  const stressInfo = STRESS_LABELS[p.water_stress_level] || STRESS_LABELS['unknown'];
  if (p.water_stress_level && p.water_stress_level !== 'unknown') {
    const stressTag = document.createElement('span');
    stressTag.className = 'tag tag-stress ' + stressInfo.cls;
    stressTag.textContent = '💧 Stress ' + stressInfo.label;
    tags.appendChild(stressTag);
  }

  if (p.operator_commitment_net_zero) {
    const netTag = document.createElement('span');
    netTag.className = 'tag tag-verified';
    netTag.textContent = 'NET ZERO ' + p.operator_commitment_net_zero;
    tags.appendChild(netTag);
  }

  body.appendChild(tags);

  popup.appendChild(header);
  popup.appendChild(body);
  container.appendChild(popup);

  currentPopup = popup;

  // Repositionner si hors écran
  requestAnimationFrame(() => {
    adjustPopupPosition(popup, point);
    makeDraggable(popup, header);
  });
}

// Config visuelle par source d'énergie
const MIX_SOURCE_CONFIG = {
  nuclear:   { label: 'Nucléaire',    color: '#a78bfa', icon: '⚛' },
  hydro:     { label: 'Hydro',        color: '#38bdf8', icon: '💧' },
  wind:      { label: 'Éolien',       color: '#4ade80', icon: '🌬' },
  solar:     { label: 'Solaire',      color: '#fbbf24', icon: '☀' },
  biofuel:   { label: 'Biomasse',     color: '#86efac', icon: '🌿' },
  other_ren: { label: 'Autre ren.',   color: '#34d399', icon: '♻' },
  gas:       { label: 'Gaz',          color: '#fb923c', icon: '🔥' },
  coal:      { label: 'Charbon',      color: '#94a3b8', icon: '⬛' },
  oil:       { label: 'Pétrole',      color: '#f87171', icon: '🛢' },
};

function createMixChart(mix, country) {
  const wrap = document.createElement('div');
  wrap.className = 'mix-chart';

  const year = mix._year ? (' · ' + mix._year) : '';
  const title = document.createElement('div');
  title.className = 'mix-chart-title';
  title.textContent = 'Mix électrique ' + (country || '') + year + ' (source OWID)';
  wrap.appendChild(title);

  // Barre empilée
  const stackWrap = document.createElement('div');
  stackWrap.className = 'mix-stack';

  const sources = Object.entries(MIX_SOURCE_CONFIG);
  sources.forEach(([key, cfg]) => {
    const pct = mix[key];
    if (!pct || pct < 0.5) return;
    const seg = document.createElement('div');
    seg.className = 'mix-segment';
    seg.style.width = Math.min(pct, 100) + '%';
    seg.style.background = cfg.color;
    seg.title = cfg.icon + ' ' + cfg.label + ' : ' + pct.toFixed(1) + '%';
    stackWrap.appendChild(seg);
  });
  wrap.appendChild(stackWrap);

  // Légende compacte (seulement les sources > 1%)
  const legend = document.createElement('div');
  legend.className = 'mix-legend';

  // Trier du plus grand au plus petit
  const sorted = sources
    .map(([key, cfg]) => ({ key, cfg, pct: mix[key] || 0 }))
    .filter(d => d.pct >= 1)
    .sort((a, b) => b.pct - a.pct);

  sorted.forEach(({ cfg, pct }) => {
    const item = document.createElement('span');
    item.className = 'mix-legend-item';
    const dot = document.createElement('span');
    dot.className = 'mix-dot';
    dot.style.background = cfg.color;
    const txt = document.createElement('span');
    txt.textContent = cfg.label + ' ' + pct.toFixed(0) + '%';
    item.append(dot, txt);
    legend.appendChild(item);
  });

  wrap.appendChild(legend);
  return wrap;
}

function createBar(labelText, valueText, value, max, colorClass) {
  const row = document.createElement('div');
  row.className = 'bar-row';

  const labelRow = document.createElement('div');
  labelRow.className = 'bar-label-row';

  const lbl = document.createElement('span');
  lbl.textContent = labelText;

  const val = document.createElement('span');
  val.textContent = valueText;

  labelRow.appendChild(lbl);
  labelRow.appendChild(val);

  const track = document.createElement('div');
  track.className = 'bar-track';

  const fill = document.createElement('div');
  fill.className = 'bar-fill ' + colorClass;
  fill.style.width = '0%';

  track.appendChild(fill);
  row.appendChild(labelRow);
  row.appendChild(track);

  // Animation différée
  setTimeout(() => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    fill.style.width = pct + '%';
  }, 50);

  return row;
}

function makeDraggable(popup, handle) {
  let startX, startY, startLeft, startTop;

  handle.addEventListener('mousedown', e => {
    if (e.target.classList.contains('popup-close')) return;
    e.preventDefault();
    const rect = popup.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    popup.classList.add('is-dragging');

    function onMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pw = popup.offsetWidth;
      const ph = popup.offsetHeight;
      const newLeft = Math.max(0, Math.min(vw - pw, startLeft + dx));
      const newTop  = Math.max(0, Math.min(vh - ph, startTop  + dy));
      popup.style.left = newLeft + 'px';
      popup.style.top  = newTop  + 'px';
    }

    function onUp() {
      popup.classList.remove('is-dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function positionPopup(popup, point) {
  popup.style.position = 'fixed';
  popup.style.left = (point.x + 16) + 'px';
  popup.style.top  = (point.y - 20) + 'px';
}

function adjustPopupPosition(popup, point) {
  const rect = popup.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;

  let left = point.x + 16;
  let top  = point.y - 20;

  // Débordement à droite → placer à gauche du point
  if (left + rect.width + margin > vw) {
    left = point.x - rect.width - 16;
  }
  // Débordement en bas
  if (top + rect.height + margin > vh) {
    top = vh - rect.height - margin;
  }
  // Minimum en haut
  if (top < 70) top = 70;
  // Minimum à gauche (éviter le panel)
  if (left < 295) left = 295;

  popup.style.left = left + 'px';
  popup.style.top  = top + 'px';
}

function closePopup() {
  if (currentPopup) {
    currentPopup.remove();
    currentPopup = null;
  }
}
