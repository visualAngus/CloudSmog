# FAQ Jury — CloudSmog / DataCenter Impact Map
*Hackathon Hack for Good · Défi ADEME*

---

## 🗺️ Le projet

### C'est quoi exactement ?
Une cartographie interactive mondiale de l'empreinte environnementale des datacenters. On visualise en temps réel le CO₂, la consommation d'eau et le mix énergétique de 270+ datacenters hébergeant de l'IA — avec des équivalences du quotidien pour rendre les chiffres concrets.

### Quel est le message central ?
Quand Google annonce "100% renouvelable", c'est vrai sur le papier (via des certificats REC/PPA) mais le datacenter consomme le même réseau électrique que tout le monde. En Virginie (USA), ce réseau est à 22% renouvelable. En Pologne, à 17%. La carte montre cet écart — c'est le "discours vs réalité".

### Pourquoi l'IA spécifiquement ?
Une requête à GPT-4o consomme ~10 Wh — l'équivalent de laisser une ampoule LED allumée 1 heure. Multiplié par 1,2 milliard de requêtes par jour dans le monde (IEA 2025), ça représente 877 TWh/an pour les datacenters IA — soit 1,8× la consommation électrique totale de la France.

---

## 📊 Les données

### D'où viennent les localisations des datacenters ?
**OpenStreetMap** via l'API Overpass — ~2 600 datacenters extraits avec les tags `facility=data_center`, `building=data_center`, etc. C'est une extraction communautaire, libre (licence ODbL), mise à jour en continu par les contributeurs OSM.

### Comment le CO₂ est-il calculé ?
Formule : `CO₂ (t/an) = Capacité (MW) × PUE × 8 760h × Intensité carbone (gCO₂/kWh) ÷ 10⁶`

- **Capacité** : données OSM ou rapports ESG des opérateurs
- **PUE** : rapport ESG vérifié (Google 1.10, AWS 1.15…) ou moyenne mondiale IEA 1.58 par défaut
- **Intensité carbone** : Our World in Data (OWID), données IRENA/Ember 2022-2023

### D'où vient le mix électrique par pays (nucléaire, éolien, solaire…) ?
**Our World in Data** — Energy Dataset, lui-même agrégé depuis IRENA, Ember Global Electricity Review et IEA. On extrait 12 colonnes : `nuclear_share_elec`, `wind_share_elec`, `solar_share_elec`, `coal_share_elec`, etc. Licence CC BY 4.0, données 2022-2025.

### Et la consommation d'eau ?
`Eau (m³/an) = Capacité (MW) × 1 000 × PUE × 8 760h × 1,8 L/kWh ÷ 1 000`

Le ratio 1,8 L/kWh vient de **Boavizta**, référence open source française pour l'empreinte numérique. Le stress hydrique par localisation (faible / moyen / critique) vient de **WRI Aqueduct 4.0** — la base de référence mondiale du World Resources Institute.

### Les données des grands opérateurs (Google, AWS…) sont-elles vérifiées ?
Oui pour 56 datacenters — marqués `✓ VÉRIFIÉ ESG`. Les chiffres viennent directement des rapports de développement durable 2023-2024 :
- Google Environmental Report 2024
- Microsoft ESG Report 2024
- Amazon Sustainability Report 2023
- Meta Sustainability Report 2023
- OVHcloud ESG Report 2023, Equinix ESG 2023

Les ~2 550 autres sont **estimés** (signalé `~ ESTIMÉ`) avec les valeurs par défaut sectorielles.

### D'où viennent les chiffres sur l'impact des LLMs par requête ?
**EcoLogits** (ecologits.ai) — seule source open source qui publie une méthodologie détaillée pour calculer l'énergie par requête LLM. Les valeurs sont confirmées pour GPT-4o et Claude 3.5 Sonnet, extrapolées pour les autres modèles selon la même méthodologie (taille du modèle, batch size, infrastructure).

---

## 🔬 Fiabilité et limites

### À quel point les données sont-elles fiables ?
| Donnée | Fiabilité | Source |
|--------|-----------|--------|
| Localisation des DCs | ★★★★☆ | OSM communautaire, quelques manques |
| Intensité carbone par pays | ★★★★★ | OWID/IRENA, données officielles |
| Mix électrique par source | ★★★★★ | OWID/Ember, données officielles |
| PUE grands opérateurs | ★★★★★ | Rapports ESG publiés |
| PUE petits DCs | ★★☆☆☆ | Défaut IEA 1.58 — estimation |
| Capacité grands opérateurs | ★★★★★ | Rapports vérifiés |
| Capacité petits DCs | ★★☆☆☆ | Défaut 20 MW — estimation |
| Impact LLM/requête | ★★★☆☆ | EcoLogits, extrapolations |

