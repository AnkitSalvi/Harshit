const { list, head } = require('@vercel/blob');

module.exports = async (req, res) => {
  try {
    var blobs = await list({ prefix: 'cms/' });

    if (blobs.blobs.length === 0) {
      return res.json({ blobCount: 0, blobs: [] });
    }

    var b = blobs.blobs[0];
    var token = process.env.BLOB_READ_WRITE_TOKEN;

    // Try different fetch approaches to see which works
    var results = {};

    // Approach 1: fetch downloadUrl with no auth
    try {
      var r1 = await fetch(b.downloadUrl);
      results.downloadUrl_noAuth = { status: r1.status, ok: r1.ok };
      if (r1.ok) results.downloadUrl_noAuth.body = (await r1.text()).substring(0, 100);
    } catch (e) { results.downloadUrl_noAuth = { error: e.message }; }

    // Approach 2: fetch downloadUrl with Bearer token
    try {
      var r2 = await fetch(b.downloadUrl, { headers: { 'Authorization': 'Bearer ' + token } });
      results.downloadUrl_bearer = { status: r2.status, ok: r2.ok };
      if (r2.ok) results.downloadUrl_bearer.body = (await r2.text()).substring(0, 100);
    } catch (e) { results.downloadUrl_bearer = { error: e.message }; }

    // Approach 3: fetch url with Bearer token
    try {
      var r3 = await fetch(b.url, { headers: { 'Authorization': 'Bearer ' + token } });
      results.url_bearer = { status: r3.status, ok: r3.ok };
      if (r3.ok) results.url_bearer.body = (await r3.text()).substring(0, 100);
    } catch (e) { results.url_bearer = { error: e.message }; }

    // Approach 4: fetch url with x-vercel-blob-token header
    try {
      var r4 = await fetch(b.url, { headers: { 'x-api-version': '7', 'authorization': 'Bearer ' + token } });
      results.url_xtoken = { status: r4.status, ok: r4.ok };
      if (r4.ok) results.url_xtoken.body = (await r4.text()).substring(0, 100);
    } catch (e) { results.url_xtoken = { error: e.message }; }

    // Approach 5: use head() to get a signed downloadUrl
    try {
      var meta = await head(b.url);
      var r5 = await fetch(meta.downloadUrl);
      results.head_downloadUrl_noAuth = { status: r5.status, ok: r5.ok, url: meta.downloadUrl.substring(0, 80) };
      if (r5.ok) results.head_downloadUrl_noAuth.body = (await r5.text()).substring(0, 100);
    } catch (e) { results.head_downloadUrl_noAuth = { error: e.message }; }

    return res.json({
      blob: { pathname: b.pathname, url: b.url, downloadUrl: b.downloadUrl, size: b.size },
      fetchResults: results
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
