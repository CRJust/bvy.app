#!/usr/bin/env python3
"""Descarcă exportul Open Food Facts (CSV, ~1,5 GB .gz) și păstrează doar produsele vândute în România.

Rulează în GitHub Actions (vezi .github/workflows/off-ro-export.yml). Nu scrie nimic în Supabase.
Ieșire: TSV gzip cu coloanele code, name, brands, quantity (doar EAN-uri valide: 8 sau 13 cifre).
Date: © contribuitorii Open Food Facts, licență ODbL (atribuire obligatorie unde se afișează).
"""
import argparse
import csv
import gzip
import io
import sys
import urllib.request

EXPORT = "https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz"
USER_AGENT = "Beavy-off-ro/0.1 (price comparison; https://github.com/CRJust/bvy.app)"
NEEDED = ("code", "product_name", "brands", "quantity", "countries_tags")


def valid_ean(code: str) -> bool:
    """EAN-8 / EAN-13 cu cifră de control GS1 corectă."""
    if not code.isdigit() or len(code) not in (8, 13):
        return False
    digits = [int(c) for c in code]
    body, check = digits[:-1], digits[-1]
    total = sum(d * (3 if i % 2 == (len(body) - 1) % 2 else 1) for i, d in enumerate(body))
    return (10 - total % 10) % 10 == check


def romania_rows(lines):
    """Generator de dicturi pentru rândurile din România. `lines` = iterabil de linii text."""
    reader = csv.reader(lines, delimiter="\t", quoting=csv.QUOTE_NONE)
    header = next(reader, None)
    if not header:
        return
    col = {name: i for i, name in enumerate(header)}
    missing = [c for c in NEEDED if c not in col]
    if missing:
        raise ValueError("coloane lipsă în export: %s" % ", ".join(missing))
    width = len(header)
    for row in reader:
        if len(row) < width:
            continue
        tags = row[col["countries_tags"]]
        if "en:romania" not in tags.split(","):
            continue
        code = row[col["code"]].strip()
        if not valid_ean(code):
            continue
        yield {k: row[col[k]].replace("\t", " ").replace("\n", " ").strip() for k in ("code", "product_name", "brands", "quantity")}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="fișier .tsv.gz de ieșire")
    ap.add_argument("--source", default=EXPORT, help="URL sau cale locală către exportul .csv.gz")
    args = ap.parse_args()

    if args.source.startswith("http"):
        req = urllib.request.Request(args.source, headers={"User-Agent": USER_AGENT})
        raw = urllib.request.urlopen(req, timeout=120)
    else:
        raw = open(args.source, "rb")
    text = io.TextIOWrapper(gzip.GzipFile(fileobj=raw), encoding="utf-8", errors="replace", newline="")
    n = 0
    with gzip.open(args.out, "wt", encoding="utf-8", newline="") as out:
        out.write("code\tname\tbrands\tquantity\n")
        for r in romania_rows(text):
            out.write("%s\t%s\t%s\t%s\n" % (r["code"], r["product_name"], r["brands"], r["quantity"]))
            n += 1
    print("produse România cu EAN valid: %d" % n)
    if n == 0:
        print("niciun produs: formatul exportului s-a schimbat?", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
