// IPs privados/internos que nunca são o IP real do cliente final
const PRIVATE = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^::1$/,
  /^fc/i,
  /^fd/i,
];

function isPrivate(ip) {
  return PRIVATE.some(r => r.test(ip));
}

/**
 * Extrai o IP real do cliente da requisição Express.
 * Com Railway + Netlify, X-Forwarded-For pode conter vários IPs.
 * Busca o primeiro IP público na cadeia (client, proxy1, proxy2…).
 */
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const ips = xff.split(',').map(s => s.trim().replace(/^::ffff:/i, '')).filter(Boolean);
    const pub = ips.find(ip => !isPrivate(ip));
    if (pub) return pub;
    if (ips[0]) return ips[0]; // rede local — retorna o primeiro mesmo assim
  }
  return (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/i, '') || 'desconhecido';
}

module.exports = { getClientIp };
