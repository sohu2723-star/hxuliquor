export type CategoryLocale = 'my' | 'en'

const collators: Record<CategoryLocale, Intl.Collator> = {
  my: new Intl.Collator('my', { numeric: true, sensitivity: 'base', ignorePunctuation: true }),
  en: new Intl.Collator('en', { numeric: true, sensitivity: 'base', ignorePunctuation: true }),
}

/**
 * Return unique, trimmed categories in the active UI language's natural order.
 * Intl.Collator handles Myanmar script ordering and English alphabet ordering
 * consistently in modern Android Chrome and desktop Chrome.
 */
export function sortCategories(values: Iterable<string | null | undefined>, locale: CategoryLocale = 'my'): string[] {
  const unique = new Set<string>()
  for (const value of values) {
    const category = String(value ?? '').trim()
    if (category) unique.add(category)
  }

  const collator = collators[locale]
  return [...unique].sort((left, right) => {
    const result = collator.compare(left, right)
    return result || left.localeCompare(right, locale, { numeric: true, sensitivity: 'base' })
  })
}
