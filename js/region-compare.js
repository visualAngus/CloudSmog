/* ============================================================
   region-compare.js v2 — strip compact : cards radar SVG + chips LLM
   ============================================================ */

const COMPARE_METRICS = [
  {
    id: 'carbon', label: 'Intensit\u00e9 CO\u2082', prop: 'avg_carbon_intensity',
    unit: 'gCO\u2082/kWh', shortTab: 'CO\u2082',
    desc: 'gCO\u2082 \u00e9mis par kWh \u00e9lectrique \u2014 d\u00e9pend du mix \u00e9nerg\u00e9tique (charbon vs renouvelable). \u2193\u00a0=\u00a0meilleur.',
  },
  {
    id: 'pue', label: 'PUE', prop: 'avg_pue',
    unit: '', shortTab: 'PUE',
    desc: 'Power Usage Effectiveness : ratio \u00e9nergie totale / \u00e9nergie serveurs. 1.0\u00a0=\u00a0parfait, 1.58\u00a0=\u00a0moyenne mondiale. \u2193\u00a0=\u00a0meilleur.',
  },
  {
    id: 'llm_co2', label: 'CO\u2082 par requ\u00eate LLM', prop: 'llm_co2_per_query_gco2',
    unit: 'gCO\u2082/req', shortTab: 'LLM',
    desc: 'CO\u2082 \u00e9mis par une requ\u00eate IA (~500 tokens), selon le mix \u00e9lectrique r\u00e9gional. Source\u00a0: EcoLogits. \u2193\u00a0=\u00a0meilleur.',
  },
  {
    id: 'water', label: 'Eau par datacenter', prop: 'avg_water_per_dc',
    unit: 'm\u00B3/DC', shortTab: 'EAU',
    desc: 'M\u00e8tres cubes d\u2019eau retir\u00e9e par an et par DC pour le refroidissement. 1\u00a0DC\u00a0\u2248 ville de 50\u00a0000\u00a0hab. \u2193\u00a0=\u00a0meilleur.',
  },
];

// Axes du radar losange (cx=30, cy=30, r=22)
const RADAR_AXES = [
  { x: 30, y:  8 },   // haut  — carbon
  { x: 52, y: 30 },   // droite — pue
  { x: 30, y: 52 },   // bas    — llm_co2
  { x:  8, y: 30 },   // gauche — water
];
const RADAR_CX = 30, RADAR_CY = 30;

let _currentMetric = 'carbon';
let _currentFeatures = [];
let _llmTokens = 500;

