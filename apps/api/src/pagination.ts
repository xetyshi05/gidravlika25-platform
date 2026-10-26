/**
 * Upper bound for `page` in the CRM and Back Office lists (PERF-01): with at
 * most 100 rows per page it covers a million rows, while an arbitrary number
 * cannot turn into a huge OFFSET.
 */
export const MAX_PAGE = 10_000;
