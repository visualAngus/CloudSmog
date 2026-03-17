/* ============================================================
   equivalences.js — Comparaisons du quotidien pour CO2, eau, énergie
   Sources :
     - EcoLogits (ecologits.ai) : 0.001–0.005 kWh/requête LLM, val. centrale 0.003
     - IEA Energy and AI 2025 : 120M utilisateurs/jour, 10 requêtes/utilisateur
     - ADEME : 120 gCO2/km voiture thermique moyenne
     - Vol Paris–NY : ~1 700 kg CO2 (aller simple, ADEME)
     - Piscine olympique : 2 500 m³
   ============================================================ */

// --- Constantes EcoLogits ---
const LLM_QUERY_KWH           = 0.003;            // kWh par requête (GPT-3.5/4 moyen)
const LLM_USERS_DAILY         = 120_000_000;       // utilisateurs chatbots IA par jour
const LLM_QUERIES_PER_USER    = 10;                // requêtes/utilisateur/jour (estimation)
const LLM_TOTAL_QUERIES_DAY   = LLM_USERS_DAILY * LLM_QUERIES_PER_USER; // 1,2 Mrd/jour

// --- Constantes équivalences ---
const CO2_KG_PER_KM_CAR       = 0.120;            // 120 gCO2/km voiture thermique (ADEME)
const CO2_KG_FLIGHT_PARIS_NY  = 1_700;            // kg CO2, aller simple (ADEME)
const CO2_T_PER_PERSON_FR     = 8.9;              // t CO2/an par habitant France (ADEME 2023)
const WATER_L_SHOWER          = 60;               // litres par douche
const WATER_L_BATHTUB         = 150;              // litres par bain
const WATER_M3_OLYMPIC_POOL   = 2_500;            // m³ piscine olympique
const ENERGY_KWH_LED_10W_H    = 0.010;            // kWh pour 1h d'ampoule LED 10W
const ENERGY_KWH_SMARTPHONE   = 0.012;            // kWh par charge smartphone
const ENERGY_KWH_FOYER_YEAR   = 4_500;            // kWh/an par foyer français moyen (ADEME)
const ENERGY_KWH_STREAMING_H  = 0.036;            // kWh par heure de streaming HD (The Shift)
const CO2_KG_STREAMING_H_FR   = 0.036 * 56 / 1000; // kg CO2/h streaming en France (mix FR ~56 gCO2/kWh)

// ------------------------------------------------------------
// Formatage court (utilisé dans les badges)
// ------------------------------------------------------------
function formatEq(val) {
  if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(1) + 'G';
  if (val >= 1_000_000)     return (val / 1_000_000).toFixed(1) + 'M';
  if (val >= 10_000)        return Math.round(val / 1000).toFixed(0) + 'k';
  if (val >= 1_000)         return (val / 1_000).toFixed(1) + 'k';
  if (val >= 10)            return Math.round(val).toLocaleString('fr-FR');
  if (val >= 1)             return val.toFixed(1);
  return val.toPrecision(2);
}

// ------------------------------------------------------------
// CO2 : tonnes → vols Paris-NY ou km voiture
// ------------------------------------------------------------
function getCO2Equivalence(tonnes) {
  if (!tonnes || tonnes <= 0) return null;
  const vols = tonnes / (CO2_KG_FLIGHT_PARIS_NY / 1000);
  if (vols >= 1) {
    return {
      icon: '✈',
      text: `${formatEq(vols)} vol${vols >= 2 ? 's' : ''} Paris–New York`,
      shortText: `≈ ${formatEq(vols)} vols ✈ Paris-NY`,
    };
  }
  const km = (tonnes * 1000) / CO2_KG_PER_KM_CAR;
  return {
    icon: '🚗',
    text: `${formatEq(km)} km en voiture`,
    shortText: `≈ ${formatEq(km)} km 🚗`,
  };
}