const PROMPT_TIERS = [
  {
    max: 150,
    label: '~1 phrase',
    text: `Quel est l'impact carbone d'un datacenter de 100 MW en France ?`,
  },
  {
    max: 300,
    label: '~1 paragraphe',
    text: `Compare l'empreinte carbone d'un datacenter alimenté par le mix électrique français versus le mix allemand pour une capacité de 50 MW. Prends en compte le PUE moyen de 1.4 et exprime le résultat en tonnes de CO₂ par an.`,
  },
  {
    max: 600,
    label: 'requête détaillée',
    text: `Tu es un expert en développement durable pour le secteur numérique. Analyse les avantages et inconvénients de localiser un nouveau datacenter de 200 MW en Scandinavie versus en Europe du Sud. Prends en compte : (1) l'intensité carbone du mix électrique local, (2) la disponibilité d'énergie renouvelable, (3) les besoins de refroidissement et la consommation d'eau, (4) la latence réseau pour les utilisateurs européens, (5) les coûts d'infrastructure. Fournis une recommandation argumentée avec chiffres à l'appui.`,
  },
  {
    max: 1000,
    label: 'analyse approfondie',
    text: `Contexte : notre entreprise opère 12 datacenters répartis en Europe (6), Amérique du Nord (4) et Asie-Pacifique (2). Capacité totale : 1,8 GW. PUE moyen : 1.52. Objectif : réduire nos émissions de CO₂ de 40% d'ici 2028 sans dégrader la disponibilité (SLA 99,99%).\n\nMission : élabore une feuille de route stratégique couvrant : (1) audit détaillé par site avec émissions actuelles calculées selon le mix électrique local, (2) identification des 3 leviers d'action prioritaires (renouvelables, efficacité PUE, délocalisation), (3) estimation des investissements requis et des délais de retour, (4) risques et contraintes réglementaires par pays, (5) indicateurs de suivi trimestriels. Inclus des tableaux comparatifs et une synthèse exécutive.`,
  },
  {
    max: Infinity,
    label: 'rapport complet',
    text: `[RAPPORT D'ANALYSE STRATÉGIQUE — INFRASTRUCTURE NUMÉRIQUE ET IMPACT ENVIRONNEMENTAL]\n\nCommande : génère un rapport complet de 15 pages destiné au conseil d'administration.\n\nDonnées d'entrée : consommation_2023.csv, inventaire_sites.xlsx, contrats_energie.pdf, rapports_fournisseurs.\n\nStructure attendue :\n1. Résumé exécutif (1 page) avec 5 indicateurs clés\n2. Inventaire et cartographie de l'empreinte actuelle (CO₂, eau, énergie) par site, région et opérateur\n3. Benchmark sectoriel : positionnement vs leaders (Equinix, Digital Realty, hyperscalers)\n4. Analyse des engagements déclarés vs réalité mesurée — identification des greenwashing potentiels\n5. Scénarios de décarbonation 2025–2030 : trajectoire -40%, -60%, net-zéro\n6. Plan d'action opérationnel trimestriel avec responsables désignés\n7. Modélisation financière : CAPEX/OPEX, économies projetées, valeur carbone\n8. Annexes techniques : méthodologie, sources, hypothèses\n\nTon : professionnel, factuel, orienté décision. Inclus des tableaux comparatifs et graphiques schématiques.`,
  },
];

function updatePromptExample(tokens) {
  const tier = PROMPT_TIERS.find(t => tokens <= t.max) || PROMPT_TIERS[PROMPT_TIERS.length - 1];
  const el = document.getElementById('prompt-example-text');
  const sizeEl = document.getElementById('prompt-example-size');
  if (el) el.textContent = tier.text;
  if (sizeEl) sizeEl.textContent = '· ' + tier.label;
}

// ============================================================
// API publique
// ============================================================

function showComparePanel(regionFeatures) {
  _currentFeatures = regionFeatures || [];
  const panel = document.getElementById('region-compare-panel');
  if (!panel) return;
  panel.classList.remove('hidden');

  // Masquer le panneau LLM droit par défaut (visible seulement sur l'onglet Modèles IA)
  const llmCol = document.querySelector('.compare-col--llm');
  const vdivider = document.querySelector('.compare-vdivider');
  if (llmCol) llmCol.style.display = 'none';
  if (vdivider) vdivider.style.display = 'none';

  // Initialiser la description de la métrique par défaut
  const initialMeta = COMPARE_METRICS.find(m => m.id === _currentMetric);
  const labelEl = document.getElementById('compare-active-label');
  if (labelEl && initialMeta) labelEl.textContent = '\u00B7 ' + initialMeta.label;
  _updateMetricDesc(initialMeta);
  _renderCards();
}

function _updateMetricDesc(meta) {
  let descEl = document.getElementById('compare-metric-desc');
  if (!descEl) {
    descEl = document.createElement('div');
    descEl.id = 'compare-metric-desc';
    descEl.className = 'compare-metric-desc';
    const colTitle = document.querySelector('.compare-col--regions .compare-col-title');
    if (colTitle) colTitle.appendChild(descEl);
  }
  if (meta) descEl.textContent = meta.desc;
}

function closeComparePanel() {
  const panel = document.getElementById('region-compare-panel');
  if (panel) panel.classList.add('hidden');
}

