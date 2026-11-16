#!/usr/bin/env python3
"""
Sync Lidl Prices Service
Descarcă lista oficială zilnică de prețuri publicată de Lidl România în format .xlsb,
o parsează structurat și generează public/data/lidl-prices.json.
Sursa: https://www.lidl.ro/explore/assets/webPriceData/ro/preturiZilniceLidl.xlsb
"""

import json
import os
import re
import ssl
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
import pyxlsb

LIDL_XLSB_URL = "https://www.lidl.ro/explore/assets/webPriceData/ro/preturiZilniceLidl.xlsb"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "data")
OUTPUT_JSON = os.path.join(OUTPUT_DIR, "lidl-prices.json")
TEMP_XLSB = os.path.join(OUTPUT_DIR, "lidl-daily.xlsb")

LIDL_PRIVATE_BRANDS = [
    "pilos", "camara noastra", "milbona", "bellarom", "tastino", "fin carre", "fin carré",
    "mister choc", "freeway", "solevita", "pikok", "dulano", "sondey", "w5", "cien",
    "freshona", "kania", "bon gelati", "chef select", "crownfield", "nautica", "deluxe",
    "lupilu", "formil", "alesto", "combino", "snack day", "floralys", "cien beauty",
    "cien men", "dentalux", "siti", "lord nelson", "castelloggy", "bister", "sanitas",
    "maribel", "campo largo", "trattoria alfredo", "toppo", "vitasia", "italiamo",
    "alpenfest", "sol&mar", "mcennedy", "orlando", "coshida", "silvercrest", "parkside"
]

NATIONAL_BRANDS = [
    "albalact", "zuzu", "napolact", "olympus", "danone", "hochland", "delaco",
    "covalact", "la dorna", "ladorna", "muller", "müller", "aqua carpatica",
    "borsec", "dorna", "bucovina", "perla harghitei", "coca-cola", "coca cola",
    "pepsi", "fanta", "sprite", "schweppes", "jacobs", "tchibo", "lavazza",
    "doncafe", "nescafe", "milka", "kinder", "nutella", "mondelez", "ferrero",
    "oreo", "raffaello", "nestle", "heidi", "maggi", "knorr", "barilla", "buitoni",
    "panzani", "pambac", "baneasa", "dobrogea", "vel pitar", "boromir", "seven days",
    "7days", "lays", "lay's", "chio", "star", "heineken", "tuborg", "timisoreana",
    "ursus", "ciuc", "bergenbier", "stella artois", "staropramen", "carlsberg",
    "cristim", "cris-tim", "matache macelaru", "sissi", "meda", "fragedo", "cocorico",
    "agricola", "perutnina", "unisol", "floriol", "bunge", "spornic", "argus"
]


def download_file(url: str, dest_path: str):
    """Descarcă fișierul folosind urllib sau fallback la curl dacă există erori SSL."""
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            data = resp.read()
            with open(dest_path, "wb") as f:
                f.write(data)
    except Exception as e:
        print(f"[sync-lidl] urllib failed ({e}), falling back to curl...", file=sys.stderr)
        res = subprocess.run(["curl", "-sSL", "-o", dest_path, url], check=False)
        if res.returncode != 0 or not os.path.exists(dest_path) or os.path.getsize(dest_path) < 1000:
            raise RuntimeError(f"Nu am putut descărca {url} via curl.")


def extract_brand(name: str) -> tuple[str | None, bool]:
    """Extrage brandul și returnează (brand, is_private_label)."""
    name_lower = name.lower()
    
    # 1. Verificare mărci proprii Lidl
    for pl in LIDL_PRIVATE_BRANDS:
        pattern = r"\b" + re.escape(pl) + r"\b"
        if re.search(pattern, name_lower):
            # Brand cu majusculă
            parts = [w.capitalize() for w in pl.split()]
            return " ".join(parts), True
            
    # 2. Verificare branduri naționale consacrate
    for nb in NATIONAL_BRANDS:
        pattern = r"\b" + re.escape(nb) + r"\b"
        if re.search(pattern, name_lower):
            parts = [w.capitalize() for w in nb.split()]
            return " ".join(parts), False
            
    # 3. Fallback: primul cuvânt dacă are majusculă și >= 3 litere
    first_word = name.split()[0] if name.split() else ""
    if len(first_word) >= 3 and first_word[0].isupper() and not first_word.lower() in ["bio", "mini", "sos", "unt", "lapte", "paine", "pâine"]:
        return first_word, False

    return None, False


def extract_fat_percentage(text: str) -> float | None:
    """Extrage procentul de grăsime (ex: '3.5%', '1,5%', '82%')."""
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*%", text)
    if m:
        try:
            val = float(m.group(1).replace(",", "."))
            if 0 < val <= 100:
                return round(val, 2)
        except ValueError:
            pass
    return None


