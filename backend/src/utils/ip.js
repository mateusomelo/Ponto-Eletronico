/**
 * Extrai o IP real do cliente da requisição Express.
 * - Prioriza X-Forwarded-For (quando há proxy/nginx na frente)
 * - Usa req.ip (Express trust proxy já resolvido) como segundo
 * - Remove prefixo IPv6-mapeado ::ffff: para mostrar IPv4 puro
 */
function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  const raw = xff
    ? xff.split(',')[0].trim()
    : (req.ip || req.socket?.remoteAddress || '');

  // ::ffff:192.168.0.7  →  192.168.0.7
  return raw.replace(/^::ffff:/i, '') || 'desconhecido';
}

module.exports = { getClientIp };
