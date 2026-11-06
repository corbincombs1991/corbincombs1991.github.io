import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCatalogItems } from '../src/lib/catalog.ts';

const items = [
  { name: '1993 Endless Designs bouquet tee', category: 'Floral', size: 'L', price: '$30' },
  { name: '90s Viking Harley-Davidson tee', category: 'Graphic', size: 'L', price: '$40' },
  { name: '1994 Nevada Silver State tee', category: 'Travel', size: 'L', price: '$25' },
  { name: '90s Roy Rogers festival tee', category: 'Graphic', size: 'M', price: '$30' },
];
const defaults = { query: '', category: 'All', size: 'All', sort: 'featured' };
const search = filters => selectCatalogItems(items, { ...defaults, ...filters });

test('search ignores case and punctuation, supports word prefixes, and requires every term', () => {
  assert.deepEqual(search({ query: ' HARLEY—dav ' }), [items[1]]);
  assert.deepEqual(search({ query: 'graphic medium' }), [items[3]]);
  assert.deepEqual(search({ query: 'floral harley' }), []);
  assert.deepEqual(search({ query: 'L' }), items.slice(0, 3));
});

test('text, category, and size filters intersect; reset restores the original selection', () => {
  assert.deepEqual(search({ query: 'tee', category: 'Graphic', size: 'M' }), [items[3]]);
  assert.deepEqual(search({ category: 'Travel', size: 'M' }), []);
  assert.deepEqual(search({}), items);
});

test('price sort is numeric and stable, leaves the source untouched, and puts unknown prices last', () => {
  assert.deepEqual(search({ sort: 'price-asc' }), [items[2], items[0], items[3], items[1]]);
  assert.deepEqual(search({ sort: 'price-desc' }), [items[1], items[0], items[3], items[2]]);
  const unpriced = { name: 'Unpriced test item', category: 'Graphic', size: 'M', price: 'Ask seller' };
  assert.equal(selectCatalogItems([unpriced, ...items], { ...defaults, sort: 'price-desc' }).at(-1), unpriced);
  assert.deepEqual(search({}), items);
});
