#!/usr/bin/env python3
"""Build year-based client data for the Historical Rainfall Events & Frequency page."""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path


SOURCE_CSV = Path("/private/tmp/all_rain_gauge_frequency.csv")
OUTPUT_DIR = Path(
    "/Users/parthsharma/Projects/COH/RainWise_Historical/RainWise-Historical-Analysis/data/historical-frequency"
)
MIN_YEAR = 2002


def freq_category(freq: float | None) -> str | None:
    if freq is None:
        return None
    if freq < 1:
        return "<1_yr"
    if freq < 2:
        return "1-2_yr"
    if freq < 5:
        return "2-5_yr"
    return ">5_yr"


def read_joined_rows() -> dict[int, list[list[object]]]:
    pairs: dict[tuple[str, str, int], list[object]] = {}

    with SOURCE_CSV.open(newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            year = int(row["Timestamp"][:4])
            if year < MIN_YEAR:
                continue

            duration = row["Attribute"].split("_")[-1]
            key = (row["Timestamp"], duration, int(row["gauge_id"]))
            existing = pairs.get(key)
            if existing is None:
                existing = [row["Timestamp"], duration, int(row["gauge_id"]), None, None]
                pairs[key] = existing

            value = row["Value"].strip()
            num = round(float(value), 2) if value else None
            if row["Attribute"].startswith("max_value_"):
                existing[4] = num
            else:
                existing[3] = num

    by_year: dict[int, list[list[object]]] = defaultdict(list)
    for date, duration, gage, freq, rain in pairs.values():
        year = int(date[:4])
        by_year[year].append([date, duration, gage, freq, rain, freq_category(freq)])

    for rows in by_year.values():
        rows.sort(key=lambda row: (row[0], row[1], row[2]))

    return by_year


def build_meta(by_year: dict[int, list[list[object]]]) -> dict[str, object]:
    years = sorted(by_year)
    durations = ["1h", "2h", "3h", "6h", "12h", "24h"]
    max_rain = 0.0
    gages: set[int] = set()

    for rows in by_year.values():
        for _, _, gage, _, rain, _ in rows:
            gages.add(int(gage))
            if rain is not None and rain > max_rain:
                max_rain = float(rain)

    return {
        "years": years,
        "durations": durations,
        "defaultYear": 2025,
        "defaultDuration": "6h",
        "defaultMinRain": 1.0,
        "globalMinRain": 0.0,
        "globalMaxRain": round(max_rain, 2),
        "raingages": sorted(gages),
    }


def write_outputs(by_year: dict[int, list[list[object]]], meta: dict[str, object]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    meta_path = OUTPUT_DIR / "meta.js"
    meta_path.write_text(
        "window.HF_META = " + json.dumps(meta, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )

    for year, rows in by_year.items():
        out_path = OUTPUT_DIR / f"hf_{year}.js"
        payload = json.dumps(rows, separators=(",", ":"))
        out_path.write_text(
            "window.HF_YEAR_DATA = window.HF_YEAR_DATA || {};\n"
            f"window.HF_YEAR_DATA[{year}] = {payload};\n",
            encoding="utf-8",
        )


def main() -> None:
    by_year = read_joined_rows()
    meta = build_meta(by_year)
    write_outputs(by_year, meta)
    print(f"Wrote {len(by_year)} yearly files to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