function setCompareMetric(metric) {
  _currentMetric = metric;

  document.querySelectorAll('.compare-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.metric === metric);
  });

  const isLLM = metric === 'llm_models';
  const regionsCol = document.querySelector('.compare-col--regions');
  const llmCol = document.querySelector('.compare-col--llm');
  const vdivider = document.querySelector('.compare-vdivider');
  const tokensControl = document.getElementById('llm-tokens-control');

  if (regionsCol) regionsCol.style.display = isLLM ? 'none' : '';
  if (llmCol) llmCol.style.display = isLLM ? '' : 'none';
  if (vdivider) vdivider.style.display = isLLM ? 'none' : 'none'; // toujours caché
  if (tokensControl) tokensControl.classList.toggle('hidden', !isLLM);

  if (isLLM) {
    _renderLLMChips();
    return;
  }

  // Met à jour le label et la description active
  const activeMeta = COMPARE_METRICS.find(m => m.id === metric);
  const labelEl = document.getElementById('compare-active-label');
  if (labelEl && activeMeta) labelEl.textContent = '\u00B7 ' + activeMeta.label;
  _updateMetricDesc(activeMeta);

  _renderCards();
}

// ============================================================
// Cartes régionales avec radar SVG
// ============================================================

function _renderCards() {
  const container = document.getElementById('compare-bars');
  if (!container || !_currentFeatures.length) return;

  const norms = _computeNorms();
  container.textContent = '';

  const activeMeta = COMPARE_METRICS.find(m => m.id === _currentMetric);
  const sorted = [..._currentFeatures]
    .filter(f => f.properties.count > 0)
    .sort((a, b) => {
      const av = a.properties[activeMeta.prop] || 0;
      const bv = b.properties[activeMeta.prop] || 0;
      return av - bv; // meilleur (plus bas) en premier
    });

  sorted.forEach((f, rank) => {
    const card = _buildCard(f, norms, rank, sorted.length, activeMeta);
    // Animation décalée
    card.style.animationDelay = (rank * 60) + 'ms';
    container.appendChild(card);
  });
}

function _computeNorms() {
  const norms = {};
  COMPARE_METRICS.forEach(m => {
    const vals = _currentFeatures
      .map(f => f.properties[m.prop])
      .filter(v => v != null && v > 0);
    norms[m.id] = {
      min: vals.length ? Math.min(...vals) : 0,
      max: vals.length ? Math.max(...vals) : 1,
    };
  });
  return norms;
}

