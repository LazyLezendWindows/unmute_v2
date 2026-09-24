/** Consistent icons for API-provided interests, with a safe fallback for new categories. */
export function interestIcon(name: string): string {
  const value = name.toLowerCase();
  const icons: [RegExp, string][] = [
    [/travel|adventure/, 'flight-takeoff'], [/food|cook/, 'restaurant'],
    [/music|sing/, 'music-2'], [/fitness|gym|workout/, 'run'],
    [/photo/, 'camera'], [/coffee/, 'cup'], [/pet|animal|dog|cat\b/, 'footprint'],
    [/read|book/, 'book-open'], [/movie|cinema|film/, 'film'],
    [/tech|cod/, 'macbook'], [/gam/, 'gamepad'], [/art|paint/, 'palette'],
    [/nature|garden/, 'leaf'], [/sport/, 'basketball'], [/danc/, 'user-heart'],
    [/spirit|meditat/, 'sun'], [/fashion|shop/, 'shopping-bag'],
    [/podcast|radio/, 'mic'], [/writ|poet/, 'quill-pen'], [/design|ui\/ux/, 'pencil-ruler-2'],
    [/hik|trail/, 'walk'], [/bik|cycl/, 'riding'], [/astro|space|star/, 'star'],
    [/jazz|lo-fi/, 'music-2'], [/philosoph/, 'lightbulb-flash'], [/language/, 'global'],
  ];
  return `ri-${icons.find(([pattern]) => pattern.test(value))?.[1] || 'sparkling-2'}-line`;
}
