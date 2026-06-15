const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max:      parseInt(process.env.RATE_LIMIT_MAX || '500'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { erro: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos.' },
  skipSuccessfulRequests: true,
});

const pontoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      5,
  message: { erro: 'Muitas tentativas de registro. Aguarde 1 minuto.' },
});

const cadastroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,                    // máx 5 cadastros por IP por hora
  standardHeaders: true,
  legacyHeaders:   false,
  message: { erro: 'Muitos cadastros realizados. Tente novamente em 1 hora.' },
});

module.exports = { globalLimiter, loginLimiter, pontoLimiter, cadastroLimiter };
