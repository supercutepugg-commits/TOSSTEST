const jwt = require('jsonwebtoken');
const { knex } = require('../db/schema');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error('JWT_SECRET 환경변수가 설정되지 않았습니다. server/.env에 JWT_SECRET을 설정하세요.');
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, brand_id: user.brand_id, store_id: user.store_id },
    SECRET,
    { expiresIn: '7d' }
  );
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다' });
  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: '토큰이 유효하지 않습니다' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: '권한이 없습니다' });
    }
    next();
  };
}

// HQ roles
const HQ_ROLES = ['SUPER_ADMIN', 'HQ_ADMIN', 'HQ_LOGISTICS', 'HQ_ACCOUNTING'];
const STORE_ROLES = ['STORE_OWNER', 'STORE_STAFF'];

module.exports = { signToken, requireAuth, requireRole, HQ_ROLES, STORE_ROLES, SECRET };
