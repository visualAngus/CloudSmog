#!/usr/bin/env python3
"""
Extraction des datacenters depuis OpenStreetMap via l'API Overpass.
Sortie : data/raw/datacenters_osm.geojson
"""

import json
import time
import requests
from pathlib import Path

OUTPUT_FILE = Path(__file__).parent.parent / "data" / "raw" / "datacenters_osm.geojson"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Tags OSM ciblant les datacenters
OVERPASS_QUERIES = [
    '["facility"="data_center"]',
    '["building"="data_center"]',
    '["telecom"="data_center"]',
    '["man_made"="data_center"]',
]

# Bboxes par continent pour découpage si la requête globale échoue
CONTINENT_BBOXES = {
    "europe":       (34.0, -25.0, 72.0, 45.0),
    "north_america": (15.0, -170.0, 75.0, -50.0),
    "asia":         (-10.0, 25.0, 60.0, 150.0),
    "south_america": (-56.0, -82.0, 13.0, -34.0),
    "africa":       (-35.0, -18.0, 38.0, 52.0),
    "oceania":      (-50.0, 110.0, -10.0, 180.0),
}


def build_query(tag_filter: str, bbox: tuple | None = None) -> str:
    """Construit une requête Overpass QL."""
    if bbox:
        s, w, n, e = bbox
        area = f"({s},{w},{n},{e})"
    else:
        area = ""
    return f"""
[out:json][timeout:90];
(
  node{tag_filter}{area};
  way{tag_filter}{area};
  relation{tag_filter}{area};
);
out center tags;
"""


def fetch_with_retry(query: str, max_retries: int = 3, delay: int = 10) -> dict | None:
    """Envoie une requête Overpass avec retry."""
    for attempt in range(max_retries):
        try:
            resp = requests.post(OVERPASS_URL, data={"data": query}, timeout=120)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            print(f"  Tentative {attempt + 1}/{max_retries} échouée : {e}")
            if attempt < max_retries - 1:
                time.sleep(delay * (attempt + 1))
    return None


def extract_coordinates(element: dict) -> tuple[float, float] | None:
    """Extrait lat/lon depuis un élément OSM."""
    if element["type"] == "node":
        return element.get("lat"), element.get("lon")
    elif "center" in element:
        return element["center"].get("lat"), element["center"].get("lon")
    return None, None


def element_to_feature(element: dict) -> dict | None:
    """Convertit un élément OSM en feature GeoJSON."""
    lat, lon = extract_coordinates(element)
    if lat is None or lon is None:
        return None

    tags = element.get("tags", {})
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [lon, lat]
        },
        "properties": {
            "osm_id": element.get("id"),
            "osm_type": element.get("type"),
            "name": tags.get("name", tags.get("operator", "")),
            "operator": tags.get("operator", tags.get("brand", "")),
            "addr_country": tags.get("addr:country", ""),
            "addr_city": tags.get("addr:city", ""),
            "website": tags.get("website", tags.get("contact:website", "")),
            "power": tags.get("power:output", tags.get("generator:output", "")),
            "source": "osm",
            "last_updated": "2024-01",
        }
    }


def fetch_global() -> list[dict]:
    """Essaie de récupérer tous les datacenters en une seule requête globale."""
    features = []
    seen_ids = set()

    for tag_filter in OVERPASS_QUERIES:
        print(f"  Requête globale : {tag_filter}")
        query = build_query(tag_filter)
        data = fetch_with_retry(query)
        if data is None:
            print(f"  Échec de la requête globale pour {tag_filter}")
            continue

        elements = data.get("elements", [])
        print(f"    → {len(elements)} éléments trouvés")

        for el in elements:
            osm_id = f"{el['type']}/{el['id']}"
            if osm_id in seen_ids:
                continue
            seen_ids.add(osm_id)
            feature = element_to_feature(el)
            if feature:
                features.append(feature)

        time.sleep(2)  # Politesse envers l'API

    return features


def fetch_by_continent() -> list[dict]:
    """Récupère les datacenters continent par continent."""
    features = []
    seen_ids = set()

    for continent, bbox in CONTINENT_BBOXES.items():
        print(f"  Continent : {continent}")
        for tag_filter in OVERPASS_QUERIES:
            query = build_query(tag_filter, bbox)
            data = fetch_with_retry(query)
            if data is None:
                continue

            elements = data.get("elements", [])
            for el in elements:
                osm_id = f"{el['type']}/{el['id']}"
                if osm_id in seen_ids:
                    continue
                seen_ids.add(osm_id)
                feature = element_to_feature(el)
                if feature:
                    features.append(feature)

            time.sleep(2)

    return features


def main():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    print("Extraction des datacenters depuis OpenStreetMap...")

    # Essai global d'abord
    print("\n[1/2] Tentative de requête globale...")
    features = fetch_global()

    # Si moins de 100 résultats, on passe par continent
    if len(features) < 100:
        print(f"\n[2/2] Peu de résultats ({len(features)}). Passage par continent...")
        features = fetch_by_continent()

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print(f"\n✓ {len(features)} datacenters exportés → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
