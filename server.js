const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function startServer() {
  // Load production secrets if in production mode
  if (!dev && process.env.NODE_ENV === 'production') {
    try {
      console.log('Loading production secrets...');
      const { loadProductionSecrets } = require('./src/lib/secrets');
      await loadProductionSecrets();
    } catch (error) {
      console.error('Failed to load production secrets:', error);
      console.error('Continuing with environment variables only...');
    }
  }
  
  await app.prepare();
  
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
