import https from 'node:https';
import { getSupabaseAdmin } from './lib/supabase-admin.mjs';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE_URL = 'https://monitorulpreturilor.info/pmonsvc/Retail';

const SECTOR_PROBES = [
  // Sector 1
  { sector: 1, neighborhood: 'Băneasa', lat: 44.4900, lon: 26.0780 },
  { sector: 1, neighborhood: 'Piața Victoriei', lat: 44.4520, lon: 26.0860 },
  { sector: 1, neighborhood: 'Bucureștii Noi', lat: 44.4850, lon: 26.0350 },
  // Sector 2
  { sector: 2, neighborhood: 'Obor / Tei', lat: 44.4550, lon: 26.1250 },
  { sector: 2, neighborhood: 'Colentina', lat: 44.4680, lon: 26.1450 },
  { sector: 2, neighborhood: 'Pantelimon', lat: 44.4450, lon: 26.1650 },
  // Sector 3
  { sector: 3, neighborhood: 'Titan / ParkLake', lat: 44.4220, lon: 26.1550 },
  { sector: 3, neighborhood: 'Theodor Pallady', lat: 44.4080, lon: 26.1850 },
  { sector: 3, neighborhood: 'Vitan / Unirii', lat: 44.4250, lon: 26.1250 },
  // Sector 4
  { sector: 4, neighborhood: 'Berceni / Grand Arena', lat: 44.3800, lon: 26.1250 },
  { sector: 4, neighborhood: 'Tineretului / Brâncoveanu', lat: 44.4050, lon: 26.1050 },
  // Sector 5
  { sector: 5, neighborhood: 'Rahova / Vulcan', lat: 44.4150, lon: 26.0650 },
  { sector: 5, neighborhood: 'Sebastian / 13 Septembrie', lat: 44.4220, lon: 26.0720 },
  // Sector 6
  { sector: 6, neighborhood: 'Drumul Taberei', lat: 44.4200, lon: 26.0280 },
  { sector: 6, neighborhood: 'Militari / Lujerului', lat: 44.4350, lon: 26.0100 },
  { sector: 6, neighborhood: 'Crângași / Grozăvești', lat: 44.4500, lon: 26.0500 },
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
  const secMatch = (addr || '').match(/SECTOR(?:UL)?\s*([1-6])\b/i);
  if (secMatch) return parseInt(secMatch[1], 10);

  const zipStr = String(zip || '').trim();
  if (/^0?[1-6]\d{4}$/.test(zipStr)) {
    const d = zipStr.startsWith('0') ? zipStr[1] : zipStr[0];
    return parseInt(d, 10);
  }

  if (lat && lon) {
    if (lat > 44.45 && lon < 26.10) return 1;
    if (lat > 44.44 && lon >= 26.10) return 2;
    if (lat <= 44.44 && lat > 44.39 && lon >= 26.11) return 3;
    if (lat <= 44.40 && lon >= 26.08) return 4;
    if (lat <= 44.43 && lon < 26.08 && lon > 26.04) return 5;
    if (lon <= 26.04) return 6;
  }
  return 1;
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

function cleanStoreTitle(retailerName, rawName, addr) {
  let title = (rawName || '').trim();
  // Strip redundant network prefixes
  title = title.replace(/^MI\s+/i, 'Mega Image ');
  title = title.replace(/^SG\s+/i, 'Shop&Go ');
  if (!title.toLowerCase().includes(retailerName.toLowerCase())) {
    title = `${retailerName} ${title}`;
  }
  return title;
}

async function main() {
  console.log('=== Sincronizare Noduri Fizice București pe Sectoare în Supabase ===\n');

  const supabase = await getSupabaseAdmin();

  // Load retailers
  const { data: retailers, error: retErr } = await supabase
    .from('beavy_retailers')
    .select('id, slug, name');
  if (retErr) throw retErr;

  const retailerBySlug = new Map(retailers.map(r => [r.slug, r]));

  // Probe Monitorul Prețurilor across Bucharest
  const discoveredStores = new Map();

  for (const probe of SECTOR_PROBES) {
    const url = `${BASE_URL}/GetStoresForProductsByLatLon?lat=${probe.lat}&lon=${probe.lon}&buffer=3500&csvprodids=1&OrderBy=price`;
    try {
      const xml = await fetchXml(url);
      const storeBlocks = [...xml.matchAll(/<RetailStore>([\s\S]*?)<\/RetailStore>/g)];

      for (const sb of storeBlocks) {
        const s = sb[1];
        const storeId = s.match(/<Id>(.*?)<\/Id>/)?.[1];
        if (!storeId || discoveredStores.has(storeId)) continue;

        const netId = s.match(/<Retailnetwork>[\s\S]*?<Id>(.*?)<\/Id>/)?.[1];
        const netInfo = NETWORK_MAP[netId];
        if (!netInfo) continue;

        const storeName = s.match(/<Name>(.*?)<\/Name>/)?.[1]?.trim() || '';
        const addr = s.match(/<Addrstring>(.*?)<\/Addrstring>/)?.[1]?.trim() || '';
        const zip = s.match(/<Zipcode>(.*?)<\/Zipcode>/)?.[1]?.trim() || '';
        const uat = s.match(/<Uatid>(.*?)<\/Uatid>/)?.[1]?.trim() || '';
        const lat = parseFloat(s.match(/<Lat>(.*?)<\/Lat>/)?.[1] || '0');
        const lon = parseFloat(s.match(/<Lon>(.*?)<\/Lon>/)?.[1] || '0');

        const isBuc = uat === '179132' || /bucuresti/i.test(addr) || (lat >= 44.33 && lat <= 44.55 && lon >= 25.95 && lon <= 26.25);
        if (!isBuc) continue;

        const sector = inferSector(addr, zip, lat, lon);

        discoveredStores.set(storeId, {
          storeId,
          slug: netInfo.slug,
          retailerName: netInfo.name,
          storeName,
          addr,
          zip,
          lat,
          lon,
          sector,
          neighborhood: probe.neighborhood,
        });
      }
    } catch (err) {
      console.warn(`Avertisment la proba ${probe.neighborhood}:`, err.message);
    }
  }

  console.log(`Descoperite ${discoveredStores.size} magazine fizice în București.`);

  // Build rows for beavy_fulfillment_nodes
  const nodesToUpsert = [];
  for (const st of discoveredStores.values()) {
    const ret = retailerBySlug.get(st.slug);
    if (!ret) continue;

    const nodeKey = `${st.slug}-sec${st.sector}-store-${st.storeId}`;
    const displayName = cleanStoreTitle(st.retailerName, st.storeName, st.addr);

    nodesToUpsert.push({
      retailer_id: ret.id,
      node_key: nodeKey,
      name: displayName,
      node_type: 'physical_store',
      fulfillment_channel: 'store',
      city: 'București',
      region: `Sector ${st.sector}`,
      country_code: 'RO',
      postal_code: st.zip || null,
      address: st.addr || null,
      external_node_id: st.storeId,
      latitude: st.lat || null,
      longitude: st.lon || null,
      source_url: 'https://monitorulpreturilor.info',
      is_active: true,
      metadata: {
        sector: st.sector,
        neighborhood: st.neighborhood,
        retailer_name: ret.name,
        source: 'monitorul_preturilor',
      },
    });
  }

  console.log(`Pregătite ${nodesToUpsert.length} noduri pentru inserare/actualizare în beavy_fulfillment_nodes.`);

  // Upsert in batches of 100 via RPC
  let upsertedCount = 0;
  for (let i = 0; i < nodesToUpsert.length; i += 100) {
    const batch = nodesToUpsert.slice(i, i + 100);
    const { data: count, error } = await supabase
      .rpc('beavy_sync_fulfillment_nodes', { p_nodes: batch });
    if (error) {
      console.error(`Eroare la upsert batch ${i}:`, error.message);
    } else {
      upsertedCount += Number(count || batch.length);
    }
  }

  console.log(`\n Succes: ${upsertedCount} magazine fizice din București salvate pe Sectoarele 1-6 în baza de date.`);

  // Summary per sector
  const { data: dbNodes } = await supabase
    .from('beavy_fulfillment_nodes')
    .select('region, metadata')
    .eq('city', 'București')
    .eq('node_type', 'physical_store');

  const sectorCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const n of dbNodes || []) {
    const sec = n.metadata?.sector;
    if (sec && sectorCounts[sec] !== undefined) {
      sectorCounts[sec]++;
    }
  }

  console.log('\nDistribuție finală în baza de date Beavy:');
  for (let s = 1; s <= 6; s++) {
    console.log(`  • Sectorul ${s}: ${sectorCounts[s]} magazine fizice active`);
  }
}

main().catch(console.error);
