/* ============================================================
   regions.js — Agrégation des datacenters par grande région
   ============================================================ */

const REGION_MAP = {
  // Amérique du Nord
  US: 'north_america', CA: 'north_america', MX: 'north_america',
  // Europe (exhaustif)
  FR: 'europe', DE: 'europe', GB: 'europe', NL: 'europe', SE: 'europe',
  NO: 'europe', FI: 'europe', DK: 'europe', BE: 'europe', CH: 'europe',
  AT: 'europe', ES: 'europe', IT: 'europe', PL: 'europe', IE: 'europe',
  PT: 'europe', CZ: 'europe', HU: 'europe', RO: 'europe', UA: 'europe',
  LU: 'europe', SK: 'europe', SI: 'europe', HR: 'europe', RS: 'europe',
  BG: 'europe', GR: 'europe', LT: 'europe', LV: 'europe', EE: 'europe',
  BY: 'europe', MD: 'europe', MK: 'europe', AL: 'europe', BA: 'europe',
  ME: 'europe', XK: 'europe', IM: 'europe', GI: 'europe', MT: 'europe',
  CY: 'europe', IS: 'europe', LI: 'europe', MC: 'europe', SM: 'europe',
  RU: 'europe', TR: 'europe',
  // Asie-Pacifique
  CN: 'asia_pacific', JP: 'asia_pacific', KR: 'asia_pacific',
  AU: 'asia_pacific', IN: 'asia_pacific', SG: 'asia_pacific',
  HK: 'asia_pacific', TW: 'asia_pacific', ID: 'asia_pacific',
  MY: 'asia_pacific', TH: 'asia_pacific', NZ: 'asia_pacific',
  VN: 'asia_pacific', PH: 'asia_pacific', BD: 'asia_pacific',
  PK: 'asia_pacific', KZ: 'asia_pacific', UZ: 'asia_pacific',
  // Moyen-Orient & Afrique
  SA: 'middle_east_africa', AE: 'middle_east_africa', ZA: 'middle_east_africa',
  NG: 'middle_east_africa', EG: 'middle_east_africa', IL: 'middle_east_africa',
  QA: 'middle_east_africa', KW: 'middle_east_africa', BH: 'middle_east_africa',
  OM: 'middle_east_africa', JO: 'middle_east_africa', IQ: 'middle_east_africa',
  IR: 'middle_east_africa', KE: 'middle_east_africa', GH: 'middle_east_africa',
  MA: 'middle_east_africa', TN: 'middle_east_africa', ET: 'middle_east_africa',
  // Amérique Latine
  BR: 'latin_america', AR: 'latin_america', CL: 'latin_america', CO: 'latin_america',
  PE: 'latin_america', UY: 'latin_america', EC: 'latin_america', VE: 'latin_america',
  BO: 'latin_america', PY: 'latin_america', CR: 'latin_america', PA: 'latin_america',
};

const REGION_CENTERS = {
  north_america:      { lon: -98,  lat: 40,  label: 'Amérique du Nord' },
  europe:             { lon: 10,   lat: 51,  label: 'Europe' },
  asia_pacific:       { lon: 115,  lat: 25,  label: 'Asie-Pacifique' },
  middle_east_africa: { lon: 30,   lat: 10,  label: 'Moyen-Orient & Afrique' },
  latin_america:      { lon: -58,  lat: -15, label: 'Amérique Latine' },
  other:              { lon: 20,   lat: 55,  label: 'Autres' },
};

// Fallback : assigner une région à partir des coordonnées lon/lat
function regionFromCoords(lon, lat) {
  // Amérique du Nord (inclut Amérique Centrale)
  if (lon >= -170 && lon <= -60 && lat >= 7 && lat <= 85)  return 'north_america';
  // Amérique Latine
  if (lon >= -120 && lon <= -30 && lat >= -60 && lat <= 25) return 'latin_america';
  // Europe (inclut Svalbard, îles atlantiques proches)
  if (lon >= -30 && lon <= 60 && lat >= 35 && lat <= 82)   return 'europe';
  // Moyen-Orient & Afrique
  if (lon >= -20 && lon <= 60 && lat >= -40 && lat <= 40)  return 'middle_east_africa';
  // Asie-Pacifique (inclut Russie orientale, Asie Centrale)
  if (lon >= 25 && lon <= 180 && lat >= -50 && lat <= 82)  return 'asia_pacific';
  return 'other';
}

