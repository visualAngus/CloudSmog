/* ============================================================
   main.js — Init Mapbox + Orchestration
   ============================================================ */

// Token Mapbox public (pk.) — conçu pour être dans le code client
// Restreindre le domaine sur https://account.mapbox.com/access-tokens/ si nécessaire
mapboxgl.accessToken = 'pk.eyJ1IjoiZ2FlbDIyMjIyMjIyMjIyMiIsImEiOiJjbW1ka2pzc3IwNDB2Mm9xdWJ0ZHNleWRoIn0.nvxLgNqk7dkqa5rPDaspMw';

// ============================================================
// CONFIG
// ============================================================
const MAP_STYLES = {
  dark:  'mapbox://styles/mapbox/dark-v11',
  light: 'mapbox://styles/mapbox/light-v11',
};

const CONFIG = {
  geojsonUrl: './data/datacenters.geojson',
  initialCenter: [10, 30],
  initialZoom: 2,
  get mapStyle() {
    return MAP_STYLES[APP.mapTheme] || MAP_STYLES.dark;
  },
};

// ============================================================
// ÉTAT GLOBAL
// ============================================================
window.APP = {
  map: null,
  data: null,
  viewMode: 'region',       // 'datacenter' | 'region'
  regionMetric: 'co2',      // métrique active pour les couleurs régionales
  expertMode: false,        // false = simplifié, true = expert
  tourActive: false,
  mapTheme: localStorage.getItem('map_theme') || 'dark',
  filters: {
    operator: '',
    country:  '',
    carbonMax: 1000,
    waterStress: ['low', 'low-medium', 'medium-high', 'high', 'extremely-high', 'unknown', 'arid'],
    activeClasses: ['very_low', 'low', 'medium', 'high', 'very_high'],
    aiOnly: true,
  },
};

// ============================================================
// INIT MAP
// ============================================================
function initMap() {
  const map = new mapboxgl.Map({
    container: 'map',
    style: CONFIG.mapStyle,
    center: CONFIG.initialCenter,
    zoom: CONFIG.initialZoom,
    projection: 'globe',
    antialias: true,
    logoPosition: 'bottom-right',
  });

  APP.map = map;

  map.on('style.load', () => {
    map.setFog({
      color: 'rgb(5, 5, 14)',
      'high-color': 'rgb(10, 10, 30)',
      'horizon-blend': 0.04,
      'space-color': 'rgb(2, 2, 8)',
      'star-intensity': 0.6,
    });
  });

  map.addControl(
    new mapboxgl.NavigationControl({ showCompass: false }),
    'top-right'
  );

  map.on('load', async () => {
    await loadData();
    initHeaderControls();
  });

  return map;
}

// ============================================================
// CHARGEMENT DES DONNÉES
// ============================================================
async function loadData() {
  try {
    const resp = await fetch(CONFIG.geojsonUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const geojson = await resp.json();
    APP.data = geojson;

    console.log('[DCMap] ' + geojson.features.length + ' datacenters chargés');

    initLayers(APP.map, geojson);
    initSubmarineCables(APP.map);
    initFilters(APP.map, geojson);
    initStats(geojson);
    initSliderGradient();

    setupHoverEffects(APP.map);
    setupClickEvents(APP.map);

    // Appliquer les filtres initiaux (ex: aiOnly: true par défaut)
    applyFilters();

    // Vue régionale par défaut
    showRegionMode(APP.map, APP.data.features.filter(f => matchesFilter(f.properties)), APP.regionMetric);

    // Bouton COMPARER visible dès le départ (mode région par défaut)
    const btnCompareInit = document.getElementById('btn-compare');
    if (btnCompareInit && APP.viewMode === 'region') btnCompareInit.classList.remove('hidden');

  } catch (err) {
    console.error('Erreur chargement GeoJSON :', err);
    showLoadError(err.message);
  }
}

// ============================================================
// ERREUR DE CHARGEMENT (DOM safe)
// ============================================================
function showLoadError(msg) {
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
    'z-index:999', 'background:rgba(5,5,14,0.95)', 'border:1px solid #ff0044',
    'border-radius:6px', 'padding:24px 32px', 'text-align:center',
    "font-family:'Share Tech Mono',monospace", 'color:#ff0044',
    'box-shadow:0 0 30px rgba(255,0,68,0.3)',
  ].join(';');

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size:32px;margin-bottom:12px';
  icon.textContent = '⚠';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:14px;letter-spacing:.1em';
  title.textContent = 'ERREUR CHARGEMENT DONNÉES';

  const detail = document.createElement('div');
  detail.style.cssText = 'font-size:11px;color:rgba(200,216,232,0.5);margin-top:8px';
  detail.textContent = msg;

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:10px;margin-top:12px;color:rgba(200,216,232,0.4)';
  hint.textContent = 'Lancer : python -m http.server 8000 puis ouvrir http://localhost:8000';

  el.appendChild(icon);
  el.appendChild(title);
  el.appendChild(detail);
  el.appendChild(hint);
  document.body.appendChild(el);
}

