# DataCenter Impact Map — Cartographie de l'empreinte environnementale des datacenters mondiaux

**Projet réalisé dans le cadre du hackathon Hack for Good / Défi ADEME.**

→ [Voir la carte en ligne](https://visualangus.github.io/CloudSmog/)

---

## Description

Ce projet cartographie l'empreinte environnementale (CO₂, eau, stress hydrique) de plus de **2 600 datacenters mondiaux**, enrichis à partir de données publiques et de rapports de développement durable des opérateurs.

L'objectif est de rendre visible l'impact réel de l'infrastructure numérique mondiale, souvent invisible pour le grand public et les décideurs.

---

## Contenu du dépôt

```
├── index.html                          ← Application cartographique (Mapbox GL JS)
├── style.css                           ← Styles
├── SOURCES.md                          ← Documentation complète des sources
├── js/                                 ← Modules JavaScript (layers, popups, filtres…)
├── data/
│   ├── datacenters.geojson             ← ⭐ Jeu de données principal (~2 600 datacenters)
│   ├── submarine-cables.geojson        ← Câbles sous-marins (source TeleGeography)
│   ├── raw/                            ← Données brutes (OSM, carbone, opérateurs)
│   └── processed/                      ← Données intermédiaires
├── scripts/                            ← Scripts Python de collecte et d'enrichissement
└── docs/                               ← Document de réalisation + FAQ jury
```

---

## Jeu de données principal : `data/datacenters.geojson`

Format **GeoJSON** (WGS 84), un Feature par datacenter.

### Propriétés disponibles

| Champ | Type | Description |
|---|---|---|
| `name` | string | Nom du datacenter |
| `operator` | string | Opérateur (Google, AWS, Azure, Meta, OVH, Equinix…) |
| `capacity_mw` | number | Puissance installée en MW (estimée si absente) |
| `pue` | number | Power Usage Effectiveness (1.0 = idéal, 1.58 = moyenne mondiale) |
| `carbon_intensity_gco2_kwh` | number | Intensité carbone du réseau électrique local (gCO₂/kWh) |
| `co2_annual_tonnes` | number | Émissions annuelles estimées (tCO₂/an) |
| `water_withdrawal_m3_year` | number | Consommation d'eau estimée (m³/an) |
| `water_stress_level` | string | Niveau de stress hydrique : `low`, `medium`, `high`, `extremely high` |
| `energy_source_pct_renewable` | number | Part d'énergie renouvelable déclarée (%) |
| `operator_commitment_net_zero` | string | Engagement net zéro déclaré par l'opérateur |
| `is_ai_datacenter` | boolean | Héberge des workloads IA identifiés |
| `source` | string | Source de la donnée |
| `last_updated` | string | Date de dernière mise à jour |

### Formule de calcul CO₂

```
CO₂ (t/an) = Capacité (MW) × PUE × 8 760 h × Intensité carbone (gCO₂/kWh) / 10⁶
```

### Valeurs par défaut (données manquantes)

| Variable | Valeur | Source |
|---|---|---|
| PUE | 1,58 | Uptime Institute Survey 2024 (moyenne mondiale) |
| Capacité | 20 MW | Médiane des petits datacenters |
| Intensité carbone | Valeur pays | OWID → IEA → Ember (par ordre de priorité) |
| Consommation eau | 1,8 L/kWh | Boavizta |

---

## Licences des données

| Source | Licence |
|---|---|
| OpenStreetMap (localisation) | **ODbL** — attribution obligatoire : © OpenStreetMap contributors |
| Our World in Data (carbone) | CC BY 4.0 |
| WRI Aqueduct 4.0 (stress hydrique) | CC BY 4.0 |
| Ember Global Electricity Review | CC BY 4.0 |
| Rapports ESG opérateurs (Google, AWS, Azure, Meta, OVH, Equinix) | Usage public, données officielles |

Le jeu de données compilé est publié sous licence **CC BY 4.0** — attribution requise.

---

## Reproduire les données

Prérequis : Python 3.10+, pip

```bash
pip install requests pandas geopandas
```

```bash
python scripts/fetch_osm.py        # Extraction OpenStreetMap (~2 600 datacenters)
python scripts/fetch_carbon.py     # Intensité carbone par pays (OWID)
python scripts/fetch_water_stress.py  # Stress hydrique WRI Aqueduct
python scripts/enrich_data.py      # Enrichissement (PUE, CO₂, eau)
python scripts/merge.py            # Fusion → data/datacenters.geojson
python scripts/tag_ai.py           # Tagage des datacenters IA
```

---

## Lancer l'application en local

```bash
python -m http.server 8000
# Ouvrir http://localhost:8000
```

> Un token [Mapbox](https://mapbox.com) est nécessaire. Renseignez-le dans `js/main.js`.

---

## Documentation complète des sources

Voir [SOURCES.md](SOURCES.md) pour la documentation exhaustive de chaque source (rôle, accès, licence, fréquence de mise à jour).

---

## Contexte

Projet réalisé pour le **Défi ADEME** lors du hackathon **Hack for Good 2025**.
Thématique : *Rendre visible l'empreinte environnementale du numérique*.

Document de réalisation complet : [`docs/DataCenter_Impact_Map_Realisation.pdf`](docs/DataCenter_Impact_Map_Realisation.pdf)
