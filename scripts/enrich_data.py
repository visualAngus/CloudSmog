#!/usr/bin/env python3
"""
Enrichissement des datacenters OSM avec :
  - Intensité carbone par pays
  - PUE et capacité depuis le dataset manuel des grands opérateurs
  - Calcul CO2 annuel et consommation eau
  - Niveau de stress hydrique (spatial join point-in-polygon)

Entrées :
  - data/raw/datacenters_osm.geojson
  - data/raw/major_datacenters.json
  - data/raw/carbon_intensity.json
  - data/processed/water_stress.geojson

Sortie : data/processed/enriched.geojson
"""

import json
import math
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"

INPUT_OSM = RAW_DIR / "datacenters_osm.geojson"
INPUT_MAJOR = RAW_DIR / "major_datacenters.json"
INPUT_CARBON = RAW_DIR / "carbon_intensity.json"
INPUT_WATER = PROCESSED_DIR / "water_stress.geojson"
OUTPUT_FILE = PROCESSED_DIR / "enriched.geojson"

# Valeurs par défaut IEA / Uptime Institute
DEFAULT_PUE = 1.58
DEFAULT_CAPACITY_MW = 20.0
DEFAULT_CARBON = 475  # gCO2/kWh
WATER_RATIO_L_PER_KWH = 1.8  # litres d'eau par kWh consommé


def load_json(path: Path) -> dict | None:
    if not path.exists():
        print(f"  Fichier manquant : {path}")
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build_major_lookup(major_data: dict) -> dict[str, dict]:
    """Construit un index nom → propriétés pour les grands datacenters."""
    lookup = {}
    for dc in major_data.get("datacenters", []):
        key = dc.get("name", "").lower().strip()
        if key:
            lookup[key] = dc
        # Aussi indexer par opérateur+ville pour le matching OSM
        op = dc.get("operator", "").lower()
        city = dc.get("city", "").lower()
        if op and city:
            lookup[f"{op}|{city}"] = dc
    return lookup


def build_operator_defaults(major_data: dict) -> dict[str, dict]:
    """Retourne les valeurs par défaut par opérateur (Google, AWS, etc.)."""
    return major_data.get("defaults", {})


def build_carbon_lookup(carbon_data: dict) -> dict[str, dict]:
    """
    Retourne le dict pays → {carbon_intensity, renewable_share, low_carbon_share}.
    Gère l'ancien format (valeur float directe) et le nouveau (dict enrichi OWID).
    """
    result = {}
    default_ci = carbon_data.get("_default", {})
    if isinstance(default_ci, dict):
        default_ci = default_ci.get("carbon_intensity_gco2_kwh", 475)

    for k, v in carbon_data.items():
        if k.startswith("_"):
            continue
        if isinstance(v, dict):
            result[k] = {
                "carbon": v.get("carbon_intensity_gco2_kwh") or default_ci,
                "renewable_pct": v.get("renewable_share_elec_pct"),
                "low_carbon_pct": v.get("low_carbon_share_elec_pct"),
                "mix": v.get("mix"),
            }
        else:
            # Ancien format float
            result[k] = {"carbon": float(v), "renewable_pct": None, "low_carbon_pct": None}
    return result


def point_in_bbox(lon: float, lat: float, bbox: list) -> bool:
    """Test rapide si un point est dans une bbox [minlon, minlat, maxlon, maxlat]."""
    minlon, minlat, maxlon, maxlat = bbox
    return minlon <= lon <= maxlon and minlat <= lat <= maxlat


def compute_bbox(geometry: dict) -> list | None:
    """Calcule la bounding box d'une géométrie GeoJSON."""
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


