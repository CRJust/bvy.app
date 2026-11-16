import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOG } from '../data/catalog.ts';
import {
  computeGs1CheckDigit,
  findCatalogProductByEan,
  normalizeEanInput,
  validateEanCode,
} from './ean.ts';

test('normalizeEanInput strips spaces, hyphens, and non-digits', () => {
  assert.equal(normalizeEanInput(' 5941-2010 01012 '), '5941201001012');
});

test('validateEanCode accepts all catalog EAN-13 codes and rejects wrong check digits', () => {
  for (const product of CATALOG) {
    const res = validateEanCode(product.ean);
    assert.equal(res.valid, true, `Expected valid EAN-13 for ${product.id}: ${product.ean}`);
    assert.equal(res.format, 'EAN-13');
  }

  const sample = CATALOG[0].ean;
  const wrongLastDigit = String((Number(sample[12]) + 1) % 10);
  const tampered = `${sample.slice(0, 12)}${wrongLastDigit}`;
  const invalidRes = validateEanCode(tampered);
  assert.equal(invalidRes.valid, false);
  assert.equal(invalidRes.format, 'EAN-13');
});

test('validateEanCode supports valid EAN-8 and UPC-A codes', () => {
  const ean8Payload = '9638507';
  const ean8 = `${ean8Payload}${computeGs1CheckDigit(ean8Payload)}`;
  const res8 = validateEanCode(ean8);
  assert.equal(res8.valid, true);
  assert.equal(res8.format, 'EAN-8');

  const upcPayload = '03600029145';
  const upc = `${upcPayload}${computeGs1CheckDigit(upcPayload)}`;
  const resUpc = validateEanCode(upc);
  assert.equal(resUpc.valid, true);
  assert.equal(resUpc.format, 'UPC-A');
});

test('findCatalogProductByEan locates exact catalog items including with formatting', () => {
  const zuzu = CATALOG.find((p) => p.id === 'zuzu_lapte_1l')!;
  const found = findCatalogProductByEan(` ${zuzu.ean.slice(0, 4)}-${zuzu.ean.slice(4)} `, CATALOG);
  assert.equal(found?.id, 'zuzu_lapte_1l');

  const missing = findCatalogProductByEan('5949999999992', CATALOG);
  assert.equal(missing, null);
});
