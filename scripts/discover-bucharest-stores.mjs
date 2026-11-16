import https from 'node:https';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const agent = new https.Agent({ rejectUnauthorized: false });

const BASE_URL = 'https://monitorulpreturilor.info/pmonsvc/Retail';

const SECTOR_PROBES = [
  { sector: 1, name: 'Sector 1 (Baneasa / Victoriei / Bucurestii Noi)', lat: 44.4650, lon: 26.0750, buffer: 3500 },
  { sector: 2, name: 'Sector 2 (Obor / Colentina / Pantelimon)', lat: 44.4500, lon: 26.1350, buffer: 3500 },
  { sector: 3, name: 'Sector 3 (Titan / Vitan / Dristor / Pallady)', lat: 44.4150, lon: 26.1500, buffer: 3500 },
  { sector: 4, name: 'Sector 4 (Berceni / Oltenitei / Brancoveanu)', lat: 44.3850, lon: 26.1100, buffer: 3500 },
  { sector: 5, name: 'Sector 5 (Rahova / Sebastian / 13 Septembrie)', lat: 44.4050, lon: 26.0650, buffer: 3500 },
  { sector: 6, name: 'Sector 6 (Drumul Taberei / Militari / Crangasi)', lat: 44.4350, lon: 26.0150, buffer: 3500 },
];

const NETWORK_MAP = {
  'KAUFLAND': { slug: 'kaufland', name: 'Kaufland' },
  '4055329000008': { slug: 'lidl', name: 'Lidl' },
  'PENNY': { slug: 'penny', name: 'Penny' },
  'AUCHAN': { slug: 'auchan', name: 'Auchan' },
  '5940475006709': { slug: 'carrefour', name: 'Carrefour' },
  '5940475870003': { slug: 'mega-image', name: 'Mega Image' },
};

function inferSector(addr, zip, lat, lon) {
  // 1. Explicit in address: "SECTOR 1", "SECTORUL 2", etc.
  const secMatch = (addr || '').match(/SECTOR(?:UL)?\s*([1-6])\b/i);
  if (secMatch) return parseInt(secMatch[1], 10);

  // 2. Postal code (Romania Bucharest: 01xxxx=Sec 1, 02xxxx=Sec 2, etc.)
  const zipStr = String(zip || '').trim();
  if (/^0?[1-6]\d{4}$/.test(zipStr)) {
    const d = zipStr.startsWith('0') ? zipStr[1] : zipStr[0];
    return parseInt(d, 10);
  }

  // 3. Coordinate geometric fallback in Bucharest
  // Center is roughly 44.432, 26.106
  if (lat && lon) {
    if (lat > 44.45 && lon < 26.10) return 1; // Nord-Vest: Sector 1
    if (lat > 44.44 && lon >= 26.10) return 2; // Nord-Est: Sector 2
    if (lat <= 44.44 && lat > 44.39 && lon >= 26.11) return 3; // Est/Sud-Est: Sector 3
    if (lat <= 44.40 && lon >= 26.08) return 4; // Sud: Sector 4
    if (lat <= 44.43 && lon < 26.08 && lon > 26.04) return 5; // Sud-Vest: Sector 5
    if (lon <= 26.04) return 6; // Vest: Sector 6
  }

  return 1; // Default
}

