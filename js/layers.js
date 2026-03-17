/* ============================================================
   layers.js — Couches Mapbox avec effet glow néon
   Architecture :
     1. dc-halos  : cercles larges + flous (glow ambiant)
     2. dc-glow   : cercles moyens + légèrement flous (aura)
     3. dc-core   : cercles petits et nets (noyau lumineux)
     4. dc-clusters : clusters colorés
     5. dc-cluster-count : labels des clusters
   ============================================================ */

// Palette néon par classe de carbone
const CARBON_COLORS = [
  'case',
  ['==', ['get', 'carbon_color_class'], 'very_low'],  '#00ff88',
  ['==', ['get', 'carbon_color_class'], 'low'],        '#00d4ff',
  ['==', ['get', 'carbon_color_class'], 'medium'],     '#ffcc00',
  ['==', ['get', 'carbon_color_class'], 'high'],       '#ff6600',
  /* very_high / default */                             '#ff0044',
];

// Rayon selon zoom et capacité MW
const CIRCLE_RADIUS_EXPR = [
  'interpolate', ['linear'], ['zoom'],
  1, ['interpolate', ['linear'], ['coalesce', ['get', 'capacity_mw'], 20],
       0, 2, 50, 3, 300, 4.5, 1000, 6],
  6, ['interpolate', ['linear'], ['coalesce', ['get', 'capacity_mw'], 20],
       0, 4, 50, 6, 300, 9, 1000, 14],
  12, ['interpolate', ['linear'], ['coalesce', ['get', 'capacity_mw'], 20],
       0, 7, 50, 11, 300, 16, 1000, 24],
];

// ============================================================
// COUCHES RÉGIONALES
// ============================================================

function initRegionLayers(map) {
  map.addSource('dc-regions', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  // Halo large semi-transparent
  map.addLayer({
    id: 'region-halo',
    type: 'circle',
    source: 'dc-regions',
    layout: { visibility: 'none' },
    paint: {
      'circle-color': '#00d4ff',
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'pct_global_capacity'],
        1, 45, 10, 70, 30, 95, 50, 120,
      ],
      'circle-blur': 1.0,
      'circle-opacity': 0.10,
    },
  });

  // Cercle principal coloré selon CO2 moyen (couleur mise à jour dynamiquement)
  map.addLayer({
    id: 'region-core',
    type: 'circle',
    source: 'dc-regions',
    layout: { visibility: 'none' },
    paint: {
      'circle-color': [
        'interpolate', ['linear'], ['/', ['get', 'co2_mt'], ['max', ['get', 'count'], 1]],
        0, '#00ff88',
        0.5, '#00d4ff',
        1, '#ffcc00',
        2, '#ff6600',
        5, '#ff0044',
      ],
      'circle-radius': [
        'interpolate', ['linear'], ['get', 'pct_global_capacity'],
        1, 20, 10, 35, 30, 55, 50, 75,
      ],
      'circle-blur': 0.2,
      'circle-opacity': 0.80,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-opacity': 0.4,
    },
  });

  // Label : nom de région + count
  map.addLayer({
    id: 'region-label',
    type: 'symbol',
    source: 'dc-regions',
    layout: {
      visibility: 'none',
      'text-field': ['concat', ['get', 'label'], '\n', ['get', 'count'], ' DC'],
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': 13,
      'text-allow-overlap': true,
      'text-anchor': 'center',
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': 'rgba(0,0,0,0.7)',
      'text-halo-width': 1.5,
    },
  });
}

// Palettes de couleur selon la métrique sélectionnée
function getRegionColorExpr(metric) {
  switch (metric) {
    case 'pue':
      return [
        'interpolate', ['linear'], ['get', 'avg_pue'],
        1.1, '#00ff88',
        1.4, '#00d4ff',
        1.6, '#ffcc00',
        1.8, '#ff6600',
        2.0, '#ff0044',
      ];
    case 'water':
      return [
        'interpolate', ['linear'], ['get', 'avg_water_per_dc'],
        0,         '#00ff88',
        500000,    '#00d4ff',
        1000000,   '#ffcc00',
        3000000,   '#ff6600',
        10000000,  '#ff0044',
      ];
    case 'traffic':
      return [
        'interpolate', ['linear'], ['get', 'pct_global_capacity'],
        0,  '#00d4ff',
        10, '#7b61ff',
        30, '#ffcc00',
        50, '#ff0044',
      ];
    case 'co2':
    default:
      return [
        'interpolate', ['linear'], ['/', ['get', 'co2_mt'], ['max', ['get', 'count'], 1]],
        0,   '#00ff88',
        0.5, '#00d4ff',
        1,   '#ffcc00',
        2,   '#ff6600',
        5,   '#ff0044',
      ];
  }
}

function showRegionMode(map, features, metric) {
  const regionData = buildRegionGeoJSON(features);
  map.getSource('dc-regions').setData(regionData);

  // Appliquer la couleur selon métrique
  const colorExpr = getRegionColorExpr(metric || 'co2');
  if (map.getLayer('region-core')) {
    map.setPaintProperty('region-core', 'circle-color', colorExpr);
  }

  // Cacher les couches datacenter
  ['dc-halos', 'dc-glow', 'dc-core', 'dc-clusters', 'dc-clusters-halo', 'dc-cluster-count'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  });

  // Montrer les couches région
  ['region-halo', 'region-core', 'region-label'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
  });
}

