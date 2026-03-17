# Sources de données — DataCenter Impact Map

Ce document recense toutes les sources de données utilisées dans le projet, leur rôle, leur mode d'accès et leur statut.

> **Règle de mise à jour** : toute nouvelle source intégrée dans les scripts, le GeoJSON ou l'interface doit être ajoutée ici **avant** le merge.

---

## 1. Localisation des datacenters

### OpenStreetMap — Overpass API
| Champ | Valeur |
|---|---|
| **Rôle** | Source primaire de localisation : ~2 600 datacenters mondiaux |
| **Script** | `scripts/fetch_osm.py` |
| **Sortie** | `data/raw/datacenters_osm.geojson` |
| **Accès** | API publique gratuite — `https://overpass-api.de/api/interpreter` |
| **Licence** | ODbL (Open Database Licence) — attribution requise |
| **Fréquence** | Extraction ponctuelle, re-run recommandé tous les 6 mois |
| **Tags ciblés** | `facility=data_center`, `building=data_center`, `telecom=data_center`, `man_made=data_center` |
| **Mise à jour** | 2024-01 |

---

## 2. Intensité carbone de l'électricité

### Our World in Data (OWID) — Energy Dataset
| Champ | Valeur |
|---|---|
| **Rôle** | Source principale d'intensité carbone + mix électrique détaillé par pays |
| **Script** | `scripts/fetch_carbon.py` |
| **Sortie** | `data/raw/carbon_intensity.json` |
| **URL** | `https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv` |
| **Licence** | Creative Commons BY 4.0 — attribution requise |
| **Colonnes extraites** | `carbon_intensity_elec`, `renewables_share_elec`, `low_carbon_share_elec`, `nuclear_share_elec`, `hydro_share_elec`, `wind_share_elec`, `solar_share_elec`, `biofuel_share_elec`, `other_renewables_share_elec_exc_biofuel`, `gas_share_elec`, `coal_share_elec`, `oil_share_elec` |
| **Usage UI** | Popup datacenter : barre de mix empilée + légende par source, comparaison réseau réel vs engagement opérateur |
| **Années** | Valeurs ≥ 2020, plus récente retenue par pays |
| **Couverture** | ~53 pays ISO2 |
| **Note fiabilité** | Mix réseau national réel — distinct des achats REC/PPA déclarés par les opérateurs |

