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
 *   1. X-Nf-Client-Connection-Ip — header do Netlify, SEMPRE o IP real do
 *      visitante. Necessário porque o proxy redirect do Netlify (_redirects
 *      /api/* -> Railway) substitui o X-Forwarded-For pelo IP de saída do
 *      próprio Netlify (confirmado em teste real: XFF trazia IP da AWS
 *      enquanto o IP real do cliente só aparecia nesse header).
 *   2. X-Forwarded-For (fallback quando não vem via Netlify, ex: acesso direto ao Railway)
 *   3. X-Real-IP (nginx, alguns proxies)
 *   4. req.ip do Express (respeita trust proxy)
 *   5. socket.remoteAddress (fallback final)
 */
function getClientIp(req) {
  // 1. Netlify: IP real do visitante, garantido pela plataforma
  const nfIp = cleanIp(req.headers['x-nf-client-connection-ip']);
  if (nfIp) return nfIp;

  // 2. X-Forwarded-For: pode ter lista "client, proxy1, proxy2"
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const ips = xff.split(',').map(s => cleanIp(s)).filter(Boolean);
    const pub = ips.find(ip => !isPrivate(ip));
    if (pub) return pub;
    if (ips[0]) return ips[0]; // retorna o primeiro mesmo sendo privado (rede local)
  }

  // 3. X-Real-IP
  const realIp = cleanIp(req.headers['x-real-ip']);
  if (realIp) {
    if (!isPrivate(realIp)) return realIp;
    return realIp;
  }

  // 4. req.ip do Express (definido corretamente quando trust proxy está ativo)
  const expressIp = cleanIp(req.ip);
  if (expressIp && expressIp !== '::1') return expressIp;

  // 5. Socket direto (último recurso)
  return cleanIp(req.socket?.remoteAddress) || 'desconhecido';
}

module.exports = { getClientIp };