function showDatacenterMode(map) {
  // Cacher les couches région
  ['region-halo', 'region-core', 'region-label'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
  });

  // Montrer les couches datacenter
  ['dc-halos', 'dc-glow', 'dc-core', 'dc-clusters', 'dc-clusters-halo', 'dc-cluster-count'].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
  });
}

function initLayers(map, geojson) {
  // === SOURCE avec clustering ===
  map.addSource('datacenters', {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterMaxZoom: 7,
    clusterRadius: 40,
    clusterProperties: {
      // Agrégation : somme CO2 dans le cluster
      total_co2: ['+', ['coalesce', ['get', 'co2_annual_tonnes'], 0]],
    },
  });

  // === COUCHE 1 : HALOS (blur intense = glow ambiant) ===
  map.addLayer({
    id: 'dc-halos',
    type: 'circle',
    source: 'datacenters',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': CARBON_COLORS,
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        1, ['interpolate', ['linear'], ['coalesce', ['get', 'capacity_mw'], 20],
             0, 6, 300, 12, 1000, 18],
        8, ['interpolate', ['linear'], ['coalesce', ['get', 'capacity_mw'], 20],
             0, 14, 300, 28, 1000, 48],
      ],
      'circle-blur': 1.2,
      'circle-opacity': 0.18,
      'circle-pitch-alignment': 'map',
    },
  });

  // === COUCHE 2 : GLOW (aura intermédiaire) ===
  map.addLayer({
    id: 'dc-glow',
    type: 'circle',
    source: 'datacenters',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': CARBON_COLORS,
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        1, ['interpolate', ['linear'], ['coalesce', ['get', 'capacity_mw'], 20],
             0, 3.5, 300, 7, 1000, 11],
        8, ['interpolate', ['linear'], ['coalesce', ['get', 'capacity_mw'], 20],
             0, 8, 300, 16, 1000, 26],
      ],
      'circle-blur': 0.55,
      'circle-opacity': 0.55,
      'circle-pitch-alignment': 'map',
    },
  });

  // === COUCHE 3 : CORE (noyau net et brillant) ===
  map.addLayer({
    id: 'dc-core',
    type: 'circle',
    source: 'datacenters',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': CARBON_COLORS,
      'circle-radius': CIRCLE_RADIUS_EXPR,
      'circle-blur': 0.1,
      'circle-opacity': 0.9,
      'circle-stroke-width': [
        'interpolate', ['linear'], ['zoom'],
        2, 0, 5, 0.4, 10, 0.8,
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-opacity': 0.6,
      'circle-pitch-alignment': 'map',
    },
  });

  // === COUCHE 4 : CLUSTERS (cercles agrégés) ===
  map.addLayer({
    id: 'dc-clusters',
    type: 'circle',
    source: 'datacenters',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step', ['get', 'point_count'],
        '#00d4ff',   20,   // < 20 → cyan
        '#ffcc00',   100,  // 20-100 → ambre
        '#ff6600',   500,  // 100-500 → orange
        '#ff0044',         // > 500 → rouge
      ],
      'circle-radius': [
        'step', ['get', 'point_count'],
        14,  20,
        20,  100,
        28,  500,
        38,
      ],
      'circle-blur': 0.3,
      'circle-opacity': 0.75,
      'circle-stroke-width': 1,
      'circle-stroke-color': [
        'step', ['get', 'point_count'],
        '#00d4ff', 20,
        '#ffcc00', 100,
        '#ff6600', 500,
        '#ff0044',
      ],
      'circle-stroke-opacity': 0.5,
    },
  });

  // Halo sur les clusters
  map.addLayer({
    id: 'dc-clusters-halo',
    type: 'circle',
    source: 'datacenters',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': [
        'step', ['get', 'point_count'],
        '#00d4ff', 20, '#ffcc00', 100, '#ff6600', 500, '#ff0044',
      ],
      'circle-radius': [
        'step', ['get', 'point_count'],
        22, 20, 30, 100, 40, 500, 52,
      ],
      'circle-blur': 1.0,
      'circle-opacity': 0.15,
    },
  }, 'dc-clusters'); // Insérer sous les clusters

  // === COUCHE 5 : LABELS CLUSTERS ===
  map.addLayer({
    id: 'dc-cluster-count',
    type: 'symbol',
    source: 'datacenters',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': '{point_count_abbreviated}',
      'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
      'text-size': ['step', ['get', 'point_count'], 11, 100, 13, 500, 15],
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': 'rgba(0,0,0,0.5)',
      'text-halo-width': 1,
    },
  });

  // Initialiser les couches région (vides au départ)
  initRegionLayers(map);
}

// ============================================================
// CÂBLES SOUS-MARINS (TeleGeography)
// ============================================================

async function initSubmarineCables(map) {
  try {
    const resp = await fetch('data/submarine-cables.geojson');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const geojson = await resp.json();

    map.addSource('submarine-cables', { type: 'geojson', data: geojson });

    // Effet lumineux diffus (glow)
    map.addLayer({
      id: 'cables-glow',
      type: 'line',
      source: 'submarine-cables',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#00aaff'],
        'line-width': 3,
        'line-blur': 4,
        'line-opacity': 0.12,
      },
    }, 'dc-halos');

    // Ligne nette et discrète (core)
    map.addLayer({
      id: 'cables-core',
      type: 'line',
      source: 'submarine-cables',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#00aaff'],
        'line-width': 0.8,
        'line-opacity': 0.30,
      },
    }, 'dc-halos');

    console.log('[Cables] Câbles sous-marins chargés');
  } catch (e) {
    console.warn('[Cables]', e);
  }
}
