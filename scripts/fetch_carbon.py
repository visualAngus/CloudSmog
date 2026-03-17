#!/usr/bin/env python3
"""
Récupération de l'intensité carbone par pays/zone.
Stratégie :
  1. Dataset statique Our World in Data (CSV gratuit, 2023) — source principale
  2. Fallback : valeurs codées en dur depuis IEA / Ember 2024
Sortie : data/raw/carbon_intensity.json
"""

import json
import csv
import io
import requests
from pathlib import Path

OUTPUT_FILE = Path(__file__).parent.parent / "data" / "raw" / "carbon_intensity.json"

# Valeur par défaut mondiale IEA 2023
WORLD_DEFAULT = 475  # gCO2/kWh

# URL du dataset Our World in Data (intensité carbone électricité par pays)
OWID_CSV_URL = (
    "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv"
)

# Mapping ISO2 → Electricity Maps zone (pour compatibilité future avec l'API)
ISO2_TO_EMAPS = {
    "AU": "AU", "AT": "AT", "BE": "BE", "BR": "BR", "CA": "CA-QC",
    "CN": "CN", "CZ": "CZ", "DE": "DE", "DK": "DK", "ES": "ES",
    "FI": "FI", "FR": "FR", "GB": "GB", "GR": "GR", "HU": "HU",
    "IE": "IE", "IN": "IN", "IT": "IT", "JP": "JP", "KR": "KR",
    "MX": "MX", "NL": "NL", "NO": "NO", "NZ": "NZ", "PL": "PL",
    "PT": "PT", "RO": "RO", "RU": "RU", "SE": "SE", "SG": "SG",
    "TR": "TR", "TW": "TW", "UA": "UA", "US": "US", "ZA": "ZA",
}

# Valeurs de fallback vérifiées (IEA / Ember 2024, gCO2/kWh)
# Sources : IEA Electricity 2024, Ember Global Electricity Review 2024
FALLBACK_INTENSITY = {
    # Amérique du Nord
    "US": 379,   # EIA 2023
    "CA": 130,   # Mostly hydro
    "MX": 430,
    # Europe
    "FR": 56,    # Nucléaire dominant
    "DE": 380,
    "GB": 238,
    "NL": 298,
    "BE": 167,
    "ES": 172,
    "IT": 371,
    "PL": 720,   # Charbon dominant
    "SE": 41,    # Hydro + nucléaire
    "NO": 26,    # Quasi 100% hydro
    "FI": 107,
    "DK": 156,
    "AT": 155,
    "PT": 133,
    "GR": 350,
    "HU": 240,
    "RO": 270,
    "CZ": 450,
    "UA": 310,
    "IE": 296,
    # Asie
    "CN": 557,   # IEA 2023
    "JP": 471,
    "KR": 436,
    "IN": 632,   # CEA 2023
    "TW": 502,
    "SG": 431,
    "TH": 430,
    "VN": 390,
    "ID": 720,
    "MY": 580,
    "PH": 620,
    "PK": 370,
    "BD": 560,
    # Moyen-Orient / Afrique
    "SA": 680,
    "AE": 550,
    "ZA": 900,   # Charbon dominant
    "EG": 480,
    "NG": 430,
    "KE": 180,   # Géothermie
    # Amériques du Sud
    "BR": 126,   # Hydro dominant
    "AR": 350,
    "CL": 290,
    "CO": 220,
    # Océanie
    "AU": 560,
    "NZ": 147,   # Hydro dominant
    # Russie / CEI
    "RU": 340,
    "KZ": 690,
    # Nordiques / îles
    "IS": 28,    # Géothermie + hydro
    "LU": 220,
    "CH": 41,    # Hydro + nucléaire
}