// ============================================================
// HOVER EFFECTS
// ============================================================
function setupHoverEffects(map) {
  const mapEl = document.getElementById('map');

  map.on('mouseenter', 'dc-glow', () => {
    map.getCanvas().style.cursor = 'pointer';
    mapEl.classList.add('hovering');
  });
  map.on('mouseleave', 'dc-glow', () => {
    map.getCanvas().style.cursor = '';
    mapEl.classList.remove('hovering');
  });
  map.on('mouseenter', 'dc-clusters', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'dc-clusters', () => {
    map.getCanvas().style.cursor = '';
  });
}

// ============================================================
// CLICK EVENTS
// ============================================================
function setupClickEvents(map) {
  map.on('click', 'dc-glow', (e) => {
    const feature = e.features[0];
    if (feature) showPopup(feature, e.point);
  });

  map.on('click', 'dc-clusters', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ['dc-clusters'] });
    if (!features.length) return;
    const clusterId = features[0].properties.cluster_id;
    map.getSource('datacenters').getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom + 0.5, duration: 600 });
    });
  });

  map.on('click', (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: ['dc-glow', 'dc-clusters'] });
    if (!hits.length) closePopup();
  });
}

// ============================================================
// CONTRÔLES DU HEADER
// ============================================================
function initHeaderControls() {
  // --- Mode vue : datacenter / région ---
  const btnDC = document.getElementById('btn-dc-mode');
  const btnRegion = document.getElementById('btn-region-mode');

  btnDC.addEventListener('click', () => switchViewMode('datacenter'));
  btnRegion.addEventListener('click', () => switchViewMode('region'));

  // --- Mode Expert ---
  const btnExpert = document.getElementById('btn-expert');
  const savedExpert = localStorage.getItem('expert_mode') === '1';
  if (savedExpert) applyExpertMode(true);

  btnExpert.addEventListener('click', () => {
    applyExpertMode(!APP.expertMode);
  });

  // --- Thème carte ---
  const btnTheme = document.getElementById('btn-map-theme');
  updateThemeIcon();

  btnTheme.addEventListener('click', toggleMapTheme);

  // --- Bouton COMPARER LES RÉGIONS ---
  document.getElementById('btn-compare')?.addEventListener('click', () => {
    const features = buildRegionGeoJSON(
      APP.data.features.filter(f => matchesFilter(f.properties))
    ).features;
    showComparePanel(features);
  });

  // --- Clic région → popup régionale enrichie ---
  APP.map.on('click', 'region-core', (e) => {
    const feature = e.features[0];
    if (feature) showRegionPopup(feature, e.point);
  });

  APP.map.on('mouseenter', 'region-core', () => {
    APP.map.getCanvas().style.cursor = 'pointer';
  });
  APP.map.on('mouseleave', 'region-core', () => {
    APP.map.getCanvas().style.cursor = '';
  });

}

function switchViewMode(mode) {
  APP.viewMode = mode;
  const btnDC = document.getElementById('btn-dc-mode');
  const btnRegion = document.getElementById('btn-region-mode');

  const btnCompare = document.getElementById('btn-compare');

  if (mode === 'region') {
    btnDC.classList.remove('active');
    btnRegion.classList.add('active');
    if (btnCompare) btnCompare.classList.remove('hidden');
    const filtered = APP.data.features.filter(f => matchesFilter(f.properties));
    showRegionMode(APP.map, filtered, APP.regionMetric);
  } else {
    btnRegion.classList.remove('active');
    btnDC.classList.add('active');
    if (btnCompare) btnCompare.classList.add('hidden');
    if (typeof closeComparePanel === 'function') closeComparePanel();
    showDatacenterMode(APP.map);
    closeRegionPopup();
  }
}


