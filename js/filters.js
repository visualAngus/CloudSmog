/* ============================================================
   filters.js — Filtres opérateur / pays / carbone / stress
   ============================================================ */

function initFilters(map, geojson) {
  const features = geojson.features || [];

  // Collecter les valeurs uniques
  const operators = [...new Set(
    features.map(f => f.properties.operator).filter(Boolean)
  )].sort();

  const countries = [...new Set(
    features.map(f => f.properties.country).filter(Boolean)
  )].sort();

  // Peupler les selects
  populateSelect('filter-operator', operators);
  populateSelect('filter-country', countries);

  // Écouteurs
  document.getElementById('filter-operator').addEventListener('change', (e) => {
    APP.filters.operator = e.target.value;
    applyFilters();
    closePopup();
  });

  document.getElementById('filter-country').addEventListener('change', (e) => {
    APP.filters.country = e.target.value;
    applyFilters();
    closePopup();
  });

  document.getElementById('filter-carbon').addEventListener('input', (e) => {
    APP.filters.carbonMax = parseInt(e.target.value, 10);
    applyFilters();
  });

  // Checkboxes stress hydrique
  document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      APP.filters.waterStress = [...document.querySelectorAll('.checkbox-group input:checked')]
        .map(el => el.value);
      // Toujours inclure "unknown" et "arid"
      if (!APP.filters.waterStress.includes('unknown')) APP.filters.waterStress.push('unknown');
      if (!APP.filters.waterStress.includes('arid'))    APP.filters.waterStress.push('arid');
      applyFilters();
    });
  });

  // Toggle IA
  document.getElementById('filter-ai').addEventListener('change', (e) => {
    APP.filters.aiOnly = e.target.checked;
    applyFilters();
    closePopup();
  });

  // Reset
  document.getElementById('reset-filters').addEventListener('click', resetFilters);

  // Toggle légende → filtre réel sur la carte par carbon_color_class
  document.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('inactive');
      // Recalculer les classes actives depuis le DOM
      APP.filters.activeClasses = [...document.querySelectorAll('.legend-item:not(.inactive)')]
        .map(el => el.dataset.class)
        .filter(Boolean);
      applyFilters();
    });
  });
}

function populateSelect(id, values) {
  const select = document.getElementById(id);
  values.forEach(val => {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = val;
    select.appendChild(option);
  });
}

function resetFilters() {
  APP.filters = {
    operator: '',
    country: '',
    carbonMax: 1000,
    waterStress: ['low', 'low-medium', 'medium-high', 'high', 'extremely-high', 'unknown', 'arid'],
    activeClasses: ['very_low', 'low', 'medium', 'high', 'very_high'],
    aiOnly: true,
  };

  document.getElementById('filter-operator').value = '';
  document.getElementById('filter-country').value  = '';

  const slider = document.getElementById('filter-carbon');
  slider.value = 1000;
  slider.dispatchEvent(new Event('input'));

  document.querySelectorAll('.checkbox-group input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
  });

  const aiCheckbox = document.getElementById('filter-ai');
  if (aiCheckbox) aiCheckbox.checked = false;

  document.querySelectorAll('.legend-item').forEach(item => {
    item.classList.remove('inactive');
  });

  applyFilters();
  if (APP.data) initStats(APP.data);
}