ISO3_TO_ISO2 = {
    "USA": "US", "CAN": "CA", "MEX": "MX", "GBR": "GB", "FRA": "FR",
    "DEU": "DE", "NLD": "NL", "BEL": "BE", "ESP": "ES", "ITA": "IT",
    "POL": "PL", "SWE": "SE", "NOR": "NO", "FIN": "FI", "DNK": "DK",
    "AUT": "AT", "PRT": "PT", "GRC": "GR", "HUN": "HU", "ROU": "RO",
    "CZE": "CZ", "UKR": "UA", "IRL": "IE", "CHN": "CN", "JPN": "JP",
    "KOR": "KR", "IND": "IN", "TWN": "TW", "SGP": "SG", "THA": "TH",
    "VNM": "VN", "IDN": "ID", "MYS": "MY", "PHL": "PH", "PAK": "PK",
    "BGD": "BD", "SAU": "SA", "ARE": "AE", "ZAF": "ZA", "EGY": "EG",
    "NGA": "NG", "KEN": "KE", "BRA": "BR", "ARG": "AR", "CHL": "CL",
    "COL": "CO", "AUS": "AU", "NZL": "NZ", "RUS": "RU", "KAZ": "KZ",
    "ISL": "IS", "LUX": "LU", "CHE": "CH",
}


# Colonnes du mix énergétique à extraire depuis OWID
MIX_COLS = {
    "nuclear":   "nuclear_share_elec",
    "hydro":     "hydro_share_elec",
    "wind":      "wind_share_elec",
    "solar":     "solar_share_elec",
    "biofuel":   "biofuel_share_elec",
    "other_ren": "other_renewables_share_elec_exc_biofuel",
    "gas":       "gas_share_elec",
    "coal":      "coal_share_elec",
    "oil":       "oil_share_elec",
}


def fetch_owid_data() -> tuple[dict, dict, dict, dict]:
    """
    Télécharge le dataset OWID et extrait par pays :
    - intensité carbone électricité (gCO2/kWh)
    - part des renouvelables dans l'électricité (%)
    - part bas carbone (renouvelables + nucléaire) (%)
    - mix détaillé par source (nuclear, hydro, wind, solar, gas, coal, oil…)
    Retourne (carbon_dict, renewable_dict, low_carbon_dict, mix_dict)
    """
    print("  Téléchargement du dataset Our World in Data...")
    try:
        resp = requests.get(OWID_CSV_URL, timeout=60)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  Échec du téléchargement OWID : {e}")
        return {}, {}, {}, {}

    rows = list(csv.DictReader(io.StringIO(resp.text)))
    fields = set(rows[0].keys()) if rows else set()

    col_carbon = next((c for c in fields if "carbon_intensity_elec" in c.lower()), None)
    if not col_carbon:
        print("  Colonne 'carbon_intensity_elec' non trouvée dans OWID")
        return {}, {}, {}, {}

    print(f"  Colonne carbone : {col_carbon}")

    # Pour chaque pays : garder l'année la plus récente (>= 2020)
    # Structure : iso2 → (year, {col: value})
    latest: dict[str, tuple[int, dict]] = {}

    all_cols = [col_carbon, "renewables_share_elec", "low_carbon_share_elec"] + list(MIX_COLS.values())
    all_cols = [c for c in all_cols if c in fields]

    for row in rows:
        iso = row.get("iso_code", "").strip()
        if not iso or len(iso) != 3:
            continue
        try:
            year = int(row.get("year", 0))
        except (ValueError, TypeError):
            continue
        if year < 2020:
            continue
        iso2 = ISO3_TO_ISO2.get(iso)
        if not iso2:
            continue

        if iso2 not in latest or year > latest[iso2][0]:
            vals = {}
            for col in all_cols:
                try:
                    v = float(row.get(col, "") or "")
                    vals[col] = v
                except (ValueError, TypeError):
                    pass
            if vals:
                latest[iso2] = (year, vals)

    carbon, renew, lowc, mix_db = {}, {}, {}, {}
    for iso2, (year, vals) in latest.items():
        if col_carbon in vals:
            carbon[iso2] = round(vals[col_carbon], 1)
        if "renewables_share_elec" in vals:
            renew[iso2] = round(vals["renewables_share_elec"], 1)
        if "low_carbon_share_elec" in vals:
            lowc[iso2] = round(vals["low_carbon_share_elec"], 1)
        # Construire l'objet mix avec toutes les sources disponibles
        mix = {}
        for key, col in MIX_COLS.items():
            if col in vals:
                mix[key] = round(vals[col], 1)
        if mix:
            mix["_year"] = year
            mix_db[iso2] = mix

    print(f"    → {len(carbon)} pays carbone, {len(renew)} pays renouvelable, {len(mix_db)} pays avec mix détaillé")
    return carbon, renew, lowc, mix_db


