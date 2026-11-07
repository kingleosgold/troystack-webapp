// Reads one query parameter from req.url with the WHATWG URL parser.
// Vercel's req.query getter calls the legacy url.parse(), which logs a
// DeprecationWarning on every request. req.query is built from req.url, so
// this returns the same value without the warning. A repeated key gives its
// first value, and a missing or empty one gives ''.
export function queryParam(req, name) {
  try {
    return new URL(req.url || '/', 'http://localhost').searchParams.get(name) || '';
  } catch {
    return '';
  }
}
