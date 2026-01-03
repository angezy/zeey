function normalizeIp(raw) {
  if (!raw) return '';
  let ip = String(raw).trim();

  // Handle lists like "client, proxy1, proxy2"
  if (ip.includes(',')) ip = ip.split(',')[0].trim();

  // Strip IPv6 bracketed port: "[::1]:1234"
  const bracketMatch = ip.match(/^\[([^\]]+)\]:(\d+)$/);
  if (bracketMatch) ip = bracketMatch[1];

  // Strip IPv4 port: "1.2.3.4:1234"
  const ipv4PortMatch = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4PortMatch) ip = ipv4PortMatch[1];

  // Unwrap IPv6-mapped IPv4 like "::ffff:127.0.0.1"
  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7);

  // Normalize loopback to empty (not useful for geo)
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0') return '';

  return ip;
}

function isPrivateIpv4(ip) {
  const m = String(ip).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o1 = Number(m[1]), o2 = Number(m[2]);
  if ([o1, o2].some(n => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  if (o1 === 10) return true;
  if (o1 === 127) return true;
  if (o1 === 192 && o2 === 168) return true;
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  return false;
}

function getClientIp(req) {
  try {
    const xff = req.headers && req.headers['x-forwarded-for'];
    const xri = req.headers && req.headers['x-real-ip'];
    const candidates = [];

    if (xff) {
      String(xff)
        .split(',')
        .map(s => normalizeIp(s))
        .filter(Boolean)
        .forEach(v => candidates.push(v));
    }
    if (xri) candidates.push(normalizeIp(xri));
    if (req.ip) candidates.push(normalizeIp(req.ip));
    if (req.connection && req.connection.remoteAddress) candidates.push(normalizeIp(req.connection.remoteAddress));
    if (req.socket && req.socket.remoteAddress) candidates.push(normalizeIp(req.socket.remoteAddress));

    const cleaned = candidates.map(normalizeIp).filter(Boolean);
    if (cleaned.length === 0) return '';

    // Prefer first public-ish IPv4 if available; otherwise first cleaned value
    const firstPublicV4 = cleaned.find(ip => ip.includes('.') && !isPrivateIpv4(ip));
    return firstPublicV4 || cleaned[0];
  } catch (e) {
    return '';
  }
}

module.exports = { getClientIp, normalizeIp };