def build_carbon_db() -> tuple[dict, dict, dict, dict]:
    """Construit les bases de données carbone + renouvelable + bas-carbone + mix."""
    db_carbon = dict(FALLBACK_INTENSITY)
    db_renew, db_lowc, db_mix = {}, {}, {}

    owid_carbon, owid_renew, owid_lowc, owid_mix = fetch_owid_data()
    if owid_carbon:
        for iso2, value in owid_carbon.items():
            db_carbon[iso2] = value
        db_renew.update(owid_renew)
        db_lowc.update(owid_lowc)
        db_mix.update(owid_mix)
        print(f"  OWID : {len(owid_carbon)} pays carbone, {len(owid_mix)} pays avec mix détaillé")
    else:
        print("  Utilisation exclusive des valeurs de fallback IEA/Ember")

    return db_carbon, db_renew, db_lowc, db_mix


def main():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    print("Construction de la base de données d'intensité carbone + renouvelables...")

    db_carbon, db_renew, db_lowc, db_mix = build_carbon_db()

    # Format enrichi : chaque pays a carbon_intensity + renewable_share + mix détaillé
    countries = {}
    all_iso2 = sorted(set(db_carbon) | set(db_renew))
    for iso2 in all_iso2:
        entry = {
            "carbon_intensity_gco2_kwh": db_carbon.get(iso2),
            "renewable_share_elec_pct": db_renew.get(iso2),
            "low_carbon_share_elec_pct": db_lowc.get(iso2),
        }
        if iso2 in db_mix:
            entry["mix"] = db_mix[iso2]
        countries[iso2] = entry

    output = {
        "_metadata": {
            "carbon_unit": "gCO2/kWh",
            "renewable_unit": "% of electricity generation (excl. nuclear)",
            "low_carbon_unit": "% of electricity generation (incl. nuclear)",
            "mix_keys": list(MIX_COLS.keys()),
            "mix_unit": "% of electricity generation per source",
            "default_world_carbon": WORLD_DEFAULT,
            "sources": ["Our World in Data (OWID)", "IEA Electricity 2024", "Ember 2024"],
            "year_reference": "2022-2023",
            "note": "Utiliser '_default' si le pays n'est pas dans la liste"
        },
        "_default": {
            "carbon_intensity_gco2_kwh": WORLD_DEFAULT,
            "renewable_share_elec_pct": None,
            "low_carbon_share_elec_pct": None,
            "mix": None,
        },
        **countries,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n✓ {len(countries)} pays exportés → {OUTPUT_FILE}")
    print(f"  Défaut mondial carbone : {WORLD_DEFAULT} gCO2/kWh")

    # Top renouvelables
    top_ren = sorted(
        [(iso2, d["renewable_share_elec_pct"]) for iso2, d in countries.items()
         if d["renewable_share_elec_pct"] is not None],
        key=lambda x: x[1], reverse=True
    )
    print("\n  Top 10 renouvelables (source OWID) :")
    for iso2, pct in top_ren[:10]:
        bar = "█" * int(pct / 5)
        print(f"    {iso2:4s}  {pct:5.1f}%  {bar}")


if __name__ == "__main__":
    main()
