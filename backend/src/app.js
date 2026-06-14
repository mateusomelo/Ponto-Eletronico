require('dotenv').config();
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const compression = require('compression');
const morgan     = require('morgan');
const path       = require('path');
const cookieParser = require('cookie-parser');
const { testConnection } = require('./database/connection');
const { runMigrations }  = require('./database/migrate');
const { globalLimiter } = require('./middlewares/rateLimiter');

const app = express();

// ── Segurança ────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet({
  // HSTS desabilitado: o app roda em HTTP puro (sem HTTPS).
  // Com HSTS ativo, o browser força https:// em IPs da rede local e quebra todos os recursos.
  hsts: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc:              ["'self'"],
      scriptSrc:               ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      scriptSrcAttr:           ["'unsafe-inline'"],
      styleSrc:                ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      fontSrc:                 ["'self'", 'cdn.jsdelivr.net'],
      imgSrc:                  ["'self'", 'data:', 'blob:', 'https://*.tile.openstreetmap.org', 'https://nominatim.openstreetmap.org'],
      connectSrc:              ["'self'", 'https://nominatim.openstreetmap.org'],
      upgradeInsecureRequests: null,   // não forçar HTTPS — app roda em HTTP
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());
app.use(cors({
  origin:      origins,
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ── Arquivos estáticos ────────────────────────────────────
// Em desenvolvimento: serve o frontend diretamente pelo Express
// Em produção: frontend está no Netlify; só uploads e dependências JS/CSS são servidos aqui
const UPLOADS_ROOT = process.env.UPLOADS_PATH
  ? path.resolve(process.env.UPLOADS_PATH)
  : path.join(__dirname, '../../uploads');

if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/public')));
}
app.use('/uploads', express.static(UPLOADS_ROOT));
// Dependências frontend (proxiadas pelo Netlify em produção)
app.use('/fa',       express.static(path.join(__dirname, '../node_modules/@fortawesome/fontawesome-free')));
app.use('/leaflet',  express.static(path.join(__dirname, '../node_modules/leaflet/dist')));
app.use('/chartjs',  express.static(path.join(__dirname, '../node_modules/chart.js/dist')));

// ── Rotas API ─────────────────────────────────────────────
app.use('/api/', globalLimiter);
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/usuarios',      require('./routes/users'));
app.use('/api/ponto',         require('./routes/ponto'));
app.use('/api/cargos',        require('./routes/cargos'));
app.use('/api/relatorios',    require('./routes/relatorios'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/logs',          require('./routes/logs'));
app.use('/api/configuracoes',  require('./routes/configuracoes'));
app.use('/api/fechamento',    require('./routes/fechamento'));
app.use('/api/notificacoes',  require('./routes/notificacoes'));
app.use('/api/empresas',      require('./routes/empresas'));

// ── Health check ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── SPA fallback ─────────────────────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ erro: 'Rota não encontrada.' });
  }
  // Em desenvolvimento: serve o HTML do frontend
  // Em produção: o Netlify serve os HTMLs; Railway só responde a /api/* e /uploads/*
  if (process.env.NODE_ENV !== 'production') {
    return res.sendFile(path.join(__dirname, '../../frontend/public/index.html'));
  }
  res.status(404).json({ erro: 'Não encontrado.' });
});

// ── Erro global ──────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[App Error]', err);
  res.status(err.status || 500).json({ erro: err.message || 'Erro interno no servidor.' });
});

// ── Start ────────────────────────────────────────────────
const http  = require('http');
const https = require('https');
const os    = require('os');
const fs    = require('fs');

const PORT       = parseInt(process.env.PORT       || '3000');
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443');

function getLocalIPs() {
  const ips = [];
  Object.values(os.networkInterfaces()).flat().forEach(i => {
    if (i && i.family === 'IPv4' && !i.internal) ips.push(i.address);
  });
  return ips;
}

async function initCerts() {
  const dir = path.join(__dirname, '../certs');
  const crt = path.join(dir, 'cert.pem');
  const key = path.join(dir, 'key.pem');

  if (fs.existsSync(crt) && fs.existsSync(key)) {
    return { cert: fs.readFileSync(crt), key: fs.readFileSync(key) };
  }

  const selfsigned = require('selfsigned');
  const ips  = getLocalIPs();
  const alts = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...ips.map(ip => ({ type: 7, ip })),
  ];

  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'ponto-eletronico.local' }],
    { keySize: 2048, days: 3650, algorithm: 'sha256',
      extensions: [{ name: 'subjectAltName', altNames: alts }] }
  );

  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  fs.writeFileSync(crt, pems.cert);
  fs.writeFileSync(key, pems.private);
  console.log('🔐 Certificado HTTPS gerado em backend/certs/ (válido por 10 anos)');
  return { cert: pems.cert, key: pems.private };
}

testConnection().then(async () => {
  await runMigrations();

  // HTTP — Railway usa apenas HTTP internamente (TLS é terminado pelo proxy da plataforma)
  http.createServer(app).listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 HTTP:  http://localhost:${PORT}`);
    console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });

  // HTTPS local — apenas em desenvolvimento (celular na rede local)
  if (process.env.NODE_ENV !== 'production') {
    try {
      const tls = await initCerts();
      https.createServer(tls, app).listen(HTTPS_PORT, () => {
        const ips = getLocalIPs();
        console.log(`🔒 HTTPS: https://localhost:${HTTPS_PORT}`);
        ips.forEach(ip =>
          console.log(`🔒 HTTPS: https://${ip}:${HTTPS_PORT}  ← use no celular`)
        );
        console.log('\n   📱 Celular: toque "Avançado" → "Prosseguir" no aviso de certificado\n');
      });
    } catch (e) {
      console.error('⚠️  HTTPS não iniciado:', e.message);
    }
  }
});

module.exports = app;