function filterByRegion(regionId) {
  // Zoom sur le centre de la région
  const center = REGION_CENTERS[regionId];
  if (center) {
    APP.map.flyTo({ center: [center.lon, center.lat], zoom: 3.5, duration: 800 });
  }
  // Repasse en mode datacenter
  switchViewMode('datacenter');
}

function applyExpertMode(active) {
  APP.expertMode = active;
  document.body.classList.toggle('expert-mode', active);
  const btn = document.getElementById('btn-expert');
  if (btn) {
    btn.textContent = active ? 'MODE SIMPLE' : 'MODE EXPERT';
    btn.classList.toggle('active', active);
  }
  localStorage.setItem('expert_mode', active ? '1' : '0');
}

function toggleMapTheme() {
  APP.mapTheme = APP.mapTheme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('map_theme', APP.mapTheme);
  updateThemeIcon();

  APP.map.setStyle(MAP_STYLES[APP.mapTheme]);

  // Recréer les couches après changement de style
  APP.map.once('style.load', () => {
    // Reconfigurer le fog (seulement en mode sombre)
    if (APP.mapTheme === 'dark') {
      APP.map.setFog({
        color: 'rgb(5, 5, 14)',
        'high-color': 'rgb(10, 10, 30)',
        'horizon-blend': 0.04,
        'space-color': 'rgb(2, 2, 8)',
        'star-intensity': 0.6,
      });
    }
    // Recréer toutes les couches
    if (APP.data) {
      const filtered = APP.data.features.filter(f => matchesFilter(f.properties));
      initLayers(APP.map, { type: 'FeatureCollection', features: filtered });
      initSubmarineCables(APP.map);
      // Restaurer le mode vue actif
      if (APP.viewMode === 'region') {
        showRegionMode(APP.map, filtered, APP.regionMetric);
      }
    }
  });
}

function updateThemeIcon() {
  const btn = document.getElementById('btn-map-theme');
  if (btn) btn.textContent = APP.mapTheme === 'dark' ? '☀' : '☾';
}

// ============================================================
// right pannel events
// ============================================================




// ============================================================
// SLIDER GRADIENT DYNAMIQUE
// ============================================================
function initSliderGradient() {
  const slider = document.getElementById('filter-carbon');
  const valueEl = document.getElementById('carbon-value');

  function update() {
    const val = parseInt(slider.value, 10);
    const pct = ((val - parseInt(slider.min, 10)) / (parseInt(slider.max, 10) - parseInt(slider.min, 10))) * 100;
    slider.style.setProperty('--pct', pct + '%');
    valueEl.textContent = val >= 1000 ? '∞' : val;
  }

  slider.addEventListener('input', update);
  update();
}

// ============================================================
// APPLIQUER FILTRES SUR LA CARTE
// ============================================================
function applyFilters() {
  const map = APP.map;
  const source = map && map.getSource('datacenters');
  if (!source || !APP.data) return;

  // Filtrer côté JS, puis injecter dans la source.
  // Les clusters se recalculent automatiquement → plus de clusters "fantômes".
  const filtered = APP.data.features.filter(f => matchesFilter(f.properties));

  source.setData({
    type: 'FeatureCollection',
    features: filtered,
  });

  updateStats(filtered);
}

function matchesFilter(p) {
  const { operator, country, carbonMax, waterStress, activeClasses, aiOnly } = APP.filters;
  if (operator && p.operator !== operator) return false;
  if (country  && p.country  !== country)  return false;
  // Slider carbone (null → défaut 475 gCO2/kWh)
  if ((p.carbon_intensity_gco2_kwh ?? 475) > carbonMax) return false;
  // Légende intensité (toutes actives = pas de filtre)
  if (activeClasses.length < 5 && !activeClasses.includes(p.carbon_color_class)) return false;
  if (!waterStress.includes(p.water_stress_level)) return false;
  // Filtre IA
  if (aiOnly && !p.hosts_ai) return false;
  return true;
}

// ============================================================
// START
// ============================================================
initMap();