### Le "100% renouvelable" des opérateurs, c'est du greenwashing ?
Pas forcément du greenwashing au sens légal — mais c'est trompeur. Ils achètent des **certificats d'énergie renouvelable (REC/PPA)** en volume annuel équivalent à leur consommation. Ça finance des projets renouvelables, ce qui est bien. Mais ça ne signifie pas que chaque kWh consommé est "vert" : à 2h du matin en hiver en Pologne, le datacenter tourne au charbon, compensé par du solaire espagnol vendu en journée d'été. Notre carte montre le mix **réel** du réseau vs le mix **déclaré** par l'opérateur.

### Pourquoi ne pas utiliser l'API Electricity Maps en temps réel ?
On a intégré le script de collecte (`scripts/fetch_electricitymaps.py`). Mais l'API est **payante** en production (plan commercial requis). En sandbox, les données sont intentionnellement inexactes pour les tests. On utilise donc les données OWID (annuelles mais officielles) comme source principale, avec la structure prête à basculer sur Electricity Maps dès qu'un token de production est disponible.

### Les 877 TWh/an, c'est réaliste ?
C'est une **borne haute** pour les datacenters IA visibles sur la carte. L'IEA estime que les datacenters mondiaux (tous types) ont consommé ~460 TWh en 2022, avec une projection à 800+ TWh d'ici 2026 en incluant l'essor de l'IA. Notre chiffre couvre les DCs identifiés avec une capacité connue — cohérent avec ces projections.

---

## 🛠️ Technique

### Pourquoi pas une vraie base de données ?
Le défi ADEME demande une solution légère et déployable. L'architecture **100% statique** (HTML + GeoJSON + JS) se déploie en 1 clic sur GitHub Pages, sans serveur, sans coûts, sans maintenance. Le GeoJSON (~2,2 Mo) est généré une fois par les scripts Python et servi tel quel.

### Comment le pipeline de données fonctionne-t-il ?
```
OSM → fetch_osm.py → datacenters_osm.geojson
OWID → fetch_carbon.py → carbon_intensity.json (avec mix)
WRI → fetch_water_stress.py → water_stress.geojson
         ↓
enrich_data.py → enriched.geojson (PUE, CO₂, eau, mix électrique)
         ↓
merge.py → datacenters.geojson (fusion OSM + dataset manuel)
         ↓
tag_ai.py → tagage hosts_ai (filtre IA actif par défaut)
```

### Comment sont calculées les équivalences (foyers, vols, piscines) ?
Constantes ADEME :
- 120 gCO₂/km voiture thermique
- 1 700 kg CO₂ par vol Paris–New York aller simple
- 4 500 kWh/an par foyer français moyen
- 8,9 t CO₂/an par habitant français
- 2 500 m³ par piscine olympique

### La carte peut-elle être mise à jour facilement ?
Oui. Il suffit de relancer les scripts Python dans l'ordre du pipeline ci-dessus. Les données OSM peuvent être réextractées, OWID publie son dataset mensuellement. Le tout prend ~10 minutes.

---

## 🎯 Impact et pertinence

### En quoi ça répond au défi ADEME ?
L'ADEME cherche à **rendre visible** l'impact environnemental du numérique. Notre outil :
1. **Localise** concrètement les infrastructures (pas des stats abstraites)
2. **Chiffre** en équivalences quotidiennes compréhensibles par tous
3. **Révèle** l'écart entre engagements ESG et réalité du réseau électrique
4. **Éduque** sur le coût réel de l'IA (une requête ChatGPT = X km en voiture)

### Qui peut utiliser cet outil ?
- **Grand public** : comprendre d'où vient l'impact de l'IA
- **Journalistes** : données sourcées pour enquêtes sur le greenwashing tech
- **Décideurs** : localiser de nouveaux DCs dans des zones à faible intensité carbone
- **Chercheurs** : base de données ouverte et méthodologie transparente

### Quelles sont les prochaines étapes si le projet continue ?
1. Token Electricity Maps en production → données temps réel par zone
2. Intégration timeline de croissance (2010→2030) depuis l'IEA
3. API publique pour que d'autres outils consomment les données
4. Extension aux datacenters non-IA (edge computing, cloud généraliste)
