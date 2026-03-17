#!/usr/bin/env python3
"""
Fusion finale de toutes les sources de données en un seul GeoJSON Mapbox.

Priorité des sources (décroissante) :
  1. Dataset manuel major_datacenters.json — données vérifiées
  2. data/processed/enriched.geojson — OSM enrichi
  3. Fusion des deux avec déduplication spatiale (< 500m)

Sortie : data/datacenters.geojson (fichier final pour Mapbox)
"""

import json
import math
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent.parent / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"

INPUT_MAJOR = RAW_DIR / "major_datacenters.json"
INPUT_ENRICHED = PROCESSED_DIR / "enriched.geojson"
INPUT_CARBON = RAW_DIR / "carbon_intensity.json"
INPUT_WATER = PROCESSED_DIR / "water_stress.geojson"
OUTPUT_FILE = DATA_DIR / "datacenters.geojson"

DEDUP_DISTANCE_M = 500      # Distance en mètres pour considérer deux points identiques
MIN_COMPLETENESS_SCORE = 0  # Garder tous les points (filtre qualité optionnel)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance haversine entre deux points en mètres."""
    R = 6_371_000  # Rayon de la Terre en mètres
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def completeness_score(props: dict) -> int:
    """Score de complétude d'un datacenter (nombre de champs renseignés)."""
    key_fields = [
        "name", "operator", "capacity_mw", "pue", "carbon_intensity_gco2_kwh",
        "co2_annual_tonnes", "water_withdrawal_m3_year", "water_stress_level",
        "energy_source_pct_renewable", "operator_commitment_net_zero",
    ]
    score = 0
    for f in key_fields:
        v = props.get(f)
        if v is not None and v != "" and v != "unknown":
            score += 1
    # Bonus si données vérifiées
    if props.get("data_quality") == "verified":
        score += 3
    return score


def load_json(path: Path) -> Optional[dict]:
    if not path.exists():
        print(f"  Fichier manquant : {path}")
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def major_to_feature(dc: dict, carbon_db: dict, water_index: list) -> dict:
    """Convertit un enregistrement du dataset manuel en feature GeoJSON."""
    lat = dc.get("lat", 0)
    lon = dc.get("lon", 0)
    country = dc.get("country", "")
    entry = carbon_db.get(country, {})
    carbon = entry.get("carbon_intensity_gco2_kwh", 475) if isinstance(entry, dict) else float(entry)

    pue = dc.get("pue", 1.58)
    capacity_mw = dc.get("capacity_mw", 20.0)
    co2 = round(capacity_mw * pue * 8760 * carbon / 1_000_000)
    water_m3 = round(capacity_mw * 1000 * pue * 8760 * 1.8 / 1000)

    # Stress hydrique
    water_stress = "unknown"
    if water_index:
        water_stress = lookup_water_stress(lon, lat, water_index)

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "name": dc.get("name", ""),
            "operator": dc.get("operator", ""),
            "country": country,
            "city": dc.get("city", ""),
            "capacity_mw": capacity_mw,
            "capacity_source": "verified",
            "pue": round(pue, 2),
            "pue_source": "verified",
            "carbon_intensity_gco2_kwh": carbon,
            "co2_annual_tonnes": co2,
            "water_withdrawal_m3_year": water_m3,
            "water_stress_level": water_stress,
            "energy_source_pct_renewable": dc.get("energy_source_pct_renewable"),
            "operator_commitment_net_zero": dc.get("operator_commitment_net_zero"),
            "grid_renewable_pct": entry.get("renewable_share_elec_pct") if isinstance(entry, dict) else None,
            "grid_low_carbon_pct": entry.get("low_carbon_share_elec_pct") if isinstance(entry, dict) else None,
            "grid_mix": json.dumps(entry.get("mix")) if isinstance(entry, dict) and entry.get("mix") else None,
            "data_quality": dc.get("data_quality", "estimated"),
            "source": "manual",
            "last_updated": "2024-01",
        }
    }


