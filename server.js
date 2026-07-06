const app = require('./backend/server');

const PORT = process.env.PORT || 5174;

app.listen(PORT, () => {
  console.log(`Bangkok service area API listening on http://127.0.0.1:${PORT}`);
});
