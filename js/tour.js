/* ============================================================
   tour.js — Visite guidée interactive
   ============================================================ */

const TOUR_STEPS = [
  {
    target: '.hud-header',
    title: 'DataCenter Impact Map',
    text: 'Bienvenue ! Cette carte visualise l\'empreinte environnementale de 2 600+ datacenters mondiaux — CO₂, eau et capacité électrique.',
    position: 'bottom',
  },
  {
    target: '#map',
    title: 'La carte interactive',
    text: 'Chaque point lumineux est un datacenter. La couleur indique l\'intensité carbone : vert = très bas, rouge = critique. Cliquez sur un point pour voir ses détails.',
    position: 'center',
  },
  {
    target: '.legend',
    title: 'Code couleur carbone',
    text: 'Cliquez sur une catégorie pour afficher ou masquer les datacenters correspondants. Filtrez visuellement par intensité carbone.',
    position: 'right',
  },
  {
    target: '.stats-grid',
    title: 'Stats globales',
    text: 'Totaux en temps réel : CO₂ émis annuellement, eau consommée et capacité électrique des datacenters visibles après filtrage.',
    position: 'right',
  },
  {
    target: '.view-mode-toggle',
    title: 'Vue régionale',
    text: 'Basculez en vue régionale ◎ pour comparer les grandes zones géographiques. Cliquez sur une région pour zoomer et filtrer ses datacenters.',
    position: 'bottom',
  },
  {
    target: '#btn-compare',
    title: 'Comparer les régions',
    text: 'En mode région, ce bouton ouvre un panel de comparaison : classement des zones par intensité carbone, PUE, consommation eau et impact des requêtes IA. Cliquez sur une carte pour centrer la vue.',
    position: 'bottom',
    onEnter: () => {
      // S'assurer qu'on est en mode région pour que le bouton soit visible
      if (APP.viewMode !== 'region') switchViewMode('region');
    },
  },
  {
    target: '#btn-expert',
    title: 'Mode Expert',
    text: 'Activez le mode Expert pour accéder aux filtres avancés (pays, carbone, stress hydrique), au panneau Discours vs Réalité et aux articles explicatifs.',
    position: 'bottom',
  },
  {
    target: '.right_menu',
    title: 'Comprendre l\'impact',
    text: 'Ce panneau contient des articles pour comprendre les enjeux : qu\'est-ce qu\'un datacenter, l\'empreinte de l\'IA, la guerre de l\'eau, la souveraineté numérique…',
    position: 'left',
    alignY: 'center',
    onEnter: () => {
      // Ouvrir le menu droit pendant cette étape
      const menu = document.querySelector('.right_menu');
      if (menu && !menu.classList.contains('open')) menu.classList.add('open');

      // Repositionner après l'animation d'ouverture du panneau
      setTimeout(() => {
        if (APP.tourActive) positionTooltip(TOUR_STEPS[tourStep]);
      }, 280);
    },
    onLeave: () => {
      // Refermer le menu droit après l'étape
      const menu = document.querySelector('.right_menu');
      if (menu) menu.classList.remove('open');
    },
  },
  {
    target: '#btn-tour',
    title: 'Rejouer la visite',
    text: 'Vous pouvez retrouver cette visite guidée à tout moment en cliquant sur ce bouton ❓ dans le coin du header. Bonne exploration !',
    position: 'bottom',
  },
];

let tourStep = 0;

function initTour() {
  const btnTour = document.getElementById('btn-tour');
  const btnBannerStart = document.getElementById('tour-banner-start');
  const btnBannerClose = document.getElementById('tour-banner-close');
  const btnSkip = document.getElementById('tour-skip');
  const btnNext = document.getElementById('tour-next');
  const totalEl = document.getElementById('tour-total');

  if (totalEl) totalEl.textContent = TOUR_STEPS.length;

  if (btnTour) btnTour.addEventListener('click', startTour);
  if (btnBannerStart) btnBannerStart.addEventListener('click', () => {
    hideBanner();
    startTour();
  });
  if (btnBannerClose) btnBannerClose.addEventListener('click', () => {
    hideBanner();
    markTourDone();
  });
  if (btnSkip) btnSkip.addEventListener('click', endTour);
  if (btnNext) btnNext.addEventListener('click', nextTourStep);

  setTimeout(startTour, 500);
}

