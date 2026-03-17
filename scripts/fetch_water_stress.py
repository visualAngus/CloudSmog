#!/usr/bin/env python3
"""
Téléchargement et préparation du dataset de stress hydrique WRI Aqueduct 4.0.
Sortie : data/processed/water_stress.geojson (géométries simplifiées)

Si le téléchargement WRI échoue, génère un dataset de fallback
basé sur les régions climatiques connues (zones arides, semi-arides).
"""

import json
import zipfile
import tempfile
import requests
from pathlib import Path

OUTPUT_FILE = Path(__file__).parent.parent / "data" / "processed" / "water_stress.geojson"
RAW_DIR = Path(__file__).parent.parent / "data" / "raw"

# URL WRI Aqueduct 4.0 (baseline annual)
WRI_URL = (
    "https://files.wri.org/aqueduct/aqueduct40_baseline_annual_y2023m07d05.zip"
)

# Niveaux de stress hydrique WRI (label → valeur normalisée)
BWS_LABEL_MAP = {
    "Low (<10%)": "low",
    "Low - Medium (10-20%)": "low-medium",
    "Medium - High (20-40%)": "medium-high",
    "High (40-80%)": "high",
    "Extremely High (>80%)": "extremely-high",
    "Arid and Low Water Use": "arid",
    "No Data": "unknown",
}


def try_geopandas_approach(zip_path: str) -> bool:
    """Essaie de traiter le ZIP avec geopandas."""
    try:
        import geopandas as gpd
        from shapely.geometry import mapping

        print("  Extraction du ZIP avec geopandas...")
        with tempfile.TemporaryDirectory() as tmpdir:
            with zipfile.ZipFile(zip_path, 'r') as z:
                z.extractall(tmpdir)

            # Trouver le shapefile
            shapefiles = list(Path(tmpdir).rglob("*.shp"))
            if not shapefiles:
                print("  Aucun shapefile trouvé dans le ZIP")
                return False

            shp = shapefiles[0]
            print(f"  Lecture de {shp.name}...")
            gdf = gpd.read_file(str(shp))
            print(f"  {len(gdf)} bassins versants chargés")

            # Identifier la colonne de stress hydrique
            bws_col = None
            for col in gdf.columns:
                if "bws" in col.lower() and "label" in col.lower():
                    bws_col = col
                    break
            if not bws_col:
                for col in gdf.columns:
                    if "bws" in col.lower():
                        bws_col = col
                        break

            if not bws_col:
                print(f"  Colonnes disponibles : {list(gdf.columns)}")
                bws_col = "bws_label" if "bws_label" in gdf.columns else gdf.columns[0]

            print(f"  Colonne stress hydrique : '{bws_col}'")

            # Simplifier les géométries
            gdf = gdf.to_crs("EPSG:4326")
            gdf["geometry"] = gdf["geometry"].simplify(0.05, preserve_topology=True)
            gdf = gdf.dropna(subset=["geometry"])

            # Construire le GeoJSON de sortie
            features = []
            for _, row in gdf.iterrows():
                if row.geometry is None or row.geometry.is_empty:
                    continue

                raw_label = str(row.get(bws_col, "No Data"))
                stress_level = BWS_LABEL_MAP.get(raw_label, "unknown")

                feature = {
                    "type": "Feature",
                    "geometry": mapping(row.geometry),
                    "properties": {
                        "water_stress_level": stress_level,
                        "water_stress_label": raw_label,
                    }
                }
                features.append(feature)

            geojson = {"type": "FeatureCollection", "features": features}
            OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                json.dump(geojson, f, ensure_ascii=False)

            print(f"  ✓ {len(features)} bassins versants exportés")
            return True

    except Exception as e:
        print(f"  Erreur geopandas : {e}")
        return False


def download_wri() -> str | None:
    """Télécharge le ZIP WRI Aqueduct."""
    tmp_path = RAW_DIR / "aqueduct40.zip"
    tmp_path.parent.mkdir(parents=True, exist_ok=True)

    # Si déjà téléchargé
    if tmp_path.exists() and tmp_path.stat().st_size > 1_000_000:
        print(f"  ZIP déjà présent ({tmp_path.stat().st_size / 1e6:.1f} MB)")
        return str(tmp_path)

    print(f"  Téléchargement WRI Aqueduct depuis {WRI_URL}")
    print("  (fichier ~500 MB, peut prendre quelques minutes)")

    try:
        with requests.get(WRI_URL, stream=True, timeout=300) as resp:
            resp.raise_for_status()
            total = int(resp.headers.get("content-length", 0))
            downloaded = 0
            with open(tmp_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=1024 * 1024):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        pct = downloaded / total * 100
                        print(f"\r  {pct:.1f}% ({downloaded / 1e6:.0f}/{total / 1e6:.0f} MB)", end="", flush=True)
            print()
        return str(tmp_path)
    except requests.RequestException as e:
        print(f"\n  Téléchargement WRI échoué : {e}")
        return None