### IEA — Electricity 2024 (fallback)
| Champ | Valeur |
|---|---|
| **Rôle** | Valeurs de fallback si OWID ne couvre pas le pays |
| **Script** | `scripts/fetch_carbon.py` (constante `FALLBACK_INTENSITY`) |
| **Accès** | Données codées en dur d'après rapports IEA publics |
| **Référence** | IEA, *Electricity 2024*, Paris — [iea.org](https://www.iea.org/reports/electricity-2024) |
| **Couverture** | 50 pays |

### Ember — Global Electricity Review 2024 (fallback)
| Champ | Valeur |
|---|---|
| **Rôle** | Complément IEA pour pays non couverts |
| **Script** | `scripts/fetch_carbon.py` (constante `FALLBACK_INTENSITY`) |
| **Accès** | Données codées en dur d'après rapports Ember publics |
| **Référence** | Ember, *Global Electricity Review 2024* — [ember-energy.org](https://ember-climate.org/insights/research/global-electricity-review-2024/) |
| **Valeur mondiale par défaut** | 475 gCO₂/kWh |

### Electricity Maps API v3 (sandbox)
| Champ | Valeur |
|---|---|
| **Rôle** | Mix énergétique en temps réel par zone (carbon intensity + power breakdown) — en attente token production |
| **Script** | `scripts/fetch_electricitymaps.py` |
| **Sortie** | `data/raw/electricity_maps_live.json` |
| **Accès** | API REST — `https://api.electricitymap.org/v3/` — token sandbox uniquement |
| **Licence** | Propriétaire — plan commercial requis pour données réelles |
| **Statut** | ⚠ SANDBOX : données intentionnellement inexactes pour les tests |
| **Données calculées** | `renewable_pct` (vent+solaire+hydro+biomasse), `low_carbon_pct` (+ nucléaire) |
| **Alternative gratuite** | Colonnes OWID `*_share_elec` utilisées en production |

---

## 3. Stress hydrique

### WRI Aqueduct 4.0 — Baseline Annual
| Champ | Valeur |
|---|---|
| **Rôle** | Niveau de stress hydrique par bassin versant (jointure spatiale avec chaque datacenter) |
| **Script** | `scripts/fetch_water_stress.py` |
| **Sortie** | `data/processed/water_stress.geojson` |
| **URL** | `https://files.wri.org/aqueduct/aqueduct40_baseline_annual_y2023m07d05.zip` (~500 MB) |
| **Licence** | Creative Commons BY 4.0 |
| **Référence** | Kuzma et al. (2023), *Aqueduct 4.0*, WRI — [wri.org/aqueduct](https://www.wri.org/data/aqueduct-water-risk-atlas) |
| **Colonne clé** | `bws_label` (Baseline Water Stress) |
| **Niveaux** | `low`, `low-medium`, `medium-high`, `high`, `extremely-high`, `arid`, `unknown` |
| **Fallback** | Polygones bbox approximatifs générés si WRI non disponible (`source: fallback_approximation`) |

---

## 4. Données ESG des opérateurs (dataset manuel)

### Rapports ESG des hyperscalers
| Champ | Valeur |
|---|---|
| **Rôle** | PUE vérifiés, capacité MW, % renouvelables, engagements net zéro par site connu |
| **Script** | `scripts/enrich_data.py` |
| **Fichier source** | `data/raw/major_datacenters.json` |
| **Mise à jour** | 2024-01 |

Rapports de référence :

| Opérateur | Rapport | Année |
|---|---|---|
| Google | [Environmental Report 2024](https://sustainability.google/reports/google-2024-environmental-report/) | 2024 |
| Microsoft | [ESG Report 2024](https://www.microsoft.com/en-us/corporate-responsibility/sustainability) | 2024 |
| Amazon (AWS) | [Sustainability Report 2023](https://sustainability.aboutamazon.com/) | 2023 |
| Meta | [Sustainability Report 2023](https://sustainability.fb.com/) | 2023 |
| OVHcloud | [ESG Report 2023](https://corporate.ovhcloud.com/en/sustainability/) | 2023 |
| Equinix | [ESG Report 2023](https://www.equinix.com/about/environmental-social-governance) | 2023 |
| Digital Realty | *(valeurs par défaut industrie)* | 2023 |

### Uptime Institute — Global Data Center Survey 2024
| Champ | Valeur |
|---|---|
| **Rôle** | PUE moyen mondial par défaut (1.58) utilisé quand aucune donnée opérateur n'est disponible |
| **Référence** | Uptime Institute, *Annual Global Data Center Survey 2024* |
| **Valeur** | PUE par défaut = **1.58** |

---

## 5. Statistiques mondiales & modèles

### IEA — Energy and AI 2025
| Champ | Valeur |
|---|---|
| **Rôle** | Statistiques de référence sur la demande électrique des datacenters et l'IA |
| **Utilisation** | Articles du panneau "Comprendre l'impact" + chiffres UI |
| **Référence** | IEA, *Energy and AI*, Paris, 2025 — [iea.org/energy-and-ai](https://www.iea.org/reports/energy-and-ai) |
| **Chiffres clés** | 1–2% conso électrique mondiale, +40% capacité DC prévu 2026 |

### Boavizta — Modèles d'empreinte numérique
| Champ | Valeur |
|---|---|
| **Rôle** | Modèles de calcul empreinte environnementale open source (référence méthodologique) |
| **Utilisation** | Formule CO₂, ratio eau 1.8 L/kWh |
| **Référence** | [boavizta.org](https://boavizta.org/) |

---

## 6. Impact environnemental des modèles LLM

### EcoLogits — Methodology (ecologits.ai)
| Champ | Valeur |
|---|---|
| **Rôle** | Énergie par requête LLM et localisation des datacenters par provider |
| **Usage** | `js/equivalences.js` (LLM_MODELS), `js/region-compare.js` |
| **URL** | https://ecologits.ai/latest/methodology/llm_inference/ |
| **Licence** | Publique (méthodologie open source) |
| **Données extraites** | kwh_per_req par modèle (~500 tokens, batch=1), PUE et pays d'hébergement par provider |
| **Providers couverts** | OpenAI (Azure/USA), Anthropic (AWS+GCP/USA), Google (GCP/USA), Mistral (Azure/Suède), Cohere (GCP/USA) |
| **Exclusions** | Meta/Llama : hébergement variable (self-hosted), non inclus |
| **Mise à jour** | 2024 |

---

## 7. Modèles de calcul

### Formule CO₂ annuel
```
CO₂ (t/an) = Capacité (MW) × PUE × 8 760 h × Intensité carbone (gCO₂/kWh) / 10⁶
```

### Formule consommation eau annuelle
```
Eau (m³/an) = Capacité (MW) × 1 000 × PUE × 8 760 h × 1.8 L/kWh / 1 000
```

### Valeurs par défaut (quand données manquantes)
| Paramètre | Valeur | Source |
|---|---|---|
| PUE | 1.58 | Uptime Institute 2024 |
| Capacité | 20 MW | Médiane petits DCs (estimation IEA) |
| Intensité carbone | 475 gCO₂/kWh | IEA moyenne mondiale 2023 |
| Ratio eau | 1.8 L/kWh | Boavizta / Lawrence Berkeley National Lab |

---

## 8. Technologies cartographiques

| Outil | Version | Rôle |
|---|---|---|
| Mapbox GL JS | v3.3.0 | Moteur de carte interactive |
| Mapbox Styles | `dark-v11`, `light-v11` | Fonds de carte |

---

## Ajout d'une nouvelle source

Pour intégrer une nouvelle source de données :

1. **Créer ou modifier le script** dans `scripts/` pour télécharger/traiter les données
2. **Ajouter une section** dans ce fichier `SOURCES.md` avec les champs : Rôle, Script, Sortie, URL/Référence, Licence, Fréquence de mise à jour
3. **Mettre à jour** le tableau des sources dans `CLAUDE.md` (section "Sources de données")
4. **Documenter** les nouvelles propriétés GeoJSON dans `CLAUDE.md` (section "Format GeoJSON")
