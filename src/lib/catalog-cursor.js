// Postgres timestamps can contain microseconds. Keep that exact boundary so a
// page of tied timestamps can continue by slug without dropping the next row.
export function discoveryBoundary(cursor, order = 'popular') {
  const date = cursor.created_at;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(date)
    || !Number.isFinite(Date.parse(date))
    || typeof cursor.slug !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(cursor.slug)
    || !Number.isSafeInteger(cursor.plays) || cursor.plays < 0) {
    throw new Error('This page has expired. Refresh the feed.');
  }
  const slug = cursor.slug, p = cursor.plays;
  return order === 'popular'
    ? `qualified_play_count.lt.${p},and(qualified_play_count.eq.${p},created_at.lt.${date}),and(qualified_play_count.eq.${p},created_at.eq.${date},slug.lt.${slug})`
    : `created_at.lt.${date},and(created_at.eq.${date},slug.lt.${slug})`;
}
