// Reads one query parameter from req.url with the WHATWG URL parser.
// Vercel's req.query getter calls the legacy url.parse(), which logs a
// DeprecationWarning on every request. req.query is built from req.url, so
// this returns the same value without the warning. A missing or empty key
// gives ''. A repeated key gives null, never '': req.query turned it into
// "a,b", which no page matched, and Vercel adds a visitor's own ?slug= to a
// rewrite's. So /coins/a?slug=b must 404, not serve coin b or fall through to
// a page meant for a request with no slug at all.
export function queryParam(req, name) {
  let values;
  try {
    values = new URL(req.url || '/', 'http://localhost').searchParams.getAll(name);
  } catch {
    return '';
  }
  if (values.length > 1) return null;
  return values[0] || '';
}