// ------------------------------------------------------------
// Eau : m³ → piscines olympiques ou bains
// ------------------------------------------------------------
function getWaterEquivalence(m3) {
  if (!m3 || m3 <= 0) return null;
  const piscines = m3 / WATER_M3_OLYMPIC_POOL;
  if (piscines >= 0.5) {
    return {
      icon: '🏊',
      text: `${formatEq(piscines)} piscine${piscines >= 2 ? 's' : ''} olympique${piscines >= 2 ? 's' : ''}`,
      shortText: `≈ ${formatEq(piscines)} piscines 🏊`,
    };
  }
  const bains = (m3 * 1000) / WATER_L_BATHTUB;
  return {
    icon: '🛁',
    text: `${formatEq(bains)} baignoire${bains >= 2 ? 's' : ''}`,
    shortText: `≈ ${formatEq(bains)} bains 🛁`,
  };
}

// ------------------------------------------------------------
// Énergie : kWh → heures d'ampoule LED ou charges smartphone
// ------------------------------------------------------------
function getEnergyEquivalence(kwh) {
  if (!kwh || kwh <= 0) return null;
  const charges = kwh / ENERGY_KWH_SMARTPHONE;
  if (charges < 1000) {
    return {
      icon: '📱',
      text: `${formatEq(charges)} charge${charges >= 2 ? 's' : ''} de smartphone`,
      shortText: `≈ ${formatEq(charges)} charges 📱`,
    };
  }
  const joursLed = kwh / (ENERGY_KWH_LED_10W_H * 24);
  return {
    icon: '💡',
    text: `${formatEq(joursLed)} jours d'ampoule LED (10W)`,
    shortText: `≈ ${formatEq(joursLed)}j ampoule 💡`,
  };
}

// ------------------------------------------------------------
// Données LLM — Source : EcoLogits methodology
// https://ecologits.ai/latest/methodology/llm_inference/
// Énergie par requête : ~500 tokens sortie, batch=1 (valeurs centrales EcoLogits)
// carbon_gco2_kwh : mix électrique du pays d'hébergement (OWID/ADEME)
// ------------------------------------------------------------
// Sources : EcoLogits 2024 pour GPT-4o et Claude 3.5 — autres : extrapolés méthodologie EcoLogits
const LLM_MODELS = [
  // Confirmé EcoLogits 2024
  { name: 'GPT-4o',           provider: 'OpenAI',     hosting: 'Azure / USA',    kwh_per_req: 0.010,  carbon_gco2_kwh: 395 },
  // Extrapolé : modèle de raisonnement ~2× GPT-4o (architecture plus lourde)
  { name: 'o3',               provider: 'OpenAI',     hosting: 'Azure / USA',    kwh_per_req: 0.022,  carbon_gco2_kwh: 395 },
  // Confirmé EcoLogits 2024
  { name: 'Claude 3.5 Sonnet',provider: 'Anthropic',  hosting: 'AWS+GCP / USA',  kwh_per_req: 0.003,  carbon_gco2_kwh: 395 },
  // Extrapolé d'après Gemini 1.5 Pro × facteur taille
  { name: 'Gemini 2.5 Pro',   provider: 'Google',     hosting: 'GCP / USA',      kwh_per_req: 0.012,  carbon_gco2_kwh: 395 },
  // Extrapolé : Mistral Large ~3× Mistral 7B, hébergé Azure Paris (mix FR ~88 gCO₂/kWh)
  { name: 'Mistral Large 2',  provider: 'Mistral AI', hosting: 'Azure / France', kwh_per_req: 0.009,  carbon_gco2_kwh: 88  },
];
// Note : Meta/Llama non inclus — hébergement variable (self-hosted)
// CO₂/req = kwh_per_req × carbon_gco2_kwh (calculé dans region-compare.js)

