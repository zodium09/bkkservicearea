const express = require('express');
const path = require('path');
const network = require('./services/network.service');
const healthRoutes = require('./routes/health.routes');
const layerRoutes = require('./routes/layers.routes');
const analyzeRoutes = require('./routes/analyze.routes');
const networkRoutes = require('./routes/network.routes');

const app = express();
const PORT = process.env.PORT || 5174;

app.use(express.json({ limit: '20mb' }));

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
