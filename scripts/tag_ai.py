#!/usr/bin/env python3
"""
tag_ai.py — Ajoute hosts_ai (bool) et ai_confidence ("high"/"inferred") à chaque
feature du GeoJSON, puis réécrit le fichier in-place.

Règles d'inférence (OR logique) :
  1. Opérateur IA majeur (liste exhaustive)
  2. Nom contient un mot-clé IA (case-insensitive)
  3. Grand DC d'un opérateur connu avec capacité ≥ 100 MW
"""

import json
import re
import sys
from pathlib import Path

GEOJSON_PATH = Path(__file__).parent.parent / "data" / "datacenters.geojson"

# ─── Règle 1 : opérateurs IA majeurs ──────────────────────────────────────────
AI_OPERATORS = {
    "google", "amazon", "microsoft", "meta", "apple",
    "alibaba", "tencent", "baidu", "nvidia", "coreweave",
    "lambda", "oracle", "ibm",
    # Variantes courantes trouvées dans OSM
    "amazon web services", "aws", "google llc", "meta platforms",
    "microsoft azure", "microsoft corporation",
    "ibm corporation", "oracle corporation",
}

# ─── Règle 2 : mots-clés dans le nom ──────────────────────────────────────────
AI_NAME_KEYWORDS = re.compile(
    r"\b(ai|ml|gpu|hpc|inference|training|supercomput)\b",
    re.IGNORECASE,
)

# ─── Règle 3 : opérateurs "connus" pour la règle capacité ─────────────────────
KNOWN_OPERATORS = AI_OPERATORS | {
    "equinix", "digital realty", "ovh", "ovhcloud",
    "databank", "cyrusone", "iron mountain", "switch",
    "vantage", "qts", "colo atl", "ntt", "kddi",
}

CAPACITY_THRESHOLD_MW = 100


def normalize_operator(op: str) -> str:
    return op.strip().lower() if op else ""


def is_ai_operator(op_raw: str) -> bool:
    return normalize_operator(op_raw) in AI_OPERATORS


def has_ai_keywords(name: str) -> bool:
    return bool(AI_NAME_KEYWORDS.search(name or ""))


def is_large_known_dc(op_raw: str, capacity_mw) -> bool:
    if normalize_operator(op_raw) not in KNOWN_OPERATORS:
        return False
    try:
        return float(capacity_mw) >= CAPACITY_THRESHOLD_MW
    except (TypeError, ValueError):
        return False


def tag_feature(feature: dict) -> dict:
    props = feature.get("properties") or {}
    op = props.get("operator", "")
    name = props.get("name", "")
    capacity = props.get("capacity_mw")

    ai_op = is_ai_operator(op)
    ai_kw = has_ai_keywords(name)
    ai_large = is_large_known_dc(op, capacity)

    hosts_ai = ai_op or ai_kw or ai_large

    if hosts_ai:
        if ai_op:
            confidence = "high"
        else:
            confidence = "inferred"
    else:
        confidence = None

    props["hosts_ai"] = hosts_ai
    if confidence:
        props["ai_confidence"] = confidence
    else:
        props.pop("ai_confidence", None)

    feature["properties"] = props
    return feature


def main():
    if not GEOJSON_PATH.exists():
        print(f"[ERROR] Fichier introuvable : {GEOJSON_PATH}", file=sys.stderr)
        sys.exit(1)

    print(f"[tag_ai] Lecture de {GEOJSON_PATH} …")
    with open(GEOJSON_PATH, encoding="utf-8") as f:
        geojson = json.load(f)

    features = geojson.get("features", [])
    print(f"[tag_ai] {len(features)} features à traiter")

    geojson["features"] = [tag_feature(feat) for feat in features]

    # Statistiques
    ai_count = sum(1 for f in geojson["features"] if f["properties"].get("hosts_ai"))
    high_count = sum(
        1 for f in geojson["features"]
        if f["properties"].get("ai_confidence") == "high"
    )

    print(f"[tag_ai] hosts_ai=true  : {ai_count} / {len(features)}")
    print(f"[tag_ai] confidence=high : {high_count}")
    print(f"[tag_ai] confidence=inferred : {ai_count - high_count}")

    print(f"[tag_ai] Écriture in-place …")
    with open(GEOJSON_PATH, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, separators=(",", ":"))

    print("[tag_ai] Terminé.")

    # Exemple d'opérateurs tagués pour vérification rapide
    sample_ops = sorted({
        f["properties"].get("operator", "")
        for f in geojson["features"]
        if f["properties"].get("hosts_ai")
    })[:15]
    print("[tag_ai] Exemples d'opérateurs IA :", sample_ops)


if __name__ == "__main__":
    main()