def generate_fallback_geojson():
    """
    Génère un GeoJSON de fallback basé sur des polygones de stress hydrique
    approximatifs par grande région géographique.
    Ces données permettent le fonctionnement de la carte même sans WRI.
    """
    print("  Génération du dataset de stress hydrique de fallback...")

    # Régions de stress hydrique connu (approximations bbox simplifiées)
    # Format : [minlon, minlat, maxlon, maxlat], niveau, label
    regions = [
        # Moyen-Orient / Péninsule arabique — Extremely High
        ([32.0, 12.0, 60.0, 38.0], "extremely-high", "Extremely High (>80%)"),
        # Afrique du Nord / Maghreb — High
        ([-18.0, 14.0, 35.0, 37.0], "high", "High (40-80%)"),
        # Asie centrale — High
        ([50.0, 35.0, 87.0, 50.0], "high", "High (40-80%)"),
        # Inde centrale / Pakistan — High
        ([60.0, 20.0, 85.0, 35.0], "high", "High (40-80%)"),
        # Australie centre/ouest — High
        ([114.0, -35.0, 140.0, -18.0], "high", "High (40-80%)"),
        # Californie / Sud-Ouest USA — High
        ([-125.0, 30.0, -100.0, 42.0], "high", "High (40-80%)"),
        # Mexique nord — High
        ([-115.0, 20.0, -95.0, 32.0], "medium-high", "Medium - High (20-40%)"),
        # Nord-Est Brésil (sertão) — High
        ([-45.0, -15.0, -35.0, -3.0], "high", "High (40-80%)"),
        # Europe méditerranéenne — Medium-High
        ([-10.0, 35.0, 30.0, 45.0], "medium-high", "Medium - High (20-40%)"),
        # Chine du Nord — High
        ([100.0, 35.0, 125.0, 50.0], "high", "High (40-80%)"),
        # Afrique sub-saharienne sèche — Medium-High
        ([10.0, 8.0, 40.0, 15.0], "medium-high", "Medium - High (20-40%)"),
        # Europe du Nord — Low
        ([-30.0, 55.0, 35.0, 72.0], "low", "Low (<10%)"),
        # Canada — Low
        ([-140.0, 50.0, -55.0, 75.0], "low", "Low (<10%)"),
        # Bassin amazonien — Low
        ([-75.0, -15.0, -45.0, 8.0], "low", "Low (<10%)"),
        # Asie du Sud-Est (zones humides) — Low-Medium
        ([95.0, -10.0, 140.0, 25.0], "low-medium", "Low - Medium (10-20%)"),
        # Russie / Sibérie — Low
        ([60.0, 50.0, 180.0, 75.0], "low", "Low (<10%)"),
        # Afrique centrale équatoriale — Low
        ([10.0, -8.0, 30.0, 8.0], "low", "Low (<10%)"),
        # Scandinavie — Low
        ([4.0, 56.0, 32.0, 72.0], "low", "Low (<10%)"),
        # Nouvelle-Zélande — Low
        ([165.0, -47.0, 178.0, -35.0], "low", "Low (<10%)"),
        # Inde côtière / Bangladesh — Low-Medium
        ([80.0, 8.0, 95.0, 25.0], "low-medium", "Low - Medium (10-20%)"),
        # Chine côtière / sud — Low-Medium
        ([110.0, 20.0, 125.0, 35.0], "low-medium", "Low - Medium (10-20%)"),
        # Afrique de l'Est — Medium-High
        ([30.0, -10.0, 50.0, 12.0], "medium-high", "Medium - High (20-40%)"),
        # Texas / Midwest USA — Medium-High
        ([-100.0, 30.0, -80.0, 45.0], "medium-high", "Medium - High (20-40%)"),
        # Europe centrale — Low-Medium
        ([10.0, 45.0, 32.0, 55.0], "low-medium", "Low - Medium (10-20%)"),
    ]

    features = []
    for bbox, level, label in regions:
        minlon, minlat, maxlon, maxlat = bbox
        # Créer un polygone rectangulaire simple
        coords = [[
            [minlon, minlat],
            [maxlon, minlat],
            [maxlon, maxlat],
            [minlon, maxlat],
            [minlon, minlat],
        ]]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": coords},
            "properties": {
                "water_stress_level": level,
                "water_stress_label": label,
                "source": "fallback_approximation"
            }
        })

    geojson = {"type": "FeatureCollection", "features": features}
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    print(f"  ✓ {len(features)} régions de fallback exportées → {OUTPUT_FILE}")


def main():
    print("Préparation des données de stress hydrique WRI Aqueduct...")

    # Tentative de téléchargement WRI
    zip_path = download_wri()
    if zip_path:
        success = try_geopandas_approach(zip_path)
        if success:
            print(f"\n✓ Stress hydrique WRI exporté → {OUTPUT_FILE}")
            size_mb = OUTPUT_FILE.stat().st_size / 1e6
            print(f"  Taille : {size_mb:.1f} MB")
            return

    # Fallback si WRI non disponible
    print("\n  WRI Aqueduct non disponible. Utilisation du dataset de fallback.")
    generate_fallback_geojson()
    print(f"\n✓ Stress hydrique (fallback) exporté → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
