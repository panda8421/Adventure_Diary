addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  var GITHUB_TOKEN = typeof GITHUB_TOKEN !== 'undefined' ? GITHUB_TOKEN : '';
  var GITHUB_OWNER = typeof GITHUB_OWNER !== 'undefined' ? GITHUB_OWNER : 'panda8421';
  var GITHUB_REPO = typeof GITHUB_REPO !== 'undefined' ? GITHUB_REPO : 'Adventure_Diary';
  var DATA_PATH = typeof DATA_PATH !== 'undefined' ? DATA_PATH : 'data/user-data.json';
  var SYNC_KEY = typeof SYNC_KEY !== 'undefined' ? SYNC_KEY : '';
  var ALLOWED_ORIGINS = (typeof ALLOWED_ORIGINS !== 'undefined' ? ALLOWED_ORIGINS : 'http://localhost:8080,https://panda8421.github.io').split(',');

  var origin = request.headers.get('Origin') || '';
  var allowOrigin = ALLOWED_ORIGINS.indexOf(origin) >= 0 ? origin : ALLOWED_ORIGINS[0];

  var corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Key',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  var url = new URL(request.url);

  if (url.pathname === '/api/sync' && request.method === 'GET') {
    return handleGet(GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, DATA_PATH, corsHeaders);
  }

  if (url.pathname === '/api/sync' && request.method === 'POST') {
    return handlePost(request, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, DATA_PATH, SYNC_KEY, corsHeaders);
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: Object.assign({}, corsHeaders, { 'Content-Type': 'application/json' })
  });
}

async function handleGet(token, owner, repo, path, corsHeaders) {
  try {
    var apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path;

    var headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cloudflare-Worker'
    };
    if (token) {
      headers['Authorization'] = 'token ' + token;
    }

    var response = await fetch(apiUrl, { headers: headers });

    if (response.status === 404) {
      return json(Object.assign({}, corsHeaders), {
        success: true,
        data: null,
        message: 'No cloud data yet'
      });
    }

    if (!response.ok) {
      throw new Error('GitHub API error: ' + response.status);
    }

    var fileData = await response.json();
    var content = JSON.parse(decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, '')))));

    return json(Object.assign({}, corsHeaders), {
      success: true,
      data: content,
      sha: fileData.sha
    });
  } catch (error) {
    return json(Object.assign({}, corsHeaders), {
      success: false,
      error: error.message
    }, 500);
  }
}

async function handlePost(request, token, owner, repo, path, syncKey, corsHeaders) {
  try {
    var reqKey = request.headers.get('X-Sync-Key') || '';
    if (syncKey && reqKey !== syncKey) {
      return json(Object.assign({}, corsHeaders), {
        success: false,
        error: 'Invalid sync key'
      }, 403);
    }

    var body;
    try {
      body = await request.json();
    } catch(e) {
      return json(Object.assign({}, corsHeaders), { success: false, error: 'Invalid JSON' }, 400);
    }

    if (!body.data) {
      return json(Object.assign({}, corsHeaders), { success: false, error: 'No data provided' }, 400);
    }

    if (!token) {
      return json(Object.assign({}, corsHeaders), {
        success: false,
        error: 'GitHub token not configured on server'
      }, 500);
    }

    var apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path;

    var sha = null;
    try {
      var existingResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': 'token ' + token,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Cloudflare-Worker'
        }
      });
      if (existingResponse.ok) {
        var existing = await existingResponse.json();
        sha = existing.sha;
      }
    } catch (e) {}

    var content = btoa(unescape(encodeURIComponent(JSON.stringify(body.data, null, 2))));
    var commitMessage = body.message || ('Update user data: ' + new Date().toISOString());

    var putResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Cloudflare-Worker'
      },
      body: JSON.stringify({
        message: commitMessage,
        content: content,
        sha: sha
      })
    });

    if (!putResponse.ok) {
      var errorText = await putResponse.text();
      throw new Error('GitHub API error: ' + putResponse.status);
    }

    var result = await putResponse.json();

    return json(Object.assign({}, corsHeaders), {
      success: true,
      message: 'Data synced to GitHub',
      commit: result.commit.html_url
    });
  } catch (error) {
    return json(Object.assign({}, corsHeaders), {
      success: false,
      error: error.message
    }, 500);
  }
}

function json(headers, data, status) {
  headers['Content-Type'] = 'application/json';
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: headers
  });
}
