/* ============================================================
   stats.js — Calcul et affichage des statistiques globales
   ============================================================ */

function initStats(geojson) {
  const features = geojson.features || [];
  updateStats(features);
}

function updateStats(features) {
  const total = features.length;

  // Somme CO2 en mégatonnes
  const totalCo2 = features.reduce((acc, f) => {
    return acc + (f.properties.co2_annual_tonnes || 0);
  }, 0);
  const co2Mt = totalCo2 / 1_000_000; // Mégatonnes

  // Somme eau en km³
  const totalWater = features.reduce((acc, f) => {
    return acc + (f.properties.water_withdrawal_m3_year || 0);
  }, 0);
  const waterKm3 = totalWater / 1_000_000_000; // km³

  // Consommation annuelle réelle = capacité × PUE × 8760h → TWh
  const totalEnergyKwh = features.reduce((acc, f) => {
    const mw  = f.properties.capacity_mw  || 0;
    const pue = f.properties.pue          || 1.58;
    return acc + mw * pue * 8760 * 1000; // kWh/an
  }, 0);
  const energyTwh = totalEnergyKwh / 1e9; // TWh

  // Animer les compteurs
  animateCount('stat-total', total,     0, v => formatStatNum(v));
  animateCount('stat-co2',   co2Mt,     2, v => formatStatNum(v, 2));
  animateCount('stat-water', waterKm3,  3, v => formatStatNum(v, 3));
  animateCount('stat-power', energyTwh, 1, v => formatStatNum(v, 1));

  // Équivalences sous les compteurs (après animation)
  if (typeof getCO2Equivalence === 'function') {
    setTimeout(() => {
      setStatEquiv('stat-co2',   getCO2Equivalence(totalCo2));
      setStatEquiv('stat-water', getWaterEquivalence(totalWater));
      // Équivalence énergie : foyers alimentés
      if (typeof getEnergyFoyersEquivalence === 'function') {
        setStatEquiv('stat-power', getEnergyFoyersEquivalence(totalEnergyKwh));
      }
    }, 900);
  }
}

function setStatEquiv(statId, equiv) {
  if (!equiv) return;
  const statCell = document.getElementById(statId)?.closest('.stat-cell');
  if (!statCell) return;
  let equivEl = statCell.querySelector('.stat-equiv');
  if (!equivEl) {
    equivEl = document.createElement('div');
    equivEl.className = 'stat-equiv';
    statCell.appendChild(equivEl);
  }
  equivEl.textContent = equiv.icon + ' ' + equiv.shortText;
  equivEl.title = equiv.text;
}

function formatStatNum(val, decimals = 0) {
  if (val === 0) return '0';
  if (val >= 1000) return (val / 1000).toFixed(1) + 'k';
  return Number(val).toLocaleString('fr-FR', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals > 0 ? Math.min(1, decimals) : 0,
  });
}

function animateCount(elementId, target, decimals, formatter) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const duration = 800;
  const start = performance.now();
  const startVal = 0;

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Easing out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = startVal + (target - startVal) * eased;

    el.textContent = formatter(current);

    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = formatter(target);
  }

  requestAnimationFrame(step);
}
