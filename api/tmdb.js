// api/tmdb.js - Fixed version with Caching Headers

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const TMDB_API_KEY = process.env.TMDB_API_KEY;

  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY environment variable not set');
    return res.status(500).json({ error: 'Server configuration error: TMDB_API_KEY not set.' });
  }

  try {
    // Extract the path after /api/tmdb
    const fullUrl = req.url;
    console.log('Full request URL:', fullUrl);
    
    // Remove /api/tmdb from the beginning to get the TMDb endpoint
    const tmdbPath = fullUrl.replace('/api/tmdb', '');
    console.log('Extracted TMDb path:', tmdbPath);
    
    // Build the full TMDb URL
    const tmdbBaseUrl = 'https://api.themoviedb.org/3';
    let targetUrl;
    
    if (tmdbPath.includes('?')) {
      // URL already has query parameters, append api_key
      targetUrl = `${tmdbBaseUrl}${tmdbPath}&api_key=${TMDB_API_KEY}`;
    } else {
      // URL has no query parameters, add api_key as first parameter
      targetUrl = `${tmdbBaseUrl}${tmdbPath}?api_key=${TMDB_API_KEY}`;
    }
    
    console.log('Proxying to TMDb URL:', targetUrl);

    const tmdbResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TinyLizard-MovieApp/1.0'
      }
    });

    if (!tmdbResponse.ok) {
      const errorText = await tmdbResponse.text();
      console.error(`TMDb API returned error: ${tmdbResponse.status} ${tmdbResponse.statusText}`);
      console.error('Error response:', errorText);
      return res.status(tmdbResponse.status).json({
        error: `TMDb API error: ${tmdbResponse.status} ${tmdbResponse.statusText}`,
        details: errorText
      });
    }

    const data = await tmdbResponse.json();
    console.log('TMDb API success, returning data');

    // --- CACHING IMPLEMENTATION ---
    // Set cache headers for successful responses.
    // s-maxage=86400: Cache on CDN for 24 hours.
    // stale-while-revalidate=43200: Serve stale content for 12 hours while revalidating.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200');
    
    res.status(200).json(data);

  } catch (error) {
    console.error('Proxy request failed:', error);
    res.status(500).json({ 
      error: 'Failed to proxy request to TMDb', 
      details: error.message 
    });
  }
};
