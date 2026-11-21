#!/usr/bin/env python3
"""Sondă JSON-LD: pentru fiecare retailer ia ~20 de pagini de produs din sitemap și raportează ce câmpuri
schema.org/Product publică (gtin, preț, monedă, disponibilitate). Nu scrie în nicio bază de date.

Respectă robots.txt, o cerere pe secundă, User-Agent cinstit. Dacă robots.txt interzice o pagină, o sărim.
"""
import argparse
import gzip
import json
import random
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

USER_AGENT = "Beavy-probe/0.1 (price comparison; https://github.com/CRJust/bvy.app)"
SITES = {
    "lidl": "https://www.lidl.ro",
    "penny": "https://www.penny.ro",
    "profi": "https://www.profi.ro",
    "atac": "https://www.atac.ro",
}
PRODUCT_HINT = re.compile(r"/(p|produs|produse|product|products|pd)/|/p\d|-p\d|/\d{5,}", re.I)
GTIN_KEYS = ("gtin", "gtin8", "gtin12", "gtin13", "gtin14", "isbn", "mpn", "sku")
DELAY = 1.0
_last = [0.0]


def fetch(url: str, timeout: int = 30) -> bytes:
    wait = DELAY - (time.monotonic() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.monotonic()
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        if r.headers.get("Content-Encoding") == "gzip" or data[:2] == b"\x1f\x8b":
            data = gzip.decompress(data)
        return data


class _LdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.blocks, self._in = [], False
        self._buf = []

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("type", "").lower() == "application/ld+json":
            self._in, self._buf = True, []

    def handle_endtag(self, tag):
        if tag == "script" and self._in:
            self.blocks.append("".join(self._buf))
            self._in = False

    def handle_data(self, data):
        if self._in:
            self._buf.append(data)


def _walk(node):
    if isinstance(node, list):
        for x in node:
            yield from _walk(x)
    elif isinstance(node, dict):
        yield node
        for v in node.values():
            if isinstance(v, (dict, list)):
                yield from _walk(v)


def _is_type(node, name):
    t = node.get("@type")
    return name in (t if isinstance(t, list) else [t])


def extract_product(html: str):
    """Primul obiect Product din JSON-LD, sub formă de rezumat; None dacă nu există."""
    p = _LdParser()
    p.feed(html)
    for raw in p.blocks:
        try:
            data = json.loads(raw.strip())
        except ValueError:
            continue
        for node in _walk(data):
            if _is_type(node, "Product"):
                offers = node.get("offers")
                offer = next((o for o in _walk(offers) if "price" in o or "lowPrice" in o), {}) if offers else {}
                return {
                    "name": bool(node.get("name")),
                    "brand": bool(node.get("brand")),
                    "gtin": {k: node[k] for k in GTIN_KEYS if node.get(k) and k.startswith("gtin")},
                    "sku": bool(node.get("sku")),
                    "price": offer.get("price", offer.get("lowPrice")),
                    "currency": offer.get("priceCurrency"),
                    "availability": offer.get("availability"),
                }
    return None


def sitemap_urls(robots_txt: str, base: str, limit_files: int = 6):
    """URL-uri din sitemap-urile declarate în robots.txt (sau /sitemap.xml), cu index imbricat."""
    queue = re.findall(r"(?im)^sitemap:\s*(\S+)", robots_txt) or [base + "/sitemap.xml"]
    seen, out = set(), []
    while queue and len(seen) < limit_files:
        sm = queue.pop(0)
        if sm in seen:
            continue
        seen.add(sm)
        try:
            root = ET.fromstring(fetch(sm))
        except Exception as e:  # sitemap lipsă sau neparsabil: trecem la următorul
            print("  sitemap indisponibil %s: %s" % (sm, e), file=sys.stderr)
            continue
        locs = [el.text.strip() for el in root.iter() if el.tag.endswith("loc") and el.text]
        if root.tag.endswith("sitemapindex"):
            queue.extend(locs)
        else:
            out.extend(locs)
    return out


def probe_site(name: str, base: str, n: int, seed: int) -> dict:
    res = {"site": name, "base": base, "checked": 0, "with_product": 0, "with_gtin": 0, "with_price": 0, "pages": [], "note": ""}
    try:
        robots_txt = fetch(base + "/robots.txt").decode("utf-8", "replace")
    except Exception as e:
        res["note"] = "robots.txt indisponibil: %s" % e
        robots_txt = ""
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(robots_txt.splitlines())
    urls = sitemap_urls(robots_txt, base)
    hinted = [u for u in urls if PRODUCT_HINT.search(urllib.parse.urlparse(u).path)]
    res["sitemap_urls"], res["product_like_urls"] = len(urls), len(hinted)
    pool = hinted or urls
    random.Random(seed).shuffle(pool)
    for url in pool:
        if res["checked"] >= n:
            break
        if not rp.can_fetch(USER_AGENT, url):
            continue
        res["checked"] += 1
        page = {"url": url}
        try:
            prod = extract_product(fetch(url).decode("utf-8", "replace"))
        except Exception as e:
            page["error"] = str(e)[:120]
            res["pages"].append(page)
            continue
        page["product"] = prod
        if prod:
            res["with_product"] += 1
            res["with_gtin"] += bool(prod["gtin"])
            res["with_price"] += prod["price"] is not None
        res["pages"].append(page)
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--sites", default=",".join(SITES))
    args = ap.parse_args()
    results = []
    for name in args.sites.split(","):
        print("== %s" % name)
        r = probe_site(name, SITES[name], args.n, args.seed)
        print("  pagini: %(checked)d, Product JSON-LD: %(with_product)d, cu gtin: %(with_gtin)d, cu preț: %(with_price)d "
              "(sitemap: %(sitemap_urls)d URL-uri, %(product_like_urls)d de produs)" % r)
        results.append(r)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
