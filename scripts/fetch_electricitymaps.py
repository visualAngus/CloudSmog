#!/usr/bin/env python3
"""
Collecte des données Electricity Maps API pour les zones principales.
Stocke en cache JSON pour éviter de dépasser les limites de l'API.

IMPORTANT : Le token de démonstration retourne des données SANDBOX
(intentionnellement inexactes). Remplacez par un token de production
pour des données réelles.

Endpoints utilisés :
  - /v3/carbon-intensity/latest?zone=XX  → gCO2/kWh en temps réel
  - /v3/power-breakdown/latest?zone=XX   → mix énergétique (MW par source)

Sortie : data/raw/electricity_maps_live.json
"""

import json
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

API_TOKEN = "pKiGx7a2zRo9WaE6Sdgh"
BASE_URL = "https://api.electricitymap.org/v3"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "raw" / "electricity_maps_live.json"

# Sources renouvelables (hors nucléaire)
RENEWABLE_SOURCES = {"wind", "solar", "hydro", "geothermal", "biomass", "hydro discharge"}
# Sources bas carbone (incluant nucléaire)
LOW_CARBON_SOURCES = RENEWABLE_SOURCES | {"nuclear"}

# Zones prioritaires : appairage zone Electricity Maps → ISO2 pays
ZONES = {
    # Europe
    "FR": "FR", "DE": "DE", "GB": "GB", "NL": "NL", "BE": "BE",
    "ES": "ES", "IT": "IT", "PL": "PL", "SE": "SE", "NO": "NO",
    "FI": "FI", "DK": "DK", "AT": "AT", "PT": "PT", "GR": "GR",
    "HU": "HU", "RO": "RO", "CZ": "CZ", "IE": "IE", "CH": "CH",
    "LU": "LU",
    # Amériques
    "US": "US",
    "CA-ON": "CA",    # Ontario (représentatif)
    "MX": "MX",
    "BR-CS": "BR",    # Centre-Sud Brésil
    # Asie-Pacifique
    "JP-TK": "JP",    # Tokyo
    "KR": "KR",
    "IN-NO": "IN",    # Nord Inde
    "SG": "SG",
    "AU-NSW": "AU",   # Nouvelle-Galles du Sud
    "NZ": "NZ",
    # Afrique / Moyen-Orient
    "ZA": "ZA",
    "EG": "EG",
}


def fetch_zone(session: requests.Session, zone: str) -> dict | None:
    """Récupère carbon intensity + power breakdown pour une zone."""
    headers = {"auth-token": API_TOKEN}
    result = {}

    # 1. Carbon intensity
    try:
        r = session.get(f"{BASE_URL}/carbon-intensity/latest", params={"zone": zone},
                        headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            result["carbon_intensity_gco2_kwh"] = data.get("carbonIntensity")
            result["datetime"] = data.get("datetime")
            result["is_estimated"] = data.get("isEstimated", True)
            result["is_sandbox"] = "SANDBOX" in data.get("estimationMethod", "")
        else:
            print(f"    [WARN] {zone} carbon-intensity → HTTP {r.status_code}")
    except requests.RequestException as e:
        print(f"    [ERR] {zone} carbon-intensity : {e}")
        return None

    # 2. Power breakdown (pour calculer % renouvelable)
    try:
        r = session.get(f"{BASE_URL}/power-breakdown/latest", params={"zone": zone},
                        headers=headers, timeout=10)
        if r.status_code == 200:
            data = r.json()
            breakdown = data.get("powerConsumptionBreakdown", {})

            total = sum(v for v in breakdown.values() if isinstance(v, (int, float)) and v > 0)
            renewable = sum(
                v for k, v in breakdown.items()
                if k in RENEWABLE_SOURCES and isinstance(v, (int, float)) and v > 0
            )
            low_carbon = sum(
                v for k, v in breakdown.items()
                if k in LOW_CARBON_SOURCES and isinstance(v, (int, float)) and v > 0
            )

            result["power_breakdown_mw"] = {
                k: v for k, v in breakdown.items() if isinstance(v, (int, float))
            }
            result["renewable_pct"] = round(renewable / total * 100, 1) if total > 0 else None
            result["low_carbon_pct"] = round(low_carbon / total * 100, 1) if total > 0 else None
            result["total_consumption_mw"] = round(total)
    except requests.RequestException as e:
        print(f"    [ERR] {zone} power-breakdown : {e}")

    return result if result else None


def main():
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    print("Collecte Electricity Maps API...")
    print(f"  → {len(ZONES)} zones à interroger\n")

    session = requests.Session()
    results = {}
    errors = []

    for i, (zone, iso2) in enumerate(ZONES.items()):
        print(f"  [{i+1:2d}/{len(ZONES)}] {zone:12s} (→ ISO2: {iso2}) ...", end=" ", flush=True)
        data = fetch_zone(session, zone)

        if data:
            results[zone] = {"iso2": iso2, **data}
            ci = data.get("carbon_intensity_gco2_kwh", "?")
            ren = data.get("renewable_pct", "?")
            sandbox = " [SANDBOX]" if data.get("is_sandbox") else ""
            print(f"✓  {ci} gCO2/kWh  {ren}% ren{sandbox}")
        else:
            errors.append(zone)
            print("✗  échec")

        # Respecter les limites : ~5 req/s max
        if i < len(ZONES) - 1:
            time.sleep(0.25)

    output = {
        "_metadata": {
            "source": "Electricity Maps API v3",
            "token_type": "sandbox_trial",
            "sandbox_warning": (
                "DONNÉES SANDBOX — intentionnellement inexactes pour les tests. "
                "Remplacer le token par un token de production pour des données réelles."
            ),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "zones_fetched": len(results),
            "zones_failed": len(errors),
            "renewable_definition": "wind + solar + hydro + geothermal + biomass (hors nucléaire)",
            "low_carbon_definition": "renewable + nuclear",
            "carbon_unit": "gCO2/kWh (lifecycle)",
        },
        "zones": results,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n✓ {len(results)} zones exportées → {OUTPUT_FILE}")
    if errors:
        print(f"  Échecs : {', '.join(errors)}")

    # Résumé des données renouvelables
    print("\n  Classement % renouvelable (sans nucléaire) :")
    ranked = sorted(
        [(z, d["iso2"], d.get("renewable_pct")) for z, d in results.items()
         if d.get("renewable_pct") is not None],
        key=lambda x: x[2], reverse=True
    )
    for zone, iso2, pct in ranked[:10]:
        bar = "█" * int(pct / 5)
        print(f"    {iso2:4s} {zone:12s} {pct:5.1f}% {bar}")


if __name__ == "__main__":
    main()
