import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env
const env = {};
fs.readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

function validateBarcodeChecksum(raw) {
  const digits = raw.trim().replace(/\D/g, '');
  if (digits.length === 13) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const d = parseInt(digits[i], 10);
      sum += i % 2 === 0 ? d * 1 : d * 3;
    }
    const expected = (10 - (sum % 10)) % 10;
    const actual = parseInt(digits[12], 10);
    return { isValid: expected === actual, normalized: digits, format: 'EAN-13', checksumDigit: actual, expectedDigit: expected };
  }
  if (digits.length === 12) {
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      const d = parseInt(digits[i], 10);
      sum += i % 2 === 0 ? d * 3 : d * 1;
    }
    const expected = (10 - (sum % 10)) % 10;
    const actual = parseInt(digits[11], 10);
    return { isValid: expected === actual, normalized: `0${digits}`, format: 'UPC-A', checksumDigit: actual, expectedDigit: expected };
  }
  if (digits.length === 8) {
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      const d = parseInt(digits[i], 10);
      sum += i % 2 === 0 ? d * 3 : d * 1;
    }
    const expected = (10 - (sum % 10)) % 10;
    const actual = parseInt(digits[7], 10);
    return { isValid: expected === actual, normalized: digits, format: 'EAN-8', checksumDigit: actual, expectedDigit: expected };
  }
  return { isValid: false, normalized: digits, format: 'UNKNOWN' };
}

function buildStorePodium(offers) {
  if (offers.length === 0) return { podium: [], cheapestStore: null, mostExpensiveStore: null, maxSavingsRon: 0, maxSavingsPercent: 0 };
  const bestOfferByStore = new Map();
  for (const offer of offers) {
    const storeKey = (offer.retailer_name || '').toLowerCase().trim();
    if (!storeKey) continue;
    const existing = bestOfferByStore.get(storeKey);
    if (!existing || offer.price < existing.price) {
      bestOfferByStore.set(storeKey, offer);
    }
  }
  const sorted = Array.from(bestOfferByStore.values()).sort((a, b) => a.price - b.price);
  const cheapest = sorted[0];
  const mostExpensive = sorted[sorted.length - 1];
  const maxSavingsRon = Number((mostExpensive.price - cheapest.price).toFixed(2));
  const maxSavingsPercent = mostExpensive.price > 0 ? Math.round((maxSavingsRon / mostExpensive.price) * 100) : 0;
  const podium = sorted.map((off, idx) => ({
    retailerName: off.retailer_name,
    price: off.price,
    isCheapest: idx === 0,
    priceDiffFromCheapest: Number((off.price - cheapest.price).toFixed(2)),
  }));
  return { podium, cheapestStore: podium[0], mostExpensiveStore: podium[podium.length - 1], maxSavingsRon, maxSavingsPercent };
}

function calculateAisleBasketSummary(items) {
  let totalUnits = 0;
  const storeTotals = {};
  for (const item of items) {
    totalUnits += item.quantity;
    for (const off of item.offers) {
      const slug = off.retailerName.toLowerCase().trim();
      if (!storeTotals[slug]) storeTotals[slug] = { name: off.retailerName, total: 0, count: 0 };
      storeTotals[slug].total += off.price * item.quantity;
      storeTotals[slug].count += 1;
    }
  }
  const breakdowns = Object.values(storeTotals).map(st => ({
    name: st.name,
    total: Number(st.total.toFixed(2)),
    count: st.count,
  })).sort((a, b) => a.total - b.total);
  const cheapest = breakdowns[0];
  const mostExpensive = breakdowns[breakdowns.length - 1];
  const totalSavingsRon = Number(Math.max(0, mostExpensive.total - cheapest.total).toFixed(2));
  const totalSavingsPercent = mostExpensive.total > 0 ? Math.round((totalSavingsRon / mostExpensive.total) * 100) : 0;
  return { totalUnits, distinctProducts: items.length, cheapestStoreName: cheapest.name, cheapestTotal: cheapest.total, mostExpensiveStoreName: mostExpensive.name, mostExpensiveTotal: mostExpensive.total, totalSavingsRon, totalSavingsPercent };
}

