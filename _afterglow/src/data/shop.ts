import catalog from './products.json';

// Connect only the verified Afterglow Vintage seller profile and real listings.
export const shop = {
  depopUrl: 'https://www.depop.com/afterglowvintageindy/',
  handle: '@afterglowvintageindy',
};

export type Product = {
  name: string;
  category: string;
  size: string;
  price: string;
  image: string;
  url: string;
};

export const products: Product[] = catalog;
export const checkedDate = 'November 6, 2026';