function _buildCard(f, norms, rank, total, activeMeta) {
  const p = f.properties;
  const isBest  = rank === 0;
  const isWorst = rank === total - 1;

  const n = norms[activeMeta.id];
  const val = p[activeMeta.prop] || 0;
  const badRatio = n.max > n.min ? (val - n.min) / (n.max - n.min) : 0.5;
  const color = _scoreColor(1 - badRatio);

  const card = document.createElement('div');
  card.className = 'rcard' + (isBest ? ' rcard--best' : '') + (isWorst ? ' rcard--worst' : '');
  card.style.setProperty('--rcard-color', color);

  // Badge meilleur / pire
  if (isBest || isWorst) {
    const badge = document.createElement('div');
    badge.className = 'rcard-badge ' + (isBest ? 'badge-best' : 'badge-worst');
    badge.textContent = isBest ? '\u2714 MEILLEUR' : '\u26a0 PIRE';
    card.appendChild(badge);
  }

  // Rang #N
  const rankEl = document.createElement('div');
  rankEl.className = 'rcard-rank-num';
  rankEl.textContent = '#' + (rank + 1);
  rankEl.style.color = color;

  // Nom région
  const nameEl = document.createElement('div');
  nameEl.className = 'rcard-name';
  nameEl.textContent = _shortLabel(p.label || p.region_id);

  // Valeur principale — le chiffre-clé, lisible
  const valueEl = document.createElement('div');
  valueEl.className = 'rcard-value';
  const numEl = document.createElement('div');
  numEl.className = 'rcard-num';
  numEl.textContent = _formatVal(val, activeMeta);
  numEl.style.color = color;
  numEl.style.textShadow = '0 0 16px ' + color;
  const unitEl = document.createElement('div');
  unitEl.className = 'rcard-unit';
  unitEl.textContent = activeMeta.unit;
  valueEl.appendChild(numEl);
  valueEl.appendChild(unitEl);

  // Barre de position : pleine = pire impact, courte = bon
  const barWrap = document.createElement('div');
  barWrap.className = 'rcard-bar-wrap';
  const barLabel = document.createElement('div');
  barLabel.className = 'rcard-bar-label';
  barLabel.textContent = 'IMPACT RELATIF';
  const barTrack = document.createElement('div');
  barTrack.className = 'rcard-bar-track';
  const barFill = document.createElement('div');
  barFill.className = 'rcard-bar-fill';
  barFill.style.width = Math.max(4, Math.round(badRatio * 100)) + '%';
  barFill.style.background = color;
  barTrack.appendChild(barFill);
  barWrap.appendChild(barLabel);
  barWrap.appendChild(barTrack);

  // Mini stats secondaires (les 3 autres métriques)
  const miniRow = document.createElement('div');
  miniRow.className = 'rcard-mini';
  COMPARE_METRICS.filter(m => m.id !== activeMeta.id).forEach(m => {
    const v = p[m.prop];
    if (!v) return;
    const mini = document.createElement('div');
    mini.className = 'rcard-mini-item';
    const lbl = document.createElement('span');
    lbl.className = 'rcard-mini-lbl';
    lbl.textContent = m.shortTab;
    const val2 = document.createElement('span');
    val2.className = 'rcard-mini-val';
    val2.textContent = _formatVal(v, m);
    mini.appendChild(lbl);
    mini.appendChild(val2);
    miniRow.appendChild(mini);
  });

  card.appendChild(rankEl);
  card.appendChild(nameEl);
  card.appendChild(valueEl);
  card.appendChild(barWrap);
  card.appendChild(miniRow);

  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    const center = REGION_CENTERS[p.region_id];
    if (center && APP.map) {
      APP.map.flyTo({ center: [center.lon, center.lat], zoom: 3.5, duration: 900 });
    }
  });

  return card;
}

// ============================================================
// Chips LLM compacts (liste verticale)
// ============================================================

