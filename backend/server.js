const express = require('express');
const path = require('path');
const network = require('./services/network.service');
const healthRoutes = require('./routes/health.routes');
const layerRoutes = require('./routes/layers.routes');
const analyzeRoutes = require('./routes/analyze.routes');
const networkRoutes = require('./routes/network.routes');

const app = express();
const PORT = process.env.PORT || 5174;

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || process.env.CORS_ORIGINS === '*')) {
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGINS === '*' ? '*' : origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use(express.json({ limit: '20mb' }));

app.use((error, _req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      error: true,
      code: 'INVALID_JSON',
      message: 'Request body must be valid JSON.',
    });
  }
  return next(error);
});

app.use('/arcgis', async (req, res) => {
  try {
    const target = req.originalUrl.replace(/^\/arcgis/, '');
    const upstream = await network.fetchArcgis(target);
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    res.send(upstream.body);
  } catch (error) {
    res.status(502).json({ error: 'ArcGIS proxy failed', detail: error.message });
  }
});

app.use('/api', healthRoutes);
app.use('/api', layerRoutes);
app.use('/api', analyzeRoutes);
app.use('/api', networkRoutes);

app.use(express.static(path.join(network.ROOT, 'dist')));

app.use((req, res) => {
  res.sendFile(path.join(network.ROOT, 'dist', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Bangkok service area API listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
