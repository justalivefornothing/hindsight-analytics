/** Product data for the bundled "Northlight Supply" storefront. Pure data. */

export interface Product {
  id: string
  name: string
  tagline: string
  price: number
  category: 'desk' | 'light' | 'audio' | 'bag'
  /** two-stop gradient used for the generated product art */
  art: [string, string]
  /** simple glyph rendered on the art tile */
  glyph: 'lamp' | 'notebook' | 'headphones' | 'bag' | 'pen' | 'speaker' | 'mug' | 'clock'
  rating: number
  reviews: number
}

export const PRODUCTS: Product[] = [
  {
    id: 'aurora-lamp',
    name: 'Aurora Desk Lamp',
    tagline: 'Warm-to-cool dimmable light with a felt base.',
    price: 89,
    category: 'light',
    art: ['#f7b267', '#f4845f'],
    glyph: 'lamp',
    rating: 4.8,
    reviews: 212,
  },
  {
    id: 'field-notebook',
    name: 'Field Notebook, 3-pack',
    tagline: 'Dot grid, lay-flat binding, recycled paper.',
    price: 24,
    category: 'desk',
    art: ['#9bb1ff', '#4a63d3'],
    glyph: 'notebook',
    rating: 4.6,
    reviews: 1034,
  },
  {
    id: 'quiet-headphones',
    name: 'Quiet Headphones',
    tagline: 'Closed-back, 40-hour battery, folds flat.',
    price: 179,
    category: 'audio',
    art: ['#cdb4f6', '#7c4dcc'],
    glyph: 'headphones',
    rating: 4.7,
    reviews: 588,
  },
  {
    id: 'commuter-bag',
    name: 'Commuter Bag',
    tagline: 'Waxed canvas, 16" laptop sleeve, weather-sealed.',
    price: 139,
    category: 'bag',
    art: ['#a7d7c5', '#2f8f6b'],
    glyph: 'bag',
    rating: 4.5,
    reviews: 341,
  },
  {
    id: 'brass-pen',
    name: 'Brass Rollerball',
    tagline: 'Machined brass body that patinas with use.',
    price: 42,
    category: 'desk',
    art: ['#f6d365', '#c98a1a'],
    glyph: 'pen',
    rating: 4.9,
    reviews: 97,
  },
  {
    id: 'pocket-speaker',
    name: 'Pocket Speaker',
    tagline: 'Palm-sized, surprisingly loud, IPX6.',
    price: 69,
    category: 'audio',
    art: ['#ffb3c1', '#d63a5a'],
    glyph: 'speaker',
    rating: 4.3,
    reviews: 456,
  },
  {
    id: 'stoneware-mug',
    name: 'Stoneware Mug',
    tagline: 'Hand-glazed, 350ml, dishwasher safe.',
    price: 28,
    category: 'desk',
    art: ['#e0c3a0', '#8d6748'],
    glyph: 'mug',
    rating: 4.7,
    reviews: 723,
  },
  {
    id: 'minute-clock',
    name: 'Minute Clock',
    tagline: 'Silent sweep movement in a walnut frame.',
    price: 74,
    category: 'desk',
    art: ['#b8e0f6', '#2b7ab8'],
    glyph: 'clock',
    rating: 4.4,
    reviews: 158,
  },
]

export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id)
}

export function formatPrice(value: number): string {
  return `$${value.toFixed(value % 1 === 0 ? 0 : 2)}`
}
