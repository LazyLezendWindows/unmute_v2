// Pictures for the Interests screen's tiles, keyed by interest name (lowercase, as the file names).
const files = import.meta.glob('../assets/interests/*.webp', { eager: true, import: 'default' }) as Record<string, string>;

const byName = new Map(
  Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace('.webp', ''), url])
);

/** The tile picture for an interest, or undefined when it has none. */
export function interestPhoto(name: string): string | undefined {
  return byName.get(name.toLowerCase());
}

/** The order of the picture tiles, as in the brand screen. */
export const PHOTO_INTEREST_ORDER = [
  'travel', 'food', 'movies', 'music', 'fitness', 'reading', 'photography', 'pets', 'nature', 'tech', 'art',
  'gaming', 'cooking', 'adventures', 'coffee', 'shopping', 'sports', 'spirituality', 'fashion', 'dance',
  'anime', 'cars', 'diy',
];