// ------------------------------------------------------------
// Énergie annuelle (kWh/an) → foyers ou ville
// ------------------------------------------------------------
function getEnergyFoyersEquivalence(kwh_annual) {
  if (!kwh_annual || kwh_annual <= 0) return null;
  const foyers = kwh_annual / ENERGY_KWH_FOYER_YEAR;
  if (foyers >= 1_000_000) {
    return {
      icon: '🏙️',
      text: `Consommation de ${formatEq(foyers / 1_000_000 * 1e6)} foyers (≈ une métropole)`,
      shortText: `≈ ${formatEq(foyers)} foyers`,
      foyers: Math.round(foyers),
    };
  }
  return {
    icon: '🏠',
    text: `Consommation annuelle de ${formatEq(foyers)} foyers français`,
    shortText: `≈ ${formatEq(foyers)} foyers`,
    foyers: Math.round(foyers),
  };
}

// ------------------------------------------------------------
// CO2 (tonnes/an) → habitants équivalents
// ------------------------------------------------------------
function getCO2InhabitantsEquivalence(tonnes) {
  if (!tonnes || tonnes <= 0) return null;
  const habitants = tonnes / CO2_T_PER_PERSON_FR;
  return {
    icon: '👤',
    text: `Équivalent aux émissions annuelles de ${formatEq(habitants)} Français`,
    shortText: `≈ ${formatEq(habitants)} habitants/an`,
    habitants: Math.round(habitants),
  };
}

// ------------------------------------------------------------
// Streaming : kWh → heures Netflix HD équivalentes
// ------------------------------------------------------------
function getStreamingEquivalence(kwh) {
  if (!kwh || kwh <= 0) return null;
  const heures = kwh / ENERGY_KWH_STREAMING_H;
  const jours = heures / 24;
  if (jours >= 365) {
    return {
      icon: '📺',
      text: `${formatEq(jours / 365)} années de streaming HD en continu`,
      shortText: `≈ ${formatEq(jours / 365)} ans de Netflix`,
    };
  }
  if (jours >= 1) {
    return {
      icon: '📺',
      text: `${formatEq(jours)} jours de streaming HD en continu`,
      shortText: `≈ ${formatEq(jours)}j Netflix`,
    };
  }
  return {
    icon: '📺',
    text: `${formatEq(heures)} heures de streaming HD`,
    shortText: `≈ ${formatEq(heures)}h Netflix`,
  };
}

// ------------------------------------------------------------
// CO2 d'une requête LLM (grammes) → km en voiture ou secondes streaming
// ------------------------------------------------------------
function getLLMCO2Equivalence(gco2) {
  if (!gco2 || gco2 <= 0) return null;
  const km = (gco2 / 1000) / CO2_KG_PER_KM_CAR;
  if (km >= 1) {
    return {
      icon: '🚗',
      text: `Équivalent à ${km.toFixed(1)} km en voiture`,
      shortText: `≈ ${km.toFixed(1)} km voiture`,
    };
  }
  const metres = km * 1000;
  if (metres >= 10) {
    return {
      icon: '🚗',
      text: `Équivalent à ${Math.round(metres)} mètres en voiture`,
      shortText: `≈ ${Math.round(metres)} m voiture`,
    };
  }
  // Très faible : convertir en secondes de streaming (≈ 0.036 kWh/h, ~10 g CO2 en mix EU)
  const kwhLLM = gco2 / 395; // estimation mix US moyen
  const secStreaming = (kwhLLM / ENERGY_KWH_STREAMING_H) * 3600;
  return {
    icon: '📺',
    text: `Équivalent à ${Math.round(secStreaming)} secondes de streaming HD`,
    shortText: `≈ ${Math.round(secStreaming)}s Netflix`,
  };
}

// ------------------------------------------------------------
// Attacher un tooltip [?] à un élément DOM
// ------------------------------------------------------------
function createEquivalenceTooltip(parentEl, equiv) {
  if (!parentEl || !equiv) return;
  const badge = document.createElement('span');
  badge.className = 'equiv-badge';
  badge.textContent = equiv.icon + ' ' + equiv.shortText;
  badge.title = equiv.text;
  parentEl.appendChild(badge);
}