async function runTests() {
  console.log('--- 1. Testing Checksum Validation ---');
  // Barilla Penne EAN-13
  const t1 = validateBarcodeChecksum('8076809513753');
  console.log('Barilla EAN-13:', t1.isValid, t1.format);
  if (!t1.isValid) throw new Error('Failed t1');

  // Coca-Cola EAN-13
  const t2 = validateBarcodeChecksum('5449000000996');
  console.log('Coca-Cola EAN-13:', t2.isValid, t2.format);
  if (!t2.isValid) throw new Error('Failed t2');

  // EAN-8
  const t3 = validateBarcodeChecksum('96385074');
  console.log('EAN-8:', t3.isValid, t3.format);
  if (!t3.isValid) throw new Error('Failed t3');

  // UPC-A (12 digits, Heinz Ketchup 013000006408)
  const t4 = validateBarcodeChecksum('013000006408');
  console.log('UPC-A:', t4.isValid, t4.format, t4.normalized);
  if (!t4.isValid) throw new Error('Failed t4');

  // Invalid check digit
  const t5 = validateBarcodeChecksum('1234567890129');
  console.log('Invalid EAN:', t5.isValid);
  if (t5.isValid) throw new Error('Failed t5: should be invalid');

  console.log('--- 2. Testing Live DB Barcode Lookup & Store Podium ---');
  const barcode = '2000000183411'; // Chio covrigei
  const { data: prods } = await supabase
    .from('beavy_products')
    .select('id, canonical_name, brand, package_size')
    .eq('barcode', barcode);
  console.log('Found product:', prods?.[0]?.canonical_name);
  if (!prods || prods.length === 0) throw new Error('Barcode not found in DB');

  const { data: offers } = await supabase
    .from('beavy_product_offers')
    .select('retailer_name, price, regular_price, promo_price')
    .eq('product_id', prods[0].id);
  console.log(`Found ${offers.length} offers across stores.`);

  const podium = buildStorePodium(offers);
  console.log('Store Podium:', podium.podium);
  console.log(`Cheapest: ${podium.cheapestStore.retailerName} at ${podium.cheapestStore.price} lei`);
  console.log(`Savings vs ${podium.mostExpensiveStore.retailerName}: ${podium.maxSavingsRon} lei (-${podium.maxSavingsPercent}%)`);
  if (!podium.cheapestStore || podium.maxSavingsRon <= 0) throw new Error('Failed podium savings calculation');

  console.log('--- 3. Testing Continuous "Cărucior Live la Raft" Basket Aggregation ---');
  const sessionBasket = [
    {
      id: 'item-1',
      productName: 'Chio Covrigei cu sare 80g',
      quantity: 2,
      offers: podium.podium,
    },
    {
      id: 'item-2',
      productName: 'Lapte Zuzu 3.5% 1L',
      quantity: 1,
      offers: [
        { retailerName: 'Freshful', price: 8.49 },
        { retailerName: 'Carrefour', price: 9.99 },
        { retailerName: 'Auchan', price: 9.29 },
      ],
    },
  ];

  const basketRes = calculateAisleBasketSummary(sessionBasket);
  console.log('Basket Summary:', basketRes);
  console.log(`Total units: ${basketRes.totalUnits}`);
  console.log(`Cheapest store for whole basket: ${basketRes.cheapestStoreName} at ${basketRes.cheapestTotal} lei`);
  console.log(`Total savings on aisle walk: ${basketRes.totalSavingsRon} lei (-${basketRes.totalSavingsPercent}%) vs ${basketRes.mostExpensiveStoreName}`);

  if (basketRes.totalUnits !== 3) throw new Error('Failed basket total units');
  if (basketRes.totalSavingsRon <= 0) throw new Error('Failed basket total savings calculation');

  console.log('🎉 ALL TESTS PASSED! Local-first EAN Scanner is STAS and ready for production!');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
