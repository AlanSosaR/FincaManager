const TARGET = 'http://132.145.42.123:8080';
const API_KEY = '429683C4C977415CAAFCCE10F7D57E11';

module.exports = async function handler(req, res) {
  const path = (req.url || '').replace(/^\/api\/wa-proxy\//, '').replace(/^\/api\/wa-proxy(\?|$)/, '');
  const qsIndex = path.indexOf('?');
  const cleanPath = qsIndex >= 0 ? path.slice(0, qsIndex) : path;
  const qs = qsIndex >= 0 ? path.slice(qsIndex) : '';
  const targetUrl = `${TARGET}/${cleanPath}${qs}`;
  const headers = { 'apikey': API_KEY };
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  const fetchOptions = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    let data = '';
    await new Promise(resolve => { req.on('data', c => data += c); req.on('end', resolve); });
    if (data) fetchOptions.body = data;
  }
  try {
    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.text();
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase()))
        res.setHeader(key, value);
    });
    res.end(data);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
};