def derive_normalized_unit_price(price: float, package_size: str, name: str) -> tuple[float | None, str | None]:
    """Calculează prețul per kg sau per litru."""
    combined = f"{package_size} {name}".lower().replace(",", ".")
    
    if "per kg" in combined or "la kg" in combined or "/kg" in combined or "vrac" in combined:
        return price, "RON/kg"
        
    # Volum lichide (litri / ml)
    vol_l = re.search(r"(\d+(?:\.\d+)?)\s*(?:l|litri|litru)\b", combined)
    if vol_l:
        l = float(vol_l.group(1))
        if l > 0:
            return round(price / l, 2), "RON/L"
            
    vol_ml = re.search(r"(\d+(?:\.\d+)?)\s*ml\b", combined)
    if vol_ml:
        ml = float(vol_ml.group(1))
        if ml > 0:
            return round(price / (ml / 1000.0), 2), "RON/L"
            
    # Masă solide (grame / kg)
    mass_kg = re.search(r"(\d+(?:\.\d+)?)\s*kg\b", combined)
    if mass_kg:
        kg = float(mass_kg.group(1))
        if kg > 0:
            return round(price / kg, 2), "RON/kg"
            
    mass_g = re.search(r"(\d+(?:\.\d+)?)\s*(?:g|gr|grame)\b", combined)
    if mass_g:
        g = float(mass_g.group(1))
        if g > 0:
            return round(price / (g / 1000.0), 2), "RON/kg"
            
    return None, None


def generate_item_slug(name: str, package_size: str) -> str:
    """Generează un slug curat pentru identificare deterministă."""
    clean = re.sub(r"[^a-z0-9]+", "-", f"{name} {package_size}".lower().strip()).strip("-")
    return clean[:80]


def parse_lidl_xlsb(file_path: str) -> list[dict]:
    """Parsează foaia de calcul .xlsb oficială Lidl."""
    products = []
    
    with pyxlsb.open_workbook(file_path) as wb:
        sheets = wb.sheets
        if not sheets:
            raise ValueError("Workbook nu conține foi de calcul.")
            
        sheet_name = sheets[0]
        with wb.get_sheet(sheet_name) as sheet:
            for idx, row in enumerate(sheet.rows()):
                if idx == 0:
                    continue  # Sărim peste antet (Denumire comerciala, Gramaj, Categorie, Pret vanzare)
                    
                vals = [cell.v for cell in row]
                if len(vals) < 4 or vals[0] is None or vals[3] is None:
                    continue
                    
                raw_name = str(vals[0]).strip().replace("\u00a0", " ")
                raw_pkg = str(vals[1]).strip().replace("\u00a0", " ") if vals[1] is not None else ""
                raw_cat = str(vals[2]).strip().replace("\u00a0", " ") if vals[2] is not None else "Altele"
                
                try:
                    price = round(float(vals[3]), 2)
                except (ValueError, TypeError):
                    continue
                    
                if price <= 0 or len(raw_name) < 2:
                    continue
                    
                # Excludere produse non-food evidente sau servicii (sacoșe, țigări la cererea utilizatorilor)
                if raw_cat in ["Tigari si tigarete", "Ziare si reviste"]:
                    continue
                    
                brand, is_pl = extract_brand(raw_name)
                fat = extract_fat_percentage(f"{raw_name} {raw_pkg}")
                norm_price, norm_unit = derive_normalized_unit_price(price, raw_pkg, raw_name)
                slug = generate_item_slug(raw_name, raw_pkg)
                
                products.append({
                    "id": f"lidl-{slug}",
                    "name": raw_name,
                    "package_size": raw_pkg,
                    "category": raw_cat,
                    "price": price,
                    "brand": brand,
                    "is_private_label": is_pl,
                    "fat_percentage": fat,
                    "normalized_unit_price": norm_price,
                    "normalized_unit_label": norm_unit,
                    "retailer_name": "Lidl",
                    "retailer_slug": "lidl",
                    "currency": "RON",
                })
                
    return products


def main():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Descărcare listă oficială Lidl România...")
    download_file(LIDL_XLSB_URL, TEMP_XLSB)
    file_size_kb = os.path.getsize(TEMP_XLSB) / 1024
    print(f"✓ Fișier XLSB descărcat cu succes ({file_size_kb:.1f} KB).")
    
    print("Parsare catalog de prețuri zilnice...")
    products = parse_lidl_xlsb(TEMP_XLSB)
    
    # Sortare alfabetică pe categorie și denumire
    products.sort(key=lambda x: (x["category"], x["name"]))
    
    payload = {
        "source": "Lidl România (Lista Oficială de Prețuri Zilnice)",
        "source_url": LIDL_XLSB_URL,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "total_count": len(products),
        "products": products,
    }
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        
    print(f"✓ Scris cu succes {len(products)} produse în {OUTPUT_JSON}")
    
    # Curățare fișier temporar
    if os.path.exists(TEMP_XLSB):
        os.remove(TEMP_XLSB)
        
    # Raport de sinteză categorii
    categories = {}
    for p in products:
        categories[p["category"]] = categories.get(p["category"], 0) + 1
        
    print("\nDefalcare pe categorii principale:")
    for cat, count in sorted(categories.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"  • {cat}: {count} produse")
        
    pl_count = sum(1 for p in products if p["is_private_label"])
    print(f"\nProduse marcă proprie identificate: {pl_count} ({pl_count / len(products) * 100:.1f}%)")


if __name__ == "__main__":
    main()
