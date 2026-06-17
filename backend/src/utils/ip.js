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

function cleanIp(ip) {
  return (ip || '').trim().replace(/^::ffff:/i, '');
}

/**
 * Extrai o IP público real do cliente da requisição Express.
 * Verifica os cabeçalhos de proxy em ordem de confiabilidade:
 *   1. X-Forwarded-For (padrão Netlify / Railway / nginx)
 *   2. X-Real-IP (nginx, alguns proxies)
 *   3. req.ip do Express (respeita trust proxy)
 *   4. socket.remoteAddress (fallback final)
 */
function getClientIp(req) {
  // 1. X-Forwarded-For: pode ter lista "client, proxy1, proxy2"
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const ips = xff.split(',').map(s => cleanIp(s)).filter(Boolean);
    const pub = ips.find(ip => !isPrivate(ip));
    if (pub) return pub;
    if (ips[0]) return ips[0]; // retorna o primeiro mesmo sendo privado (rede local)
  }

  // 2. X-Real-IP
  const realIp = cleanIp(req.headers['x-real-ip']);
  if (realIp) {
    if (!isPrivate(realIp)) return realIp;
    return realIp;
  }

  // 3. req.ip do Express (definido corretamente quando trust proxy está ativo)
  const expressIp = cleanIp(req.ip);
  if (expressIp && expressIp !== '::1') return expressIp;

  // 4. Socket direto (último recurso)
  return cleanIp(req.socket?.remoteAddress) || 'desconhecido';
}

module.exports = { getClientIp };
