/**
/**
 * Bucharest Sectors (Sectoarele 1-6) Topology & Store Mapping for Beavy
 */

export const BUCHAREST_SECTORS = [
  {
    sector: 1,
    name: 'Sectorul 1',
    description: 'Nord & Centru-Nord',
    neighborhoods: ['Băneasa', 'Piața Victoriei', 'Dorobanți', 'Bucureștii Noi', 'Aviației', 'Pajura', 'Grivița'],
    postalCodePrefix: '01',
    centerLat: 44.4650,
    centerLon: 26.0750,
  },
  {
    sector: 2,
    name: 'Sectorul 2',
    description: 'Nord-Est & Est',
    neighborhoods: ['Obor', 'Colentina', 'Pantelimon', 'Tei', 'Baicului', 'Iancului', 'Floreasca', 'Ferdinand'],
    postalCodePrefix: '02',
    centerLat: 44.4500,
    centerLon: 26.1350,
  },
  {
    sector: 3,
    name: 'Sectorul 3',
    description: 'Est & Sud-Est',
    neighborhoods: ['Titan', 'Vitan', 'Dristor', 'Theodor Pallady', 'Balta Albă', 'Unirii', 'Muncii'],
    postalCodePrefix: '03',
    centerLat: 44.4150,
    centerLon: 26.1500,
  },
  {
    sector: 4,
    name: 'Sectorul 4',
    description: 'Sud',
    neighborhoods: ['Berceni', 'Olteniței', 'Constantin Brâncoveanu', 'Metalurgiei', 'Tineretului', 'Grand Arena'],
    postalCodePrefix: '04',
    centerLat: 44.3850,
    centerLon: 26.1100,
  },
  {
    sector: 5,
    name: 'Sectorul 5',
    description: 'Sud-Vest',
    neighborhoods: ['Rahova', '13 Septembrie', 'Sebastian', 'Panduri', 'Cotroceni', 'Ferentari', 'Salaj'],
    postalCodePrefix: '05',
    centerLat: 44.4050,
    centerLon: 26.0650,
  },
  {
    sector: 6,
    name: 'Sectorul 6',
    description: 'Vest',
    neighborhoods: ['Drumul Taberei', 'Militari', 'Crângași', 'Lujerului', 'Gorjului', 'Valea Oltului', 'Grozăvești'],
    postalCodePrefix: '06',
    centerLat: 44.4350,
    centerLon: 26.0150,
  },
];

export function inferBucharestSector(addr, zip, lat, lon) {
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

export async function getStoresForBucharestSector(supabase, sectorNumber) {
  const { data, error } = await supabase
    .from('beavy_fulfillment_nodes')
    .select(`
      id,
      node_key,
      name,
      address,
      postal_code,
      latitude,
      longitude,
      metadata,
      beavy_retailers (
        id,
        slug,
        name
      )
    `)
    .eq('city', 'București')
    .eq('region', `Sector ${sectorNumber}`)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data || [];
}