function _renderLLMChips() {
  const container = document.getElementById('compare-llm');
  if (!container) return;
  container.textContent = '';

  updatePromptExample(_llmTokens);

  if (typeof LLM_MODELS === 'undefined' || !LLM_MODELS.length) return;

  const scale = _llmTokens / 500; // référence EcoLogits = 500 tokens
  const maxCO2 = Math.max(...LLM_MODELS.map(m => m.kwh_per_req * scale * m.carbon_gco2_kwh));

  LLM_MODELS.forEach((m, i) => {
    const co2 = m.kwh_per_req * scale * m.carbon_gco2_kwh;
    const whEl = (m.kwh_per_req * scale * 1000).toFixed(1);
    const pct = maxCO2 > 0 ? (co2 / maxCO2) * 100 : 0;

    let chipColor = 'var(--green)';
    if (co2 >= 3)      chipColor = 'var(--red)';
    else if (co2 >= 1) chipColor = 'var(--amber)';

    const co2Txt = co2 >= 1
      ? co2.toFixed(2) + ' gCO\u2082'
      : (co2 * 1000).toFixed(1) + ' mgCO\u2082';

    // Équivalence CO2 (co2 en g → tonnes)
    const equiv = typeof getCO2Equivalence === 'function'
      ? getCO2Equivalence(co2 / 1_000_000)
      : null;

    const chip = document.createElement('div');
    chip.className = 'llm-chip';
    chip.style.animationDelay = (i * 40) + 'ms';

    const row = document.createElement('div');
    row.className = 'llm-chip-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'llm-chip-name';
    nameEl.textContent = m.name;

    const co2El = document.createElement('span');
    co2El.className = 'llm-chip-co2';
    co2El.textContent = co2Txt;
    co2El.style.color = chipColor;

    row.appendChild(nameEl);
    row.appendChild(co2El);

    // Ligne provider + pays
    const providerEl = document.createElement('div');
    providerEl.className = 'llm-chip-provider';
    providerEl.textContent = m.provider + ' \u00B7 ' + m.hosting;

    const track = document.createElement('div');
    track.className = 'llm-chip-track';
    const fillEl = document.createElement('div');
    fillEl.className = 'llm-chip-fill';
    fillEl.style.width = pct.toFixed(1) + '%';
    fillEl.style.background = chipColor;
    track.appendChild(fillEl);

    // Ligne énergie + équivalence
    const infoRow = document.createElement('div');
    infoRow.className = 'llm-chip-info';
    const whNote = document.createElement('span');
    whNote.className = 'llm-chip-wh';
    whNote.textContent = whEl + ' Wh';
    infoRow.appendChild(whNote);

    if (equiv) {
      const equivEl = document.createElement('span');
      equivEl.className = 'llm-chip-equiv';
      equivEl.textContent = equiv.shortText;
      infoRow.appendChild(equivEl);
    }

    chip.appendChild(row);
    chip.appendChild(providerEl);
    chip.appendChild(track);
    chip.appendChild(infoRow);
    container.appendChild(chip);
  });

  // Source
  const src = document.createElement('div');
  src.className = 'compare-source';
  src.textContent = 'EcoLogits \u00B7 ';
  const a = document.createElement('a');
  a.href = 'https://ecologits.ai/latest/methodology/llm_inference/';
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'ecologits.ai';
  src.appendChild(a);
  container.appendChild(src);
}

// ============================================================
// Utilitaires
// ============================================================

function _scoreColor(goodRatio) {
  // goodRatio 0=rouge (mauvais), 1=vert (bon)
  if (goodRatio < 0.5) {
    const t = goodRatio * 2;
    return 'rgb(' + 255 + ',' + Math.round(t * 102) + ',' + Math.round(68 * (1 - t)) + ')';
  }
  const t = (goodRatio - 0.5) * 2;
  return 'rgb(' + Math.round(255 * (1 - t)) + ',' + Math.round(102 + t * 153) + ',' + Math.round(t * 136) + ')';
}

function _shortLabel(label) {
  const map = {
    'Am\u00e9rique du Nord': 'Am. Nord',
    'Asie-Pacifique': 'Asie-Pac.',
    'Moyen-Orient & Afrique': 'MO & Afr.',
    'Am\u00e9rique Latine': 'Am. Latine',
  };
  return map[label] || label;
}

function _formatVal(val, metaDef) {
  if (!metaDef) return '';
  if (metaDef.id === 'water') {
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000)    return (val / 1000).toFixed(0) + 'k';
    return Math.round(val).toString();
  }
  if (metaDef.id === 'energy_user') {
    if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
    return Math.round(val).toString();
  }
  if (metaDef.id === 'llm_co2') return val < 0.1 ? val.toFixed(3) : val.toFixed(2);
  if (metaDef.id === 'pue')     return val.toFixed(2);
  return Math.round(val).toString();
}

// ============================================================
// Init
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.compare-tab').forEach(btn => {
    btn.addEventListener('click', () => setCompareMetric(btn.dataset.metric));
  });
  const closeBtn = document.getElementById('compare-close');
  if (closeBtn) closeBtn.addEventListener('click', closeComparePanel);

  const slider = document.getElementById('llm-tokens-slider');
  if (slider) slider.addEventListener('input', e => {
    _llmTokens = parseInt(e.target.value);
    document.getElementById('llm-tokens-value').textContent = _llmTokens;
    updatePromptExample(_llmTokens);
    _renderLLMChips();
  });
});
