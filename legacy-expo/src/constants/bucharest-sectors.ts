/**
 * Bucharest Sectors (Sectoarele 1-6) Topology & Metadata for Beavy
 */

export type BucharestSector = {
  sector: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  shortName: string;
  description: string;
  neighborhoods: string[];
  postalCodePrefix: string;
  centerLat: number;
  centerLon: number;
};

export const BUCHAREST_SECTORS: BucharestSector[] = [
  {
    sector: 1,
    name: 'Sectorul 1',
    shortName: 'Sector 1',
    description: 'Băneasa · Victoriei · Dorobanți · Bucureștii Noi · Aviației',
    neighborhoods: ['Băneasa', 'Piața Victoriei', 'Dorobanți', 'Bucureștii Noi', 'Aviației', 'Pajura', 'Grivița'],
    postalCodePrefix: '01',
    centerLat: 44.4650,
    centerLon: 26.0750,
  },
  {
    sector: 2,
    name: 'Sectorul 2',
    shortName: 'Sector 2',
    description: 'Obor · Colentina · Pantelimon · Tei · Baicului · Iancului',
    neighborhoods: ['Obor', 'Colentina', 'Pantelimon', 'Tei', 'Baicului', 'Iancului', 'Floreasca', 'Ferdinand'],
    postalCodePrefix: '02',
    centerLat: 44.4500,
    centerLon: 26.1350,
  },
  {
    sector: 3,
    name: 'Sectorul 3',
    shortName: 'Sector 3',
    description: 'Titan · Vitan · Dristor · Theodor Pallady · Unirii',
    neighborhoods: ['Titan', 'Vitan', 'Dristor', 'Theodor Pallady', 'Balta Albă', 'Unirii', 'Muncii'],
    postalCodePrefix: '03',
    centerLat: 44.4150,
    centerLon: 26.1500,
  },
  {
    sector: 4,
    name: 'Sectorul 4',
    shortName: 'Sector 4',
    description: 'Berceni · Olteniței · Constantin Brâncoveanu · Grand Arena',
    neighborhoods: ['Berceni', 'Olteniței', 'Constantin Brâncoveanu', 'Metalurgiei', 'Tineretului', 'Grand Arena'],
    postalCodePrefix: '04',
    centerLat: 44.3850,
    centerLon: 26.1100,
  },
  {
    sector: 5,
    name: 'Sectorul 5',
    shortName: 'Sector 5',
    description: 'Rahova · 13 Septembrie · Sebastian · Panduri · Cotroceni',
    neighborhoods: ['Rahova', '13 Septembrie', 'Sebastian', 'Panduri', 'Cotroceni', 'Ferentari', 'Salaj'],
    postalCodePrefix: '05',
    centerLat: 44.4050,
    centerLon: 26.0650,
  },
  {
    sector: 6,
    name: 'Sectorul 6',
    shortName: 'Sector 6',
    description: 'Drumul Taberei · Militari · Crângași · Lujerului · Gorjului',
    neighborhoods: ['Drumul Taberei', 'Militari', 'Crângași', 'Lujerului', 'Gorjului', 'Valea Oltului', 'Grozăvești'],
    postalCodePrefix: '06',
    centerLat: 44.4350,
    centerLon: 26.0150,
  },
];

export function getSectorByNumber(num: number | null | undefined): BucharestSector | null {
  if (!num || num < 1 || num > 6) return null;
  return BUCHAREST_SECTORS.find((s) => s.sector === num) ?? null;
}

export function formatBucharestLocation(city: string, sector?: number | null): string {
  if (!sector || sector < 1 || sector > 6) {
    return city || 'București';
  }
  return `${city || 'București'} · Sector ${sector}`;
}