function fetchXml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { rejectUnauthorized: false, timeout: 25000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== Scanare magazine fizice București pe Sectoare (Monitorul Prețurilor) ===\n');

  const allStores = new Map(); // id -> store

  for (const probe of SECTOR_PROBES) {
    const url = `${BASE_URL}/GetStoresForProductsByLatLon?lat=${probe.lat}&lon=${probe.lon}&buffer=${probe.buffer}&csvprodids=1&OrderBy=price`;
    try {
      const xml = await fetchXml(url);
      const storeBlocks = [...xml.matchAll(/<RetailStore>([\s\S]*?)<\/RetailStore>/g)];
      console.log(`Probe [${probe.name}]: ${storeBlocks.length} noduri returnate`);

      for (const sb of storeBlocks) {
        const s = sb[1];
        const storeId = s.match(/<Id>(.*?)<\/Id>/)?.[1];
        if (!storeId || allStores.has(storeId)) continue;

        const netId = s.match(/<Retailnetwork>[\s\S]*?<Id>(.*?)<\/Id>/)?.[1];
        const netInfo = NETWORK_MAP[netId];
        if (!netInfo) continue;

        const storeName = s.match(/<Name>(.*?)<\/Name>/)?.[1]?.trim() || '';
        const addr = s.match(/<Addrstring>(.*?)<\/Addrstring>/)?.[1]?.trim() || '';
        const zip = s.match(/<Zipcode>(.*?)<\/Zipcode>/)?.[1]?.trim() || '';
        const uat = s.match(/<Uatid>(.*?)<\/Uatid>/)?.[1]?.trim() || '';
        const lat = parseFloat(s.match(/<Lat>(.*?)<\/Lat>/)?.[1] || '0');
        const lon = parseFloat(s.match(/<Lon>(.*?)<\/Lon>/)?.[1] || '0');

        // Include only Bucharest (UAT 179132 or within city bounds)
        const isBucuresti = uat === '179132' || /bucuresti/i.test(addr) || (lat >= 44.33 && lat <= 44.55 && lon >= 25.95 && lon <= 26.25);
        if (!isBucuresti) continue;

        const sector = inferSector(addr, zip, lat, lon);

        allStores.set(storeId, {
          storeId,
          networkId: netId,
          retailerSlug: netInfo.slug,
          retailerName: netInfo.name,
          storeName,
          address: addr,
          zipcode: zip,
          lat,
          lon,
          sector,
        });
      }
    } catch (err) {
      console.error(`Eroare la probe [${probe.name}]:`, err.message);
    }
  }

  console.log(`\nTotal magazine unice identificate în București: ${allStores.size}\n`);

  // Breakdown per Sector and Retailer
  const sectorMatrix = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {} };
  for (const s of [1, 2, 3, 4, 5, 6]) {
    for (const slug of ['kaufland', 'lidl', 'penny', 'carrefour', 'auchan', 'mega-image']) {
      sectorMatrix[s][slug] = 0;
    }
  }

  for (const store of allStores.values()) {
    const sec = store.sector;
    if (sectorMatrix[sec] && sectorMatrix[sec][store.retailerSlug] !== undefined) {
      sectorMatrix[sec][store.retailerSlug]++;
    }
  }

  console.log('------------------------------------------------------------------------------------------');
  console.log('Distribuția magazinelor fizice pe Sectoare în București (date oficiale active):');
  console.log('------------------------------------------------------------------------------------------');
  console.log('| Sector   | Kaufland | Lidl | Penny | Carrefour | Auchan | Mega Image | Total Sector |');
  console.log('|----------|----------|------|-------|-----------|--------|------------|--------------|');

  for (let s = 1; s <= 6; s++) {
    const row = sectorMatrix[s];
    const totalSec = Object.values(row).reduce((a, b) => a + b, 0);
    console.log(
      `| Sector ${s} |    ${String(row.kaufland).padStart(2)}    |  ${String(row.lidl).padStart(2)}  |   ${String(row.penny).padStart(2)}  |    ${String(row.carrefour).padStart(2)}     |   ${String(row.auchan).padStart(2)}   |     ${String(row['mega-image']).padStart(3)}    |      ${String(totalSec).padStart(3)}     |`
    );
  }
  console.log('------------------------------------------------------------------------------------------');

  // Show samples for each sector
  console.log('\nExemple reprezentative de magazine per sector:');
  for (let s = 1; s <= 6; s++) {
    const storesInSec = [...allStores.values()].filter(st => st.sector === s);
    const topStores = storesInSec.slice(0, 4).map(st => `${st.retailerName} (${st.storeName} - ${st.address})`).join('\n    • ');
    console.log(`\n• SECTORUL ${s} (${storesInSec.length} magazine monitorizate):`);
    console.log(`    • ${topStores}`);
  }
}

main().catch(console.error);
