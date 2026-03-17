/* ============================================================
   region-popup.js — Popup enrichie au clic sur une bulle région
   ============================================================ */

let currentRegionPopup = null;

function formatRegionNum(val, decimals = 0) {
  if (val == null || val === 0) return '—';
  return Number(val).toLocaleString('fr-FR', { maximumFractionDigits: decimals });
}

// Formate le CO2 en choisissant l'unité (Mt / kt / t) selon la valeur en Mt
function formatCO2Adaptive(co2_mt) {
  if (!co2_mt || co2_mt === 0) return { val: '—', unit: 'CO₂/an' };
  if (co2_mt >= 1) {
    return { val: co2_mt.toFixed(1), unit: 'Mt CO₂/an' };
  }
  const kt = co2_mt * 1000;
  if (kt >= 1) {
    return { val: kt.toFixed(1), unit: 'kt CO₂/an' };
  }
  const t = co2_mt * 1_000_000;
  return { val: Math.round(t).toLocaleString('fr-FR'), unit: 't CO₂/an' };
}

// Formate l'eau en choisissant l'unité (km³ / Mm³ / km³ précis) selon la valeur en km³
function formatWaterAdaptive(water_km3) {
  if (!water_km3 || water_km3 === 0) return { val: '—', unit: 'eau/an' };
  if (water_km3 >= 1) {
    return { val: water_km3.toFixed(2), unit: 'km³/an' };
  }
  const mm3 = water_km3 * 1000;
  if (mm3 >= 1) {
    return { val: mm3.toFixed(1), unit: 'Mm³/an' };
  }
  const m3 = water_km3 * 1_000_000_000;
  return { val: Math.round(m3).toLocaleString('fr-FR'), unit: 'm³/an' };
}

function formatLargeNum(val) {
  if (!val || val === 0) return '—';
  if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(1) + 'G';
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + 'M';
  if (val >= 1_000) return Math.round(val / 1000) + 'k';
  return Math.round(val).toString();
}