def compute_bbox(geometry: dict) -> Optional[list]:
    try:
        if geometry["type"] == "Polygon":
            coords = geometry["coordinates"][0]
        elif geometry["type"] == "MultiPolygon":
            coords = []
            for poly in geometry["coordinates"]:
                coords.extend(poly[0])
        else:
            return None
        lons = [c[0] for c in coords]
        lats = [c[1] for c in coords]
        return [min(lons), min(lats), max(lons), max(lats)]
    except Exception:
        return None


def point_in_bbox(lon: float, lat: float, bbox: list) -> bool:
    return bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]


def point_in_polygon_ray(lon: float, lat: float, ring: list) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def lookup_water_stress(lon: float, lat: float, index: list) -> str:
    for entry in index:
        if not point_in_bbox(lon, lat, entry["bbox"]):
            continue
        geom = entry["geometry"]
        try:
            if geom["type"] == "Polygon":
                if point_in_polygon_ray(lon, lat, geom["coordinates"][0]):
                    return entry["level"]
            elif geom["type"] == "MultiPolygon":
                for poly in geom["coordinates"]:
                    if point_in_polygon_ray(lon, lat, poly[0]):
                        return entry["level"]
        except Exception:
            continue
    return "unknown"


def build_water_index(water_data: dict) -> list:
    index = []
    for feature in water_data.get("features", []):
        geom = feature.get("geometry", {})
        bbox = compute_bbox(geom)
        if bbox:
            index.append({
                "bbox": bbox,
                "geometry": geom,
                "level": feature.get("properties", {}).get("water_stress_level", "unknown"),
            })
    return index


def deduplicate(features: list) -> list:
    """
    Supprime les doublons spatiaux (< DEDUP_DISTANCE_M mètres).
    En cas de doublon, conserve le point avec le score de complétude le plus élevé.
    """
    kept = []
    for feature in features:
        coords = feature["geometry"]["coordinates"]
        lon, lat = coords[0], coords[1]
        score = completeness_score(feature["properties"])

        duplicate_found = False
        for i, existing in enumerate(kept):
            e_coords = existing["geometry"]["coordinates"]
            dist = haversine_m(lat, lon, e_coords[1], e_coords[0])
            if dist < DEDUP_DISTANCE_M:
                # Garder le plus complet
                if score > completeness_score(existing["properties"]):
                    kept[i] = feature
                duplicate_found = True
                break

        if not duplicate_found:
            kept.append(feature)

    return kept


def quality_filter(features: list) -> list:
    """Filtre les features sans coordonnées valides."""
    valid = []
    for f in features:
        try:
            coords = f["geometry"]["coordinates"]
            lon, lat = float(coords[0]), float(coords[1])
            # Coordonnées valides
            if -180 <= lon <= 180 and -90 <= lat <= 90:
                # Exclure les coordonnées nulles (0, 0)
                if not (lon == 0.0 and lat == 0.0):
                    valid.append(f)
        except Exception:
            continue
    return valid


def add_color_class(feature: dict) -> dict:
    """Ajoute une classe de couleur pour Mapbox basée sur l'intensité carbone."""
    carbon = feature["properties"].get("carbon_intensity_gco2_kwh", 475)
    if carbon is None:
        carbon = 475

    if carbon <= 100:
        color_class = "very_low"    # Vert foncé
    elif carbon <= 250:
        color_class = "low"         # Vert
    elif carbon <= 400:
        color_class = "medium"      # Jaune
    elif carbon <= 600:
        color_class = "high"        # Orange
    else:
        color_class = "very_high"   # Rouge

    feature["properties"]["carbon_color_class"] = color_class
    return feature


