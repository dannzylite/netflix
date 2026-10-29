// TMDB proxy (Vercel function at /api/tmdb): the page calls /api/tmdb?path=/discover/movie&...
// and this adds the key on the server, so TMDB_API_KEY never reaches the browser.
// Only the endpoints the site actually uses are allowed through.

const ALLOWED_PATHS = [
  /^\/watch\/providers\/(movie|tv)$/,
  /^\/genre\/(movie|tv)\/list$/,
  /^\/discover\/(movie|tv)$/,
  /^\/search\/multi$/,
];

export async function GET(request) {
  const key = String(process.env.TMDB_API_KEY || '').trim();
  if (!key) return json(500, { code: 'config', error: 'TMDB_API_KEY is not set' });

  const params = new URL(request.url).searchParams;
  const path = params.get('path') || '';
  if (!ALLOWED_PATHS.some((re) => re.test(path))) return json(400, { error: 'Unsupported path' });

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  params.forEach((value, name) => {
    if (name === 'path' || name === 'api_key') return;
    url.searchParams.set(name, value.slice(0, 200));
  });
  const bearer = key.startsWith('eyJ'); // v4 "API Read Access Token"
  if (!bearer) url.searchParams.set('api_key', key);

  try {
    const res = await fetch(url, {
      headers: bearer ? { Authorization: `Bearer ${key}`, accept: 'application/json' } : { accept: 'application/json' },
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': res.ok ? 'public, max-age=600, s-maxage=3600' : 'no-store',
      },
    });
  } catch (err) {
    return json(502, { error: 'Could not reach TMDB' });
  }
}

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