function showBanner() {
  const banner = document.getElementById('tour-banner');
  if (banner) banner.classList.remove('hidden');
}

function hideBanner() {
  const banner = document.getElementById('tour-banner');
  if (banner) banner.classList.add('hidden');
}

function startTour() {
  APP.tourActive = true;
  hideBanner();
  tourStep = 0;
  showTourStep(tourStep);
  document.getElementById('tour-overlay').classList.remove('hidden');
}

function showTourStep(index) {
  // Appeler onLeave de l'étape précédente
  const prevStep = TOUR_STEPS[index - 1];
  if (prevStep && prevStep.onLeave) prevStep.onLeave();

  const step = TOUR_STEPS[index];
  if (!step) { endTour(); return; }

  // Appeler onEnter de l'étape courante
  if (step.onEnter) step.onEnter();

  document.getElementById('tour-current').textContent = index + 1;
  document.getElementById('tour-title').textContent = step.title;
  document.getElementById('tour-text').textContent = step.text;

  // Mettre à jour le bouton "Suivant / Terminer"
  const btnNext = document.getElementById('tour-next');
  btnNext.textContent = index === TOUR_STEPS.length - 1 ? 'Terminer ✓' : 'Suivant →';

  positionTooltip(step);
}

function positionTooltip(step) {
  const tooltip = document.querySelector('.tour-tooltip');
  if (!tooltip) return;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

  if (step.position === 'center' || step.target === '#map') {
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
    tooltip.style.right = '';
    tooltip.style.bottom = '';
    return;
  }

  const target = document.querySelector(step.target);
  if (!target) {
    tooltip.style.top = '50%';
    tooltip.style.left = '50%';
    tooltip.style.transform = 'translate(-50%, -50%)';
    return;
  }

  const rect = target.getBoundingClientRect();
  tooltip.style.transform = '';

  const tooltipW = 360;
  const tooltipH = tooltip.offsetHeight || 240;
  const centeredTop = rect.top + (rect.height / 2) - (tooltipH / 2);

  if (step.position === 'bottom') {
    tooltip.style.top = (rect.bottom + 12) + 'px';
    tooltip.style.left = clamp(rect.left, 8, window.innerWidth - tooltipW - 8) + 'px';
    tooltip.style.right = '';
    tooltip.style.bottom = '';
  } else if (step.position === 'right') {
    tooltip.style.top = (step.alignY === 'center'
      ? clamp(centeredTop, 8, window.innerHeight - tooltipH - 8)
      : Math.max(8, rect.top)) + 'px';
    tooltip.style.left = (rect.right + 12) + 'px';
    tooltip.style.right = '';
    tooltip.style.bottom = '';
  } else if (step.position === 'left') {
    tooltip.style.top = (step.alignY === 'center'
      ? clamp(centeredTop, 8, window.innerHeight - tooltipH - 8)
      : Math.max(8, rect.top)) + 'px';
    tooltip.style.left = Math.max(8, rect.left - tooltipW - 12) + 'px';
    tooltip.style.right = '';
    tooltip.style.bottom = '';
  } else {
    tooltip.style.top = (rect.bottom + 12) + 'px';
    tooltip.style.left = Math.max(8, rect.left) + 'px';
    tooltip.style.right = '';
    tooltip.style.bottom = '';
  }
}

function nextTourStep() {
  tourStep++;
  if (tourStep >= TOUR_STEPS.length) {
    endTour();
  } else {
    showTourStep(tourStep);
  }
}

function endTour() {
  // Appeler onLeave de la dernière étape si elle existe
  const lastStep = TOUR_STEPS[tourStep];
  if (lastStep && lastStep.onLeave) lastStep.onLeave();

  APP.tourActive = false;
  document.getElementById('tour-overlay').classList.add('hidden');
  markTourDone();
}

function markTourDone() {
  localStorage.setItem('tour_done', '1');
}

// Démarrer l'initialisation du tour après chargement de la carte
document.addEventListener('DOMContentLoaded', () => {
  initTour();
});
