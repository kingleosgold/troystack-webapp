// Reads one query parameter from req.url with the WHATWG URL parser.
// Vercel's req.query getter calls the legacy url.parse(), which logs a
// DeprecationWarning on every request. req.query is built from req.url, so
// this returns the same value without the warning. A missing or empty key
// gives ''. So does a repeated one, which req.query turned into "a,b" and no
// page matched. Vercel adds a visitor's own ?slug= to a rewrite's, so taking
// the first value would let /coins/a?slug=b serve coin b at a's address.
export function queryParam(req, name) {
  try {
    const values = new URL(req.url || '/', 'http://localhost').searchParams.getAll(name);
    return values.length === 1 ? values[0] : '';
  } catch {
    return '';
  }
}