def point_in_polygon_ray_cast(lon: float, lat: float, polygon_coords: list) -> bool:
    """Algorithme ray casting pour point-in-polygon."""
    inside = False
    n = len(polygon_coords)
    j = n - 1
    for i in range(n):
        xi, yi = polygon_coords[i][0], polygon_coords[i][1]
        xj, yj = polygon_coords[j][0], polygon_coords[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def point_in_geometry(lon: float, lat: float, geometry: dict) -> bool:
    """Test si un point est dans une géométrie (Polygon ou MultiPolygon)."""
    try:
        if geometry["type"] == "Polygon":
            rings = geometry["coordinates"]
            if not point_in_polygon_ray_cast(lon, lat, rings[0]):
                return False
            # Vérifier que le point n'est pas dans un trou
            for hole in rings[1:]:
                if point_in_polygon_ray_cast(lon, lat, hole):
                    return False
            return True

        elif geometry["type"] == "MultiPolygon":
            for polygon_coords in geometry["coordinates"]:
                if point_in_polygon_ray_cast(lon, lat, polygon_coords[0]):
                    # Vérifier les trous
                    in_hole = False
                    for hole in polygon_coords[1:]:
                        if point_in_polygon_ray_cast(lon, lat, hole):
                            in_hole = True
                            break
                    if not in_hole:
                        return True
            return False
    except Exception:
        return False


def build_water_stress_index(water_data: dict) -> list[dict]:
    """Pré-calcule les bboxes pour chaque feature de stress hydrique."""
    index = []
    for feature in water_data.get("features", []):
        geom = feature.get("geometry", {})
        bbox = compute_bbox(geom)
        if bbox:
            index.append({
                "bbox": bbox,
                "geometry": geom,
                "level": feature.get("properties", {}).get("water_stress_level", "unknown"),
                "label": feature.get("properties", {}).get("water_stress_label", ""),
            })
    return index


def get_water_stress(lon: float, lat: float, index: list[dict]) -> str:
    """Retourne le niveau de stress hydrique pour un point donné."""
    for entry in index:
        if not point_in_bbox(lon, lat, entry["bbox"]):
            continue
        if point_in_geometry(lon, lat, entry["geometry"]):
            return entry["level"]
    return "unknown"


def normalize_operator(raw: str) -> str:
    """Normalise le nom d'opérateur OSM vers un nom standard."""
    name = raw.lower().strip()
    mapping = {
        "google": "Google", "alphabet": "Google",
        "amazon": "Amazon", "aws": "Amazon", "amazon web services": "Amazon",
        "microsoft": "Microsoft", "azure": "Microsoft",
        "meta": "Meta", "facebook": "Meta",
        "ovh": "OVHcloud", "ovhcloud": "OVHcloud",
        "equinix": "Equinix",
        "digital realty": "Digital Realty",
        "apple": "Apple",
        "alibaba": "Alibaba", "alibaba cloud": "Alibaba",
        "tencent": "Tencent",
        "baidu": "Baidu",
        "yandex": "Yandex",
        "hetzner": "Hetzner", "hetzner online": "Hetzner",
        "scaleway": "Scaleway",
        "switch": "Switch",
        "cyrusone": "CyrusOne",
        "ntt": "NTT",
        "interxion": "Interxion",
    }
    for key, value in mapping.items():
        if key in name:
            return value
    # Capitaliser le premier mot si inconnu
    return raw.strip().title() if raw.strip() else "Unknown"


def find_in_major(props: dict, major_lookup: dict) -> dict | None:
    """Cherche les données enrichies pour un datacenter OSM dans le dataset manuel."""
    name = props.get("name", "").lower().strip()
    operator = props.get("operator", "").lower().strip()
    city = props.get("addr_city", "").lower().strip()

    # 1. Correspondance exacte sur le nom
    if name and name in major_lookup:
        return major_lookup[name]

    # 2. Correspondance opérateur + ville
    if operator and city:
        key = f"{operator}|{city}"
        if key in major_lookup:
            return major_lookup[key]

    # 3. Correspondance partielle (nom contient le nom major)
    for major_key, major_dc in major_lookup.items():
        if "|" not in major_key and major_key and name and major_key in name:
            return major_dc

    return None


def calculate_co2(capacity_mw: float, pue: float, carbon_gco2_kwh: float) -> float:
    """Calcule les émissions CO2 annuelles en tonnes."""
    return capacity_mw * pue * 8760 * carbon_gco2_kwh / 1_000_000


def calculate_water(capacity_mw: float, pue: float) -> float:
    """Calcule la consommation d'eau annuelle en m³."""
    # Énergie totale consommée (kWh/an) × ratio eau (L/kWh) → litres → m³
    kwh_per_year = capacity_mw * 1000 * pue * 8760
    liters = kwh_per_year * WATER_RATIO_L_PER_KWH
    return liters / 1000  # m³/an


def get_country_from_coords(lon: float, lat: float) -> str:
    """Estimation grossière du pays par coordonnées (fallback)."""
    # Quelques bbox rapides pour les zones avec beaucoup de datacenters
    if -130 <= lon <= -60 and 25 <= lat <= 50:
        return "US"
    if -10 <= lon <= 40 and 36 <= lat <= 70:
        # Europe — heuristique grossière
        if lon < 5:
            return "FR" if lat > 43 else "ES"
        if 5 <= lon < 15:
            return "DE"
        if 15 <= lon < 25:
            return "PL"
        return "GB"
    if 100 <= lon <= 145 and 25 <= lat <= 50:
        return "CN" if lat > 30 else "JP"
    if 68 <= lon <= 90 and 8 <= lat <= 30:
        return "IN"
    return ""


def enrich_feature(feature: dict, major_lookup: dict, operator_defaults: dict,
                   carbon_db: dict, water_index: list[dict]) -> dict:
    """Enrichit une feature GeoJSON avec toutes les propriétés calculées."""
    props = feature.get("properties", {})
    coords = feature["geometry"]["coordinates"]
    lon, lat = coords[0], coords[1]

    # Déterminer le pays
    country = props.get("addr_country", "").upper().strip()
    if not country:
        country = get_country_from_coords(lon, lat)

    # Normaliser l'opérateur
    raw_op = props.get("operator", "")
    operator = normalize_operator(raw_op)

    # Chercher dans le dataset manuel
    major = find_in_major(props, major_lookup)

    # PUE
    if major and "pue" in major:
        pue = float(major["pue"])
        pue_source = "verified"
    else:
        op_key = operator.lower()
        op_defaults = operator_defaults.get(op_key, {})
        pue = float(op_defaults.get("pue", DEFAULT_PUE))
        pue_source = "operator_default" if op_key in operator_defaults else "iea_default"

    # Capacité MW
    if major and "capacity_mw" in major:
        capacity_mw = float(major["capacity_mw"])
        capacity_source = "verified"
    else:
        # Essayer d'extraire depuis les tags OSM
        power_tag = props.get("power", "")
        if power_tag and "MW" in power_tag.upper():
            try:
                capacity_mw = float(power_tag.upper().replace("MW", "").strip())
                capacity_source = "osm"
            except ValueError:
                capacity_mw = DEFAULT_CAPACITY_MW
                capacity_source = "iea_default"
        else:
            capacity_mw = DEFAULT_CAPACITY_MW
            capacity_source = "iea_default"

    # Intensité carbone + données renouvelables du réseau électrique (source OWID)
    carbon_entry = carbon_db.get(country, {})
    carbon = carbon_entry.get("carbon", DEFAULT_CARBON) if isinstance(carbon_entry, dict) else float(carbon_entry)
    grid_renewable_pct = carbon_entry.get("renewable_pct") if isinstance(carbon_entry, dict) else None
    grid_low_carbon_pct = carbon_entry.get("low_carbon_pct") if isinstance(carbon_entry, dict) else None
    grid_mix = carbon_entry.get("mix") if isinstance(carbon_entry, dict) else None

    # Calculs
    co2_annual = round(calculate_co2(capacity_mw, pue, carbon))
    water_m3 = round(calculate_water(capacity_mw, pue))

    # Stress hydrique (spatial join)
    water_stress = get_water_stress(lon, lat, water_index)

    # Données ESG depuis le dataset manuel ou les defaults opérateur
    # renewable_pct = engagement de l'opérateur (rapport RSE) — peut être > grid_renewable_pct
    if major:
        renewable_pct = major.get("energy_source_pct_renewable",
                                   operator_defaults.get(operator.lower(), {}).get("energy_source_pct_renewable"))
        net_zero = major.get("operator_commitment_net_zero",
                              operator_defaults.get(operator.lower(), {}).get("operator_commitment_net_zero"))
        data_quality = major.get("data_quality", "estimated")
    else:
        op_key = operator.lower()
        op_def = operator_defaults.get(op_key, {})
        renewable_pct = op_def.get("energy_source_pct_renewable")
        net_zero = op_def.get("operator_commitment_net_zero")
        data_quality = "estimated"

    # Si pas d'engagement opérateur connu → utiliser le mix réel du réseau national
    if renewable_pct is None and grid_renewable_pct is not None:
        renewable_pct = round(grid_renewable_pct)

    enriched_props = {
        "name": props.get("name") or major.get("name", "") if major else props.get("name", ""),
        "operator": operator,
        "country": country,
        "city": props.get("addr_city", "") or (major.get("city", "") if major else ""),
        "capacity_mw": capacity_mw,
        "capacity_source": capacity_source,
        "pue": round(pue, 2),
        "pue_source": pue_source,
        "carbon_intensity_gco2_kwh": carbon,
        "co2_annual_tonnes": co2_annual,
        "water_withdrawal_m3_year": water_m3,
        "water_stress_level": water_stress,
        "energy_source_pct_renewable": renewable_pct,
        "grid_renewable_pct": grid_renewable_pct,       # mix réel réseau national (OWID)
        "grid_low_carbon_pct": grid_low_carbon_pct,     # renouvelable + nucléaire (OWID)
        "grid_mix": json.dumps(grid_mix) if grid_mix else None,  # mix détaillé par source (JSON string)
        "operator_commitment_net_zero": net_zero,
        "data_quality": data_quality,
        "source": props.get("source", "osm"),
        "osm_id": props.get("osm_id"),
        "last_updated": "2024-01",
    }

    return {
        "type": "Feature",
        "geometry": feature["geometry"],
        "properties": enriched_props,
    }


def main():
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    print("Enrichissement des datacenters OSM...")

    # Charger les fichiers d'entrée
    osm_data = load_json(INPUT_OSM)
    major_data = load_json(INPUT_MAJOR)
    carbon_data = load_json(INPUT_CARBON)
    water_data = load_json(INPUT_WATER)

    if not osm_data:
        print(f"ERREUR : {INPUT_OSM} non trouvé. Lancer fetch_osm.py d'abord.")
        return

    if not major_data:
        print(f"ERREUR : {INPUT_MAJOR} non trouvé.")
        return

    if not carbon_data:
        print(f"ERREUR : {INPUT_CARBON} non trouvé. Lancer fetch_carbon.py d'abord.")
        return

    if not water_data:
        print(f"ATTENTION : {INPUT_WATER} non trouvé. Lancer fetch_water_stress.py.")
        water_index = []
    else:
        print("  Construction de l'index de stress hydrique...")
        water_index = build_water_stress_index(water_data)
        print(f"  {len(water_index)} zones de stress hydrique indexées")

    major_lookup = build_major_lookup(major_data)
    operator_defaults = build_operator_defaults(major_data)
    carbon_db = build_carbon_lookup(carbon_data)

    print(f"\n  {len(osm_data['features'])} datacenters OSM à enrichir...")

    features = []
    stats = {"matched_major": 0, "with_carbon": 0, "with_water_stress": 0}

    for i, feature in enumerate(osm_data["features"]):
        try:
            enriched = enrich_feature(feature, major_lookup, operator_defaults,
                                       carbon_db, water_index)

            props = enriched["properties"]
            if props.get("data_quality") == "verified":
                stats["matched_major"] += 1
            if props.get("carbon_intensity_gco2_kwh"):
                stats["with_carbon"] += 1
            if props.get("water_stress_level") != "unknown":
                stats["with_water_stress"] += 1

            features.append(enriched)

            if (i + 1) % 500 == 0:
                print(f"  {i + 1}/{len(osm_data['features'])} traités...")

        except Exception as e:
            print(f"  Erreur sur feature {i} : {e}")

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    print(f"\n✓ {len(features)} datacenters enrichis → {OUTPUT_FILE}")
    print(f"  Correspondances dataset manuel : {stats['matched_major']}")
    print(f"  Avec intensité carbone : {stats['with_carbon']}")
    print(f"  Avec stress hydrique : {stats['with_water_stress']}")
    size_mb = OUTPUT_FILE.stat().st_size / 1e6
    print(f"  Taille fichier : {size_mb:.1f} MB")


if __name__ == "__main__":
    main()
