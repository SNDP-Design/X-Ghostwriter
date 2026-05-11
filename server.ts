import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting server in', process.env.NODE_ENV, 'mode');
console.log('Root directory:', process.cwd());

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Add headers for iframe compatibility
  app.use((req, res, next) => {
    // Aggressive headers to allow iframing on all platforms (Chrome Extensions, Sidebars, etc)
    res.setHeader('Content-Security-Policy', "frame-ancestors *;");
    // We explicitly set X-Frame-Options to ALLOWALL; although it is non-standard, many proxies and older browsers use it as an escape hatch
    res.setHeader('X-Frame-Options', 'ALLOWALL'); 
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.removeHeader('X-Content-Type-Options'); // Sometimes sniffing helps in edge cases with extension sidebars
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
});

  // Health check for sidebar connectivity testing
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      time: new Date().toISOString(),
      service: 'XGhostwriter',
      env: process.env.NODE_ENV
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve from the dist folder
    const distPath = path.join(process.cwd(), 'dist');
    console.log('Production mode: Serving static files from:', distPath);
    
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