function showRegionPopup(feature, point) {
  closeRegionPopup();
  const p = feature.properties;
  const container = document.getElementById('popup-container');

  const popup = document.createElement('div');
  popup.className = 'dc-popup region-popup';
  popup.id = 'region-popup';

  // Position initiale
  popup.style.position = 'fixed';
  popup.style.left = (point.x + 16) + 'px';
  popup.style.top  = (point.y - 20) + 'px';

  // ── HEADER ──
  const header = document.createElement('div');
  header.className = 'popup-header';

  const regionLabel = document.createElement('div');
  regionLabel.className = 'popup-operator';
  regionLabel.textContent = 'RÉGION';

  const nameEl = document.createElement('div');
  nameEl.className = 'popup-name';
  nameEl.textContent = p.label || p.region_id;

  const metaEl = document.createElement('div');
  metaEl.className = 'popup-location';
  metaEl.textContent = `${formatRegionNum(p.count)} datacenters · ${formatRegionNum(p.countries)} pays`;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'popup-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Fermer');
  closeBtn.addEventListener('click', closeRegionPopup);

  header.appendChild(regionLabel);
  header.appendChild(nameEl);
  header.appendChild(metaEl);
  header.appendChild(closeBtn);

  // ── BODY ──
  const body = document.createElement('div');
  body.className = 'popup-body';

  // Métriques 2×2
  const metrics = document.createElement('div');
  metrics.className = 'popup-metrics';

  // CO2 avec équivalence
  const co2Equiv = getCO2Equivalence(p.co2_mt * 1_000_000); // Mt → tonnes
  const co2Fmt = formatCO2Adaptive(p.co2_mt);
  const co2Card = createRegionMetricCard(
    co2Fmt.val,
    co2Fmt.unit,
    'ÉMISSIONS',
    'm-co2',
    co2Equiv
  );

  // Eau avec équivalence
  const waterEquiv = getWaterEquivalence(p.water_km3 * 1_000_000_000); // km³ → m³
  const waterFmt = formatWaterAdaptive(p.water_km3);
  const waterCard = createRegionMetricCard(
    waterFmt.val,
    waterFmt.unit,
    'CONSOMM. EAU',
    'm-water',
    waterEquiv
  );

  // PUE moyen
  const pueCard = createRegionMetricCard(
    p.avg_pue ? Number(p.avg_pue).toFixed(2) : '—',
    'PUE',
    'EFFICACITÉ MOY.',
    'm-pue',
    null
  );

  // % trafic mondial
  const trafficCard = createRegionMetricCard(
    p.pct_global_capacity ? Number(p.pct_global_capacity).toFixed(1) + '%' : '—',
    'capacité mondiale',
    'PART MONDIALE',
    'm-power',
    null
  );

  metrics.appendChild(co2Card);
  metrics.appendChild(waterCard);
  metrics.appendChild(pueCard);
  metrics.appendChild(trafficCard);

  // ── SÉPARATEUR LLM ──
  const divider = document.createElement('div');
  divider.className = 'region-llm-divider';
  divider.textContent = 'IMPACT REQUÊTES LLM';

  // ── BLOC LLM ──
  const llmBlock = document.createElement('div');
  llmBlock.className = 'region-llm-block';

  // Calcul équivalences LLM
  const llmCO2gco2 = p.llm_co2_per_query_gco2;
  const llmCO2Equiv = (typeof getLLMCO2Equivalence === 'function' && llmCO2gco2)
    ? getLLMCO2Equivalence(llmCO2gco2) : null;

  // Énergie totale annuelle → foyers
  const regionKwhYear = p.total_capacity_mw
    ? p.total_capacity_mw * (p.avg_pue || 1.58) * 8760 * 1000 : null;
  const foyersEquiv = (typeof getEnergyFoyersEquivalence === 'function' && regionKwhYear)
    ? getEnergyFoyersEquivalence(regionKwhYear) : null;
  const co2InhabEquiv = (typeof getCO2InhabitantsEquivalence === 'function' && p.co2_mt)
    ? getCO2InhabitantsEquivalence(p.co2_mt * 1_000_000) : null;

  const llmRows = [
    {
      label: 'Requêtes IA/jour (estimé)',
      value: formatLargeNum(p.llm_queries_daily),
      suffix: 'req/jour',
      equiv: null,
    },
    {
      label: 'CO₂ par requête (mix local)',
      value: llmCO2gco2 != null ? Number(llmCO2gco2).toFixed(2) : '—',
      suffix: 'gCO₂/req',
      equiv: llmCO2Equiv,
    },
    {
      label: 'Énergie par utilisateur/jour',
      value: p.wh_per_user_day != null ? p.wh_per_user_day.toLocaleString('fr-FR') : '—',
      suffix: 'Wh/util./jour',
      equiv: null,
    },
  ];

  llmRows.forEach(({ label, value, suffix, equiv }) => {
    const row = document.createElement('div');
    row.className = 'llm-row';

    const lbl = document.createElement('span');
    lbl.className = 'llm-label';
    lbl.textContent = label;

    const valWrap = document.createElement('div');
    valWrap.className = 'llm-value-wrap';

    const val = document.createElement('span');
    val.className = 'llm-value';
    val.textContent = value + ' ' + suffix;
    valWrap.appendChild(val);

    if (equiv) {
      const eq = document.createElement('span');
      eq.className = 'llm-equiv';
      eq.textContent = equiv.icon + ' ' + equiv.shortText;
      eq.title = equiv.text;
      valWrap.appendChild(eq);
    }

    row.appendChild(lbl);
    row.appendChild(valWrap);
    llmBlock.appendChild(row);
  });

  // Rappel global + équivalences région
  const llmFooter = document.createElement('div');
  llmFooter.className = 'llm-footer';

  const footerLines = ['Référence : 120M utilisateurs · 10 req/j · 3 Wh/requête (IEA 2025)'];
  if (foyersEquiv) footerLines.push(foyersEquiv.icon + ' Région : ' + foyersEquiv.shortText + ' alimentés/an');
  if (co2InhabEquiv) footerLines.push(co2InhabEquiv.icon + ' CO₂ région = ' + co2InhabEquiv.shortText);
  llmFooter.textContent = footerLines.join(' · ');

  // ── BOUTON MODE DATACENTER ──
  const zoomBtn = document.createElement('button');
  zoomBtn.className = 'region-zoom-btn';
  zoomBtn.textContent = '⬤ Voir les datacenters de cette région';
  zoomBtn.addEventListener('click', () => {
    closeRegionPopup();
    if (typeof filterByRegion === 'function') filterByRegion(p.region_id);
  });

  body.appendChild(metrics);
  body.appendChild(divider);
  body.appendChild(llmBlock);
  body.appendChild(llmFooter);
  body.appendChild(zoomBtn);

  popup.appendChild(header);
  popup.appendChild(body);
  container.appendChild(popup);

  currentRegionPopup = popup;

  // Ajuster position si hors écran + drag
  requestAnimationFrame(() => {
    const rect = popup.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    let left = point.x + 16;
    let top  = point.y - 20;

    if (left + rect.width + margin > vw) left = point.x - rect.width - 16;
    if (top + rect.height + margin > vh) top = vh - rect.height - margin;
    if (top < 70) top = 70;
    if (left < 295) left = 295;

    popup.style.left = left + 'px';
    popup.style.top  = top + 'px';
    if (typeof makeDraggable === 'function') makeDraggable(popup, header);
  });

}

function createRegionMetricCard(val, unit, label, cls, equiv) {
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
  card.appendChild(unitEl);
  card.appendChild(labelEl);

  if (equiv) {
    const equivEl = document.createElement('div');
    equivEl.className = 'metric-equiv';
    equivEl.title = equiv.text;
    equivEl.textContent = equiv.icon + ' ' + equiv.shortText;
    card.appendChild(equivEl);
  }

  return card;
}

function closeRegionPopup() {
  if (currentRegionPopup) {
    currentRegionPopup.remove();
    currentRegionPopup = null;
  }
}
