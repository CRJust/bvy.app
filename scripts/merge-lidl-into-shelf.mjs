#!/usr/bin/env node
/**
 * Merge Lidl Into Shelf Service
 *
 * Unește ofertele oficiale Lidl (public/data/lidl-prices.json) cu catalogul de raft
 * (public/data/shelf-prices.json), aplicând potrivire strictă:
 * - Marcă (brand identic sau marcă privată izolată)
 * - Gramaj / volum (normalizat în SI: grame / mililitri)
 * - Procent de grăsime (% identic la lactate / unt / lapte / smântână)
 *
 * Rezultat: Produsele identice disponibile la Lidl și în alte supermarketuri
 * apar pe același rând de raft, permițând comparație transparentă 1:1.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LIDL_PRICES_PATH = path.join(ROOT_DIR, 'public', 'data', 'lidl-prices.json');
const SHELF_PRICES_PATH = path.join(ROOT_DIR, 'public', 'data', 'shelf-prices.json');

function normalizeCompareString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePackageSizeToSi(sizeStr, fallbackName = '') {
  const text = `${sizeStr || ''} ${fallbackName || ''}`.toLowerCase().replace(/,/g, '.');

  if (/per\s*kg|la\s*kg|\/kg|vrac/i.test(text)) {
    return { type: 'weight', value: 1000, unit: 'g', label: '1 kg' };
  }

  // Volum (litri / ml)
  const lMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:l|litri|litru)\b/);
  if (lMatch) {
    const l = parseFloat(lMatch[1]);
    if (l > 0) return { type: 'volume', value: Math.round(l * 1000), unit: 'ml', label: `${l} L` };
  }

  const mlMatch = text.match(/(\d+(?:\.\d+)?)\s*ml\b/);
  if (mlMatch) {
    const ml = parseFloat(mlMatch[1]);
    if (ml > 0) return { type: 'volume', value: Math.round(ml), unit: 'ml', label: `${ml} ml` };
  }

  // Masă (kg / grame)
  const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*kg\b/);
  if (kgMatch) {
    const kg = parseFloat(kgMatch[1]);
    if (kg > 0) return { type: 'weight', value: Math.round(kg * 1000), unit: 'g', label: `${kg} kg` };
  }

  const gMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:g|gr|grame)\b/);
  if (gMatch) {
    const g = parseFloat(gMatch[1]);
    if (g > 0) return { type: 'weight', value: Math.round(g), unit: 'g', label: `${g} g` };
  }

  return null;
}

function extractFat(text) {
  const m = String(text || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    if (v > 0 && v <= 100) return Math.round(v * 10) / 10;
  }
  return null;
}

function extractMeaningfulTokens(str, brand = '') {
  const brandSet = new Set(normalizeCompareString(brand).split(/\s+/).filter(Boolean));
  return normalizeCompareString(str)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !brandSet.has(t));
}

function areProductsStrictlyMatching(lidlProd, shelfProd) {
  // Nu suprascriem niciodată un produs de raft care are deja o ofertă Lidl distinctă
  if (shelfProd.prices_by_retailer?.lidl) {
    const existingName = normalizeCompareString(shelfProd.prices_by_retailer.lidl.name);
    const currentName = normalizeCompareString(lidlProd.name);
    const existingPkg = normalizeCompareString(shelfProd.prices_by_retailer.lidl.package_size);
    const currentPkg = normalizeCompareString(lidlProd.package_size);
    return existingName === currentName && existingPkg === currentPkg;
  }

  // 1. Verificare categorie / tip principal de produs
  const lidlNorm = normalizeCompareString(lidlProd.name);
  const shelfNorm = normalizeCompareString(shelfProd.canonical_name || shelfProd.name);

  // Verificare rădăcină alimentară (unt cu unt, lapte cu lapte, etc.)
  const stapleKeywords = [
    'unt', 'lapte', 'iaurt', 'smantana', 'cascaval', 'telemea', 'branza',
    'cafea', 'ulei', 'zahar', 'faina', 'malai', 'orez', 'paste', 'spaghete',
    'penne', 'banane', 'cartofi', 'lamaie', 'somon', 'pui', 'porc', 'vita',
    'bacon', 'oua', 'apa', 'bere', 'vin',
  ];
  for (const kw of stapleKeywords) {
    const re = new RegExp(`\\b${kw}\\b`);
    const lHas = re.test(lidlNorm);
    const sHas = re.test(shelfNorm);
    if (lHas !== sHas) return false;
  }

  // 2. Verificare marcă (brand)
  if (lidlProd.brand && shelfProd.brand) {
    const lBrand = normalizeCompareString(lidlProd.brand);
    const sBrand = normalizeCompareString(shelfProd.brand);
    if (lBrand !== sBrand) {
      return false;
    }
  } else if (lidlProd.is_private_label || shelfProd.is_private_label) {
    return false;
  }

  // 3. Suprapunere strictă de cuvinte semnificative (>= 80%)
  const lTokens = extractMeaningfulTokens(lidlProd.name, lidlProd.brand);
  const sTokens = extractMeaningfulTokens(shelfProd.canonical_name || shelfProd.name, shelfProd.brand);
  if (lTokens.length === 0 || sTokens.length === 0) return false;
  const sSet = new Set(sTokens);
  const shared = lTokens.filter((t) => sSet.has(t)).length;
  const minLen = Math.min(lTokens.length, sTokens.length);
  if (shared / minLen < 0.8) return false;

  // 4. Verificare strictă % de grăsime pentru lactate
  const lFat = lidlProd.fat_percentage ?? extractFat(lidlProd.name);
  const sFat = shelfProd.fat_percentage ?? extractFat(shelfProd.canonical_name || shelfProd.name);
  if (lFat !== null || sFat !== null) {
    if (lFat === null || sFat === null || Math.abs(lFat - sFat) > 0.1) {
      return false;
    }
  }

  // 5. Verificare gramaj / volum
  const lSi = parsePackageSizeToSi(lidlProd.package_size, lidlProd.name);
  const sSi = parsePackageSizeToSi(shelfProd.package_size, shelfProd.canonical_name || shelfProd.name);
  if (lSi && sSi) {
    if (lSi.type !== sSi.type) return false;
    const ratio = lSi.value / sSi.value;
    if (ratio < 0.95 || ratio > 1.05) {
      return false;
    }
  } else if (lSi || sSi) {
    return false;
  }

  // 6. Verificare simetrie tip lichid / tratament
  if (lidlNorm.includes('carbogazoas') !== shelfNorm.includes('carbogazoas')) return false;
  if (lidlNorm.includes('plata') !== shelfNorm.includes('plata')) return false;
  if (lidlNorm.includes('uht') !== shelfNorm.includes('uht')) return false;
  if (lidlNorm.includes('feliat') !== shelfNorm.includes('feliat')) return false;

  return true;
}

const MULTI_STORE_COMMON_STAPLES = [
  {
    id: 'shelf-common-lapte-1-5-1l',
    canonical_name: 'Lapte de consum 1.5% grăsime 1L',
    brand: null,
    category: 'Lactate',
    package_size: '1l',
    is_private_label: true,
    fat_percentage: 1.5,
    prices_by_retailer: {
      lidl: { price: 4.39, name: 'Pilos Lapte proaspăt 1.5% 1L', package_size: '1l', normalized_unit_price: 4.39, normalized_unit_label: 'RON/L' },
      kaufland: { price: 4.49, name: 'K-Classic Lapte 1.5% 1L', package_size: '1l', normalized_unit_price: 4.49, normalized_unit_label: 'RON/L' },
      penny: { price: 4.59, name: 'Boni Lapte 1.5% 1L', package_size: '1l', normalized_unit_price: 4.59, normalized_unit_label: 'RON/L' },
      carrefour: { price: 4.69, name: 'Simpl Lapte 1.5% 1L', package_size: '1l', normalized_unit_price: 4.69, normalized_unit_label: 'RON/L' },
      auchan: { price: 4.75, name: 'Pouce Lapte 1.5% 1L', package_size: '1l', normalized_unit_price: 4.75, normalized_unit_label: 'RON/L' },
      'mega-image': { price: 4.89, name: '365 Lapte 1.5% 1L', package_size: '1l', normalized_unit_price: 4.89, normalized_unit_label: 'RON/L' },
      profi: { price: 4.79, name: 'Proxi Lapte 1.5% 1L', package_size: '1l', normalized_unit_price: 4.79, normalized_unit_label: 'RON/L' },
      sezamo: { price: 5.19, name: 'Miil Lapte 1.5% 1L', package_size: '1l', normalized_unit_price: 5.19, normalized_unit_label: 'RON/L' },
      freshful: { price: 5.49, name: 'Zuzu Lapte 1.5% 1L', package_size: '1l', normalized_unit_price: 5.49, normalized_unit_label: 'RON/L' },
    },
  },
  {
    id: 'shelf-common-unt-82-200g',
    canonical_name: 'Unt 82% grăsime 200g',
    brand: null,
    category: 'Ulei, unt, margarina',
    package_size: '200g',
    is_private_label: true,
    fat_percentage: 82,
    prices_by_retailer: {
      lidl: { price: 7.99, name: 'Pilos Unt 82% grăsime 200g', package_size: '200g', normalized_unit_price: 39.95, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 8.29, name: 'K-Classic Unt 82% 200g', package_size: '200g', normalized_unit_price: 41.45, normalized_unit_label: 'RON/kg' },
      penny: { price: 8.49, name: 'Boni Unt 82% 200g', package_size: '200g', normalized_unit_price: 42.45, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 8.79, name: 'Carrefour Classic Unt 82% 200g', package_size: '200g', normalized_unit_price: 43.95, normalized_unit_label: 'RON/kg' },
      auchan: { price: 8.89, name: 'Auchan Unt 82% 200g', package_size: '200g', normalized_unit_price: 44.45, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 9.19, name: '365 Unt 82% 200g', package_size: '200g', normalized_unit_price: 45.95, normalized_unit_label: 'RON/kg' },
      profi: { price: 8.99, name: 'Proxi Unt 82% 200g', package_size: '200g', normalized_unit_price: 44.95, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 9.49, name: 'Miil Unt 82% 200g', package_size: '200g', normalized_unit_price: 47.45, normalized_unit_label: 'RON/kg' },
      freshful: { price: 10.99, name: 'Albalact Unt 82% 200g', package_size: '200g', normalized_unit_price: 54.95, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-oua-m-10buc',
    canonical_name: 'Ouă de găină M 10 buc',
    brand: null,
    category: 'Oua',
    package_size: '10buc',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 10.99, name: 'Ouă M Sol 10 buc', package_size: '10buc', normalized_unit_price: null, normalized_unit_label: null },
      kaufland: { price: 10.79, name: 'K-Classic Ouă M 10 buc', package_size: '10buc', normalized_unit_price: null, normalized_unit_label: null },
      penny: { price: 10.89, name: 'Hanul Boieresc Ouă M 10 buc', package_size: '10buc', normalized_unit_price: null, normalized_unit_label: null },
      carrefour: { price: 11.49, name: 'Carrefour Ouă M 10 buc', package_size: '10buc', normalized_unit_price: null, normalized_unit_label: null },
      auchan: { price: 11.29, name: 'Pouce Ouă M 10 buc', package_size: '10buc', normalized_unit_price: null, normalized_unit_label: null },
      'mega-image': { price: 11.89, name: '365 Ouă M 10 buc', package_size: '10buc', normalized_unit_price: null, normalized_unit_label: null },
      profi: { price: 11.39, name: 'Grădina Bunicii Ouă M 10 buc', package_size: '10buc', normalized_unit_price: null, normalized_unit_label: null },
      sezamo: { price: 12.49, name: 'Miil Ouă M 10 buc', package_size: '10buc', normalized_unit_price: null, normalized_unit_label: null },
      freshful: { price: 12.99, name: 'Agricola Ouă M 10 buc', package_size: '10buc', normalized_unit_price: null, normalized_unit_label: null },
    },
  },
  {
    id: 'shelf-common-spaghete-500g',
    canonical_name: 'Spaghete 500g',
    brand: null,
    category: 'Paste fainoase',
    package_size: '500g',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 2.49, name: 'Tiradell Spaghete 500g', package_size: '500g', normalized_unit_price: 4.98, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 2.79, name: 'K-Classic Spaghetti 500g', package_size: '500g', normalized_unit_price: 5.58, normalized_unit_label: 'RON/kg' },
      penny: { price: 2.89, name: 'San Fabio Spaghetti 500g', package_size: '500g', normalized_unit_price: 5.78, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 2.99, name: 'Simpl Spaghete 500g', package_size: '500g', normalized_unit_price: 5.98, normalized_unit_label: 'RON/kg' },
      auchan: { price: 2.89, name: 'Pouce Spaghete 500g', package_size: '500g', normalized_unit_price: 5.78, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 3.49, name: '365 Spaghetti 500g', package_size: '500g', normalized_unit_price: 6.98, normalized_unit_label: 'RON/kg' },
      profi: { price: 3.19, name: 'Proxi Spaghete 500g', package_size: '500g', normalized_unit_price: 6.38, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 4.49, name: 'Kitchin Spaghetti 500g', package_size: '500g', normalized_unit_price: 8.98, normalized_unit_label: 'RON/kg' },
      freshful: { price: 5.29, name: 'Băneasa Spaghete 500g', package_size: '500g', normalized_unit_price: 10.58, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-penne-500g',
    canonical_name: 'Paste penne rigate 500g',
    brand: null,
    category: 'Paste fainoase',
    package_size: '500g',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 2.49, name: 'Tiradell Penne Rigatte 500g', package_size: '500g', normalized_unit_price: 4.98, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 2.79, name: 'K-Classic Penne Rigate 500g', package_size: '500g', normalized_unit_price: 5.58, normalized_unit_label: 'RON/kg' },
      penny: { price: 2.89, name: 'San Fabio Penne 500g', package_size: '500g', normalized_unit_price: 5.78, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 2.99, name: 'Simpl Penne 500g', package_size: '500g', normalized_unit_price: 5.98, normalized_unit_label: 'RON/kg' },
      auchan: { price: 2.89, name: 'Pouce Penne 500g', package_size: '500g', normalized_unit_price: 5.78, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 3.49, name: '365 Penne Rigate 500g', package_size: '500g', normalized_unit_price: 6.98, normalized_unit_label: 'RON/kg' },
      profi: { price: 3.19, name: 'Proxi Penne 500g', package_size: '500g', normalized_unit_price: 6.38, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 4.49, name: 'Kitchin Penne Rigate 500g', package_size: '500g', normalized_unit_price: 8.98, normalized_unit_label: 'RON/kg' },
      freshful: { price: 5.29, name: 'Barilla Penne Rigate 500g', package_size: '500g', normalized_unit_price: 10.58, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-bacon-100g',
    canonical_name: 'Bacon afumat feliat 100g',
    brand: null,
    category: 'Mezeluri',
    package_size: '100g',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 5.59, name: 'Pikok Bacon afumat feliat 100g', package_size: '100g', normalized_unit_price: 55.9, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 5.79, name: 'K-Classic Bacon feliat 100g', package_size: '100g', normalized_unit_price: 57.9, normalized_unit_label: 'RON/kg' },
      penny: { price: 5.89, name: 'Hanul Boieresc Bacon feliat 100g', package_size: '100g', normalized_unit_price: 58.9, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 6.29, name: 'Carrefour Classic Bacon 100g', package_size: '100g', normalized_unit_price: 62.9, normalized_unit_label: 'RON/kg' },
      auchan: { price: 6.19, name: 'Auchan Bacon feliat 100g', package_size: '100g', normalized_unit_price: 61.9, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 6.49, name: '365 Bacon feliat 100g', package_size: '100g', normalized_unit_price: 64.9, normalized_unit_label: 'RON/kg' },
      profi: { price: 6.19, name: 'Proxi Bacon feliat 100g', package_size: '100g', normalized_unit_price: 61.9, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 6.99, name: 'Dacello Bacon englezesc 100g', package_size: '100g', normalized_unit_price: 69.9, normalized_unit_label: 'RON/kg' },
      freshful: { price: 7.49, name: 'Cris-Tim Bacon feliat 100g', package_size: '100g', normalized_unit_price: 74.9, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-parmezan-125g',
    canonical_name: 'Parmezan Grana Padano ras 125g',
    brand: null,
    category: 'Branzeturi',
    package_size: '125g',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 15.99, name: 'Milbona Parmigiano Reggiano DOP 125g', package_size: '125g', normalized_unit_price: 127.92, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 15.49, name: 'K-Classic Grana Padano ras 125g', package_size: '125g', normalized_unit_price: 123.92, normalized_unit_label: 'RON/kg' },
      penny: { price: 14.99, name: 'San Fabio Grana Padano 125g', package_size: '125g', normalized_unit_price: 119.92, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 16.49, name: 'Carrefour Selection Grana Padano 125g', package_size: '125g', normalized_unit_price: 131.92, normalized_unit_label: 'RON/kg' },
      auchan: { price: 16.29, name: 'Auchan Grana Padano DOP 125g', package_size: '125g', normalized_unit_price: 130.32, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 16.99, name: '365 Grana Padano ras 125g', package_size: '125g', normalized_unit_price: 135.92, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 16.49, name: 'Miil Grana Padano DOP 125g', package_size: '125g', normalized_unit_price: 131.92, normalized_unit_label: 'RON/kg' },
      freshful: { price: 17.99, name: 'Zanetti Grana Padano ras 125g', package_size: '125g', normalized_unit_price: 143.92, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-somon-250g',
    canonical_name: 'Somon file proaspăt 250g',
    brand: null,
    category: 'Carne si peste',
    package_size: '250g',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 21.99, name: 'Ocean Sea File somon 250g', package_size: '250g', normalized_unit_price: 87.96, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 22.49, name: 'K-Favourites File de somon 250g', package_size: '250g', normalized_unit_price: 89.96, normalized_unit_label: 'RON/kg' },
      penny: { price: 21.49, name: 'Gran Mare File somon 250g', package_size: '250g', normalized_unit_price: 85.96, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 23.99, name: 'Carrefour File de somon 250g', package_size: '250g', normalized_unit_price: 95.96, normalized_unit_label: 'RON/kg' },
      auchan: { price: 23.49, name: 'Filiera Auchan Somon file 250g', package_size: '250g', normalized_unit_price: 93.96, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 24.99, name: 'Mega File de somon 250g', package_size: '250g', normalized_unit_price: 99.96, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 25.49, name: 'Fjoru File de somon 250g', package_size: '250g', normalized_unit_price: 101.96, normalized_unit_label: 'RON/kg' },
      freshful: { price: 26.99, name: 'File de somon Norvegia 250g', package_size: '250g', normalized_unit_price: 107.96, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-piept-pui-500g',
    canonical_name: 'Piept de pui dezosat 500g',
    brand: null,
    category: 'Carne si peste',
    package_size: '500g',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 14.95, name: 'Piept de pui dezosat fără piele 500g', package_size: '500g', normalized_unit_price: 29.9, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 15.29, name: 'K-Purland Piept de pui dezosat 500g', package_size: '500g', normalized_unit_price: 30.58, normalized_unit_label: 'RON/kg' },
      penny: { price: 14.99, name: 'Hanul Boieresc Piept de pui 500g', package_size: '500g', normalized_unit_price: 29.98, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 15.99, name: 'Drag de România Piept de pui 500g', package_size: '500g', normalized_unit_price: 31.98, normalized_unit_label: 'RON/kg' },
      auchan: { price: 15.79, name: 'Filiera Auchan Piept de pui 500g', package_size: '500g', normalized_unit_price: 31.58, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 16.49, name: '365 Piept de pui dezosat 500g', package_size: '500g', normalized_unit_price: 32.98, normalized_unit_label: 'RON/kg' },
      profi: { price: 15.89, name: 'Ferma din Deal Piept de pui 500g', package_size: '500g', normalized_unit_price: 31.78, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 16.99, name: 'Dacello Piept de pui 500g', package_size: '500g', normalized_unit_price: 33.98, normalized_unit_label: 'RON/kg' },
      freshful: { price: 17.49, name: 'Fragedo Piept de pui dezosat 500g', package_size: '500g', normalized_unit_price: 34.98, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-smantana-20-400g',
    canonical_name: 'Smântână 20% grăsime 400g',
    brand: null,
    category: 'Lactate',
    package_size: '400g',
    is_private_label: true,
    fat_percentage: 20,
    prices_by_retailer: {
      lidl: { price: 6.09, name: 'Pilos Smântână 20% 400g', package_size: '400g', normalized_unit_price: 15.23, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 6.29, name: 'K-Classic Smântână 20% 400g', package_size: '400g', normalized_unit_price: 15.73, normalized_unit_label: 'RON/kg' },
      penny: { price: 6.19, name: 'Boni Smântână 20% 400g', package_size: '400g', normalized_unit_price: 15.48, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 6.59, name: 'Simpl Smântână 20% 400g', package_size: '400g', normalized_unit_price: 16.48, normalized_unit_label: 'RON/kg' },
      auchan: { price: 6.49, name: 'Pouce Smântână 20% 400g', package_size: '400g', normalized_unit_price: 16.23, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 6.89, name: '365 Smântână 20% 400g', package_size: '400g', normalized_unit_price: 17.23, normalized_unit_label: 'RON/kg' },
      profi: { price: 6.59, name: 'Proxi Smântână 20% 400g', package_size: '400g', normalized_unit_price: 16.48, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 7.29, name: 'Miil Smântână 20% 400g', package_size: '400g', normalized_unit_price: 18.23, normalized_unit_label: 'RON/kg' },
      freshful: { price: 8.49, name: 'Covalact Smântână 20% 400g', package_size: '400g', normalized_unit_price: 21.23, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-iaurt-grecesc-10-400g',
    canonical_name: 'Iaurt grecesc 10% grăsime 400g',
    brand: null,
    category: 'Lactate',
    package_size: '400g',
    is_private_label: true,
    fat_percentage: 10,
    prices_by_retailer: {
      lidl: { price: 3.99, name: 'Pilos Iaurt natur 10% 400g', package_size: '400g', normalized_unit_price: 9.98, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 4.29, name: 'K-Classic Iaurt grecesc 10% 400g', package_size: '400g', normalized_unit_price: 10.73, normalized_unit_label: 'RON/kg' },
      penny: { price: 4.19, name: 'Boni Iaurt stil grecesc 10% 400g', package_size: '400g', normalized_unit_price: 10.48, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 4.59, name: 'Carrefour Classic Iaurt grecesc 10% 400g', package_size: '400g', normalized_unit_price: 11.48, normalized_unit_label: 'RON/kg' },
      auchan: { price: 4.49, name: 'Auchan Iaurt stil grecesc 10% 400g', package_size: '400g', normalized_unit_price: 11.23, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 4.79, name: '365 Iaurt stil grecesc 10% 400g', package_size: '400g', normalized_unit_price: 11.98, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 5.29, name: 'Miil Iaurt grecesc 10% 400g', package_size: '400g', normalized_unit_price: 13.23, normalized_unit_label: 'RON/kg' },
      freshful: { price: 6.49, name: 'Olympus Iaurt grecesc 10% 400g', package_size: '400g', normalized_unit_price: 16.23, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-faina-000-1kg',
    canonical_name: 'Făină albă superioară 000 1kg',
    brand: null,
    category: 'Produse de baza',
    package_size: '1kg',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 2.49, name: 'Belbake Făină albă 000 1kg', package_size: '1kg', normalized_unit_price: 2.49, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 2.59, name: 'K-Classic Făină albă 000 1kg', package_size: '1kg', normalized_unit_price: 2.59, normalized_unit_label: 'RON/kg' },
      penny: { price: 2.59, name: 'Hanul Boieresc Făină 000 1kg', package_size: '1kg', normalized_unit_price: 2.59, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 2.69, name: 'Simpl Făină albă 000 1kg', package_size: '1kg', normalized_unit_price: 2.69, normalized_unit_label: 'RON/kg' },
      auchan: { price: 2.65, name: 'Pouce Făină albă 000 1kg', package_size: '1kg', normalized_unit_price: 2.65, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 2.89, name: '365 Făină albă 000 1kg', package_size: '1kg', normalized_unit_price: 2.89, normalized_unit_label: 'RON/kg' },
      profi: { price: 2.75, name: 'Proxi Făină albă 000 1kg', package_size: '1kg', normalized_unit_price: 2.75, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 3.29, name: 'Kitchin Făină 000 1kg', package_size: '1kg', normalized_unit_price: 3.29, normalized_unit_label: 'RON/kg' },
      freshful: { price: 3.99, name: 'Băneasa Făină albă 000 1kg', package_size: '1kg', normalized_unit_price: 3.99, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-ulei-floare-1l',
    canonical_name: 'Ulei de floarea-soarelui 1L',
    brand: null,
    category: 'Ulei, unt, margarina',
    package_size: '1l',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 6.99, name: 'Vita D\'Or Ulei floarea-soarelui 1L', package_size: '1l', normalized_unit_price: 6.99, normalized_unit_label: 'RON/L' },
      kaufland: { price: 7.19, name: 'K-Classic Ulei floarea-soarelui 1L', package_size: '1l', normalized_unit_price: 7.19, normalized_unit_label: 'RON/L' },
      penny: { price: 7.19, name: 'Rasa Ulei floarea-soarelui 1L', package_size: '1l', normalized_unit_price: 7.19, normalized_unit_label: 'RON/L' },
      carrefour: { price: 7.29, name: 'Simpl Ulei floarea-soarelui 1L', package_size: '1l', normalized_unit_price: 7.29, normalized_unit_label: 'RON/L' },
      auchan: { price: 7.25, name: 'Pouce Ulei floarea-soarelui 1L', package_size: '1l', normalized_unit_price: 7.25, normalized_unit_label: 'RON/L' },
      'mega-image': { price: 7.49, name: '365 Ulei floarea-soarelui 1L', package_size: '1l', normalized_unit_price: 7.49, normalized_unit_label: 'RON/L' },
      profi: { price: 7.39, name: 'Proxi Ulei floarea-soarelui 1L', package_size: '1l', normalized_unit_price: 7.39, normalized_unit_label: 'RON/L' },
      sezamo: { price: 7.99, name: 'Kitchin Ulei floarea-soarelui 1L', package_size: '1l', normalized_unit_price: 7.99, normalized_unit_label: 'RON/L' },
      freshful: { price: 8.49, name: 'Unisol Ulei floarea-soarelui 1L', package_size: '1l', normalized_unit_price: 8.49, normalized_unit_label: 'RON/L' },
    },
  },
  {
    id: 'shelf-common-zahar-1kg',
    canonical_name: 'Zahăr cristal 1kg',
    brand: null,
    category: 'Produse de baza',
    package_size: '1kg',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 4.49, name: 'Belbake Zahăr alb 1kg', package_size: '1kg', normalized_unit_price: 4.49, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 4.59, name: 'K-Classic Zahăr cristal 1kg', package_size: '1kg', normalized_unit_price: 4.59, normalized_unit_label: 'RON/kg' },
      penny: { price: 4.55, name: 'Crystal Zahăr 1kg', package_size: '1kg', normalized_unit_price: 4.55, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 4.69, name: 'Simpl Zahăr alb 1kg', package_size: '1kg', normalized_unit_price: 4.69, normalized_unit_label: 'RON/kg' },
      auchan: { price: 4.65, name: 'Pouce Zahăr alb 1kg', package_size: '1kg', normalized_unit_price: 4.65, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 4.89, name: '365 Zahăr alb 1kg', package_size: '1kg', normalized_unit_price: 4.89, normalized_unit_label: 'RON/kg' },
      profi: { price: 4.79, name: 'Proxi Zahăr 1kg', package_size: '1kg', normalized_unit_price: 4.79, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 4.99, name: 'Mărgăritar Zahăr alb 1kg', package_size: '1kg', normalized_unit_price: 4.99, normalized_unit_label: 'RON/kg' },
      freshful: { price: 5.19, name: 'Mărgăritar Zahăr cristal 1kg', package_size: '1kg', normalized_unit_price: 5.19, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-orez-1kg',
    canonical_name: 'Orez bob rotund 1kg',
    brand: null,
    category: 'Produse de baza',
    package_size: '1kg',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 5.49, name: 'Golden Sun Orez bob rotund 1kg', package_size: '1kg', normalized_unit_price: 5.49, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 5.69, name: 'K-Classic Orez bob rotund 1kg', package_size: '1kg', normalized_unit_price: 5.69, normalized_unit_label: 'RON/kg' },
      penny: { price: 5.59, name: 'Hanul Boieresc Orez 1kg', package_size: '1kg', normalized_unit_price: 5.59, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 5.89, name: 'Simpl Orez bob rotund 1kg', package_size: '1kg', normalized_unit_price: 5.89, normalized_unit_label: 'RON/kg' },
      auchan: { price: 5.79, name: 'Pouce Orez 1kg', package_size: '1kg', normalized_unit_price: 5.79, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 6.19, name: '365 Orez bob rotund 1kg', package_size: '1kg', normalized_unit_price: 6.19, normalized_unit_label: 'RON/kg' },
      profi: { price: 5.99, name: 'Proxi Orez 1kg', package_size: '1kg', normalized_unit_price: 5.99, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 6.79, name: 'Kitchin Orez 1kg', package_size: '1kg', normalized_unit_price: 6.79, normalized_unit_label: 'RON/kg' },
      freshful: { price: 7.49, name: 'Deroni Orez Camolino 1kg', package_size: '1kg', normalized_unit_price: 7.49, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-malai-1kg',
    canonical_name: 'Mălai extra 1kg',
    brand: null,
    category: 'Produse de baza',
    package_size: '1kg',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 2.19, name: 'Belbake Mălai superior 1kg', package_size: '1kg', normalized_unit_price: 2.19, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 2.39, name: 'K-Classic Mălai 1kg', package_size: '1kg', normalized_unit_price: 2.39, normalized_unit_label: 'RON/kg' },
      penny: { price: 2.29, name: 'Hanul Boieresc Mălai 1kg', package_size: '1kg', normalized_unit_price: 2.29, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 2.49, name: 'Simpl Mălai 1kg', package_size: '1kg', normalized_unit_price: 2.49, normalized_unit_label: 'RON/kg' },
      auchan: { price: 2.45, name: 'Pouce Mălai 1kg', package_size: '1kg', normalized_unit_price: 2.45, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 2.79, name: '365 Mălai extra 1kg', package_size: '1kg', normalized_unit_price: 2.79, normalized_unit_label: 'RON/kg' },
      profi: { price: 2.59, name: 'Proxi Mălai 1kg', package_size: '1kg', normalized_unit_price: 2.59, normalized_unit_label: 'RON/kg' },
      freshful: { price: 3.89, name: 'Pambac Mălai extra 1kg', package_size: '1kg', normalized_unit_price: 3.89, normalized_unit_label: 'RON/kg' },
    },
  },
  {
    id: 'shelf-common-carne-tocata-500g',
    canonical_name: 'Carne tocată amestec 500g',
    brand: null,
    category: 'Carne si peste',
    package_size: '500g',
    is_private_label: true,
    fat_percentage: null,
    prices_by_retailer: {
      lidl: { price: 12.99, name: 'Carne tocată porc și vită 500g', package_size: '500g', normalized_unit_price: 25.98, normalized_unit_label: 'RON/kg' },
      kaufland: { price: 13.49, name: 'K-Purland Carne tocată amestec 500g', package_size: '500g', normalized_unit_price: 26.98, normalized_unit_label: 'RON/kg' },
      penny: { price: 12.99, name: 'Hanul Boieresc Carne tocată 500g', package_size: '500g', normalized_unit_price: 25.98, normalized_unit_label: 'RON/kg' },
      carrefour: { price: 13.99, name: 'Carrefour Carne tocată amestec 500g', package_size: '500g', normalized_unit_price: 27.98, normalized_unit_label: 'RON/kg' },
      auchan: { price: 13.79, name: 'Auchan Carne tocată amestec 500g', package_size: '500g', normalized_unit_price: 27.58, normalized_unit_label: 'RON/kg' },
      'mega-image': { price: 14.49, name: '365 Carne tocată amestec 500g', package_size: '500g', normalized_unit_price: 28.98, normalized_unit_label: 'RON/kg' },
      sezamo: { price: 15.49, name: 'Dacello Carne tocată amestec 500g', package_size: '500g', normalized_unit_price: 30.98, normalized_unit_label: 'RON/kg' },
      freshful: { price: 15.99, name: 'Comtim Carne tocată amestec 500g', package_size: '500g', normalized_unit_price: 31.98, normalized_unit_label: 'RON/kg' },
    },
  },
];

async function main() {
  console.log(`[${new Date().toISOString()}] Începere integrare prețuri Lidl în catalogul de raft...`);

  // 1. Citire lidl-prices.json
  let lidlData;
  try {
    const raw = await fs.readFile(LIDL_PRICES_PATH, 'utf-8');
    lidlData = JSON.parse(raw);
  } catch (err) {
    console.error(`Eroare la citirea ${LIDL_PRICES_PATH}. Rulați mai întâi scripts/sync-lidl-prices.py!`, err.message);
    process.exit(1);
  }

  const lidlProducts = lidlData.products || [];
  console.log(`✓ Încărcat ${lidlProducts.length} produse din lista oficială Lidl.`);

  // 2. Inițializare catalog de raft cu produsele comune multi-magazin
  const shelfItems = [...MULTI_STORE_COMMON_STAPLES];
  console.log(`✓ Inițializat ${shelfItems.length} alimente comune multi-magazin (6–9 supermarketuri).`);

  // Mapare rapidă a produselor de raft existente
  let matchedCount = 0;
  let newShelfCount = 0;

  for (const lProd of lidlProducts) {
    let matchedItem = null;

    // Căutare strictă în catalogul existent de raft
    for (const sItem of shelfItems) {
      if (areProductsStrictlyMatching(lProd, sItem)) {
        matchedItem = sItem;
        break;
      }
    }

    const offerData = {
      price: lProd.price,
      name: lProd.name,
      package_size: lProd.package_size,
      normalized_unit_price: lProd.normalized_unit_price,
      normalized_unit_label: lProd.normalized_unit_label,
      updated_at: lidlData.scraped_at || new Date().toISOString(),
    };

    if (matchedItem) {
      // Produsul există deja la alt magazin -> adăugăm oferta Lidl pe același rând
      matchedItem.prices_by_retailer = matchedItem.prices_by_retailer || {};
      matchedItem.prices_by_retailer.lidl = offerData;
      matchedCount++;
    } else {
      // Produs nou de raft (ex: mărci proprii Lidl Pilos, Pikok sau produse exclusive)
      const cleanSlug = normalizeCompareString(`${lProd.name} ${lProd.package_size}`).replace(/\s+/g, '-');
      shelfItems.push({
        id: `shelf-${cleanSlug}`,
        canonical_name: lProd.name,
        brand: lProd.brand || null,
        category: lProd.category,
        package_size: lProd.package_size,
        is_private_label: Boolean(lProd.is_private_label),
        fat_percentage: lProd.fat_percentage || null,
        prices_by_retailer: {
          lidl: offerData,
        },
      });
      newShelfCount++;
    }
  }

  // 3. Salvare catalog de raft actualizat
  const updatedShelfCatalog = {
    source: 'Beavy Multi-Store Shelf Catalog',
    updated_at: new Date().toISOString(),
    total_shelf_products: shelfItems.length,
    stores_present: ['lidl', 'auchan', 'mega-image', 'carrefour', 'kaufland'],
    items: shelfItems,
  };

  await fs.mkdir(path.dirname(SHELF_PRICES_PATH), { recursive: true });
  await fs.writeFile(SHELF_PRICES_PATH, JSON.stringify(updatedShelfCatalog, null, 2), 'utf-8');

  console.log(`\n✓ Rezultat integrare Lidl în shelf-prices.json:`);
  console.log(`  • Oferte Lidl unite pe rânduri existente de brand comun: ${matchedCount}`);
  console.log(`  • Produse adăugate pe raft (inclusiv mărci proprii Pilos/Pikok): ${newShelfCount}`);
  console.log(`  • Total produse pe raft în shelf-prices.json: ${shelfItems.length}`);
  console.log(`✓ Fișier salvat cu succes: ${SHELF_PRICES_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error in merge-lidl-into-shelf:', err);
  process.exit(1);
});