def main():
    print("Fusion finale des sources de données DataCenter Impact Map...")

    # Charger les données
    major_data = load_json(INPUT_MAJOR)
    enriched_data = load_json(INPUT_ENRICHED)
    carbon_data = load_json(INPUT_CARBON)
    water_data = load_json(INPUT_WATER)

    if not major_data:
        print("ERREUR : major_datacenters.json manquant")
        return

    # Base de données carbone — gère l'ancien format (float) et le nouveau (dict enrichi)
    carbon_db = {}
    if carbon_data:
        for k, v in carbon_data.items():
            if k.startswith("_"):
                continue
            if isinstance(v, dict):
                carbon_db[k] = v  # nouveau format : {carbon_intensity_gco2_kwh, mix, ...}
            else:
                carbon_db[k] = {"carbon_intensity_gco2_kwh": float(v)}  # ancien format float

    # Index stress hydrique
    water_index = []
    if water_data:
        water_index = build_water_index(water_data)
        print(f"  Stress hydrique : {len(water_index)} zones indexées")

    all_features = []

    # 1. Dataset manuel (priorité absolue)
    print(f"\n[1/2] Dataset manuel : {len(major_data.get('datacenters', []))} datacenters")
    for dc in major_data.get("datacenters", []):
        if dc.get("lat") and dc.get("lon"):
            feature = major_to_feature(dc, carbon_db, water_index)
            all_features.append(feature)

    manual_count = len(all_features)
    print(f"  → {manual_count} features générées")

    # 2. Dataset OSM enrichi
    if enriched_data:
        osm_features = enriched_data.get("features", [])
        print(f"\n[2/2] OSM enrichi : {len(osm_features)} datacenters")
        all_features.extend(osm_features)
        print(f"  → {len(osm_features)} features ajoutées")
    else:
        print(f"\n[2/2] Aucune donnée OSM ({INPUT_ENRICHED} manquant)")

    print(f"\nTotal avant déduplication : {len(all_features)}")

    # Filtrage qualité
    all_features = quality_filter(all_features)
    print(f"Après filtrage qualité : {len(all_features)}")

    # Déduplication spatiale
    print("Déduplication spatiale (< 500m)...")
    all_features = deduplicate(all_features)
    print(f"Après déduplication : {len(all_features)}")

    # Ajouter les classes de couleur Mapbox
    all_features = [add_color_class(f) for f in all_features]

    # Statistiques finales
    verified = sum(1 for f in all_features if f["properties"].get("data_quality") == "verified")
    with_capacity = sum(1 for f in all_features if f["properties"].get("capacity_mw") != 20.0)
    with_stress = sum(1 for f in all_features if f["properties"].get("water_stress_level") not in ("unknown", None))
    operators = set(f["properties"].get("operator", "") for f in all_features)

    print(f"\nStatistiques :")
    print(f"  Datacenters vérifiés (ESG) : {verified}")
    print(f"  Avec capacité réelle (MW) : {with_capacity}")
    print(f"  Avec stress hydrique : {with_stress}")
    print(f"  Opérateurs uniques : {len(operators)}")

    # Exporter
    geojson = {
        "type": "FeatureCollection",
        "metadata": {
            "total_features": len(all_features),
            "verified_count": verified,
            "generated": "2024-01",
            "sources": ["OpenStreetMap", "ESG Reports", "IEA", "WRI Aqueduct"],
        },
        "features": all_features,
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    size_mb = OUTPUT_FILE.stat().st_size / 1e6
    print(f"\n✓ {len(all_features)} datacenters exportés → {OUTPUT_FILE}")
    print(f"  Taille : {size_mb:.1f} MB")

    # Vérification rapide
    print("\n=== VÉRIFICATION ===")
    target_operators = ["Google", "Amazon", "Microsoft", "Meta", "OVHcloud"]
    for op in target_operators:
        count = sum(1 for f in all_features if f["properties"].get("operator") == op)
        print(f"  {op} : {count} datacenter(s)")


if __name__ == "__main__":
    main()
