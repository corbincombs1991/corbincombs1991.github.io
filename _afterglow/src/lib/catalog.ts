export interface CatalogItem {
  name: string;
  category: string;
  size: string;
  price: string;
}

export interface CatalogFilters {
  query: string;
  category: string;
  size: string;
  sort: string;
}

const sizeWords: Record<string, string> = {
  XS: 'extra small', S: 'small', M: 'medium', L: 'large',
  XL: 'extra large', XXL: 'extra extra large',
};

function words(value: string): string[] {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().match(/[a-z0-9]+/g) || [];
}

function priceValue(price: string): number {
  const amount = price.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return amount ? Number(amount[0]) : Number.NaN;
}

/** Search this saved selection only. This function never fetches Depop stock. */
export function selectCatalogItems<T extends CatalogItem>(items: T[], filters: CatalogFilters): T[] {
  const terms = words(filters.query);
  const result = items.filter(item => {
    if (filters.category !== 'All' && item.category !== filters.category) return false;
    if (filters.size !== 'All' && item.size !== filters.size) return false;
    const searchable = words(`${item.name} ${item.category} ${item.size} ${sizeWords[item.size] || ''}`);
    return terms.every(term => searchable.some(word => word.startsWith(term)));
  });
  if (filters.sort === 'price-asc' || filters.sort === 'price-desc') {
    const direction = filters.sort === 'price-asc' ? 1 : -1;
    result.sort((a, b) => {
      const aPrice = priceValue(a.price);
      const bPrice = priceValue(b.price);
      if (Number.isNaN(aPrice)) return Number.isNaN(bPrice) ? 0 : 1;
      if (Number.isNaN(bPrice)) return -1;
      return (aPrice - bPrice) * direction;
    });
  }
  return result;
}