function buildRegionGeoJSON(features) {
  const regions = {};

  for (const regionId of Object.keys(REGION_CENTERS)) {
    regions[regionId] = {
      count: 0,
      co2_total_tonnes: 0,
      capacity_mw: 0,
      water_m3: 0,
      pue_sum: 0,
      pue_count: 0,
      carbon_intensity_sum: 0,
      carbon_intensity_count: 0,
      countries: new Set(),
    };
  }

  for (const f of features) {
    const p = f.properties || {};
    const countryCode = (p.country || '').toUpperCase();
    let regionId = REGION_MAP[countryCode];

    // Fallback coordonnées si pays inconnu ou vide
    if (!regionId) {
      const coords = f.geometry && f.geometry.coordinates;
      if (coords && coords.length >= 2) {
        regionId = regionFromCoords(coords[0], coords[1]);
      } else {
        regionId = 'other';
      }
    }

    const r = regions[regionId];
    r.count += 1;
    r.co2_total_tonnes += p.co2_annual_tonnes || 0;
    r.capacity_mw += p.capacity_mw || 0;
    r.water_m3 += p.water_withdrawal_m3_year || 0;
    if (p.pue) { r.pue_sum += p.pue; r.pue_count += 1; }
    if (p.carbon_intensity_gco2_kwh) {
      r.carbon_intensity_sum += p.carbon_intensity_gco2_kwh;
      r.carbon_intensity_count += 1;
    }
    if (countryCode) r.countries.add(countryCode);
  }

  // Capacité mondiale totale pour le % trafic
  const total_capacity_mw = Object.values(regions).reduce((s, r) => s + r.capacity_mw, 0) || 1;

  const regionFeatures = Object.entries(regions)
    .filter(([, r]) => r.count > 0)
    .map(([regionId, r]) => {
      const center = REGION_CENTERS[regionId];
      const co2_mt = r.co2_total_tonnes / 1e6;
      const capacity_gw = r.capacity_mw / 1000;
      const water_km3 = r.water_m3 / 1e9;
      const avg_pue = r.pue_count > 0 ? r.pue_sum / r.pue_count : 1.58;
      const avg_carbon = r.carbon_intensity_count > 0
        ? r.carbon_intensity_sum / r.carbon_intensity_count
        : 475;
      const avg_water_per_dc = r.count > 0 ? r.water_m3 / r.count : 0;
      const pct_global_capacity = (r.capacity_mw / total_capacity_mw) * 100;

      // Estimation utilisateurs LLM dans cette région (proportionnel à la capacité)
      const users_estimate = Math.round(LLM_USERS_DAILY * (pct_global_capacity / 100));
      const co2_per_user_daily_kg = users_estimate > 0
        ? (r.co2_total_tonnes * 1000 / 365) / users_estimate
        : 0;
      // Wh consommés par utilisateur estimé par jour (capacité IT × PUE × 24h)
      const wh_per_user_day = users_estimate > 0
        ? Math.round((r.capacity_mw * avg_pue * 1000 * 24 * 1000) / users_estimate)
        : 0;
      const llm_queries_daily = Math.round(LLM_TOTAL_QUERIES_DAY * (pct_global_capacity / 100));
      // CO2 par requête LLM selon mix électrique régional (en gCO2)
      const llm_co2_per_query_gco2 = avg_carbon * LLM_QUERY_KWH;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [center.lon, center.lat],
        },
        properties: {
          region_id: regionId,
          label: center.label,
          count: r.count,
          co2_mt: parseFloat(co2_mt.toFixed(2)),
          capacity_gw: parseFloat(capacity_gw.toFixed(2)),
          water_km3: parseFloat(water_km3.toFixed(3)),
          countries: r.countries.size,
          avg_pue: parseFloat(avg_pue.toFixed(2)),
          avg_carbon_intensity: parseFloat(avg_carbon.toFixed(0)),
          avg_water_per_dc: parseFloat(avg_water_per_dc.toFixed(0)),
          pct_global_capacity: parseFloat(pct_global_capacity.toFixed(2)),
          users_estimate,
          co2_per_user_daily_kg: parseFloat(co2_per_user_daily_kg.toFixed(4)),
          wh_per_user_day,
          llm_queries_daily,
          llm_co2_per_query_gco2: parseFloat(llm_co2_per_query_gco2.toFixed(2)),
        },
      };
    });

  return {
    type: 'FeatureCollection',
    features: regionFeatures,
  };
}
