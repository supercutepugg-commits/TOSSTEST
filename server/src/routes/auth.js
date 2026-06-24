const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { knex } = require('../db/schema');
const { signToken, requireAuth, requireRole, HQ_ROLES } = require('../middleware/auth');
const { logAudit } = require('../auditLog');

// 로그인 무차별 대입 방어 — 이메일 기준 5회 연속 실패 시 15분 잠금 (단일 프로세스 메모리 기반)
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map(); // email -> { count, lockedUntil }

function getLoginState(email) {
  const state = loginAttempts.get(email);
  if (state?.lockedUntil && state.lockedUntil < Date.now()) {
    loginAttempts.delete(email);
    return null;
  }
  return state || null;
}

// 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const state = getLoginState(email);
    if (state?.lockedUntil) {
      const minutesLeft = Math.ceil((state.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({ error: `로그인 시도가 너무 많습니다. ${minutesLeft}분 후 다시 시도해주세요` });
    }

    const user = await knex('users').where({ email, is_active: true }).first();
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) {
      const next = { count: (state?.count || 0) + 1 };
      if (next.count >= MAX_LOGIN_ATTEMPTS) next.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
      loginAttempts.set(email, next);
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }
    loginAttempts.delete(email);

    const token = signToken(user);
    const { password_hash, ...userInfo } = user;
    res.json({ token, user: userInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 내 정보
router.get('/me', requireAuth, async (req, res) => {
  const user = await knex('users as u')
    .leftJoin('stores as s', 'u.store_id', 's.id')
    .select('u.*', 's.name as store_name')
    .where('u.id', req.user.id).first();
  if (!user) return res.status(404).json({ error: '사용자 없음' });
  const { password_hash, ...userInfo } = user;
  res.json(userInfo);
});

// 사용자 목록 (HQ 전용)
router.get('/users', requireAuth, requireRole('SUPER_ADMIN', 'HQ_ADMIN'), async (req, res) => {
  const users = await knex('users')
    .where({ brand_id: req.user.brand_id })
    .select('id', 'name', 'email', 'role', 'store_id', 'is_active', 'created_at')
    .orderBy('created_at');
  res.json(users);
});

// 사용자 생성
router.post('/users', requireAuth, requireRole('SUPER_ADMIN', 'HQ_ADMIN'), async (req, res) => {
  try {
    const { name, email, password, role, store_id } = req.body;
    if (role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: '최고관리자만 최고관리자 계정을 생성할 수 있습니다' });
    }
    const hash = await bcrypt.hash(password, 10);
    const [{ id }] = await knex('users').insert({
      brand_id: req.user.brand_id,
      store_id: store_id || null,
      name, email,
      password_hash: hash,
      role: role || 'STORE_OWNER',
    }).returning('id');
    await logAudit(req.user.brand_id, req.user.id, 'USER', id, 'CREATE', null, { name, email, role: role || 'STORE_OWNER', store_id: store_id || null });
    res.json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 사용자 수정
router.put('/users/:id', requireAuth, requireRole('SUPER_ADMIN', 'HQ_ADMIN'), async (req, res) => {
  const existing = await knex('users').where({ id: req.params.id, brand_id: req.user.brand_id }).first();
  if (!existing) return res.status(404).json({ error: '없음' });
  const { name, role, store_id, is_active, password } = req.body;
  if (role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: '최고관리자만 최고관리자 권한을 부여할 수 있습니다' });
  }
  const update = {
    name: name ?? existing.name,
    role: role ?? existing.role,
    store_id: store_id !== undefined ? (store_id || null) : existing.store_id,
    is_active: is_active !== undefined ? is_active : existing.is_active,
  };
  if (password) update.password_hash = await bcrypt.hash(password, 10);
  await knex('users').where({ id: req.params.id, brand_id: req.user.brand_id }).update(update);
  await logAudit(req.user.brand_id, req.user.id, 'USER', existing.id, 'UPDATE',
    { name: existing.name, role: existing.role, store_id: existing.store_id, is_active: existing.is_active },
    { name: update.name, role: update.role, store_id: update.store_id, is_active: update.is_active });
  res.json({ ok: true });
});

// 사용자 삭제
router.delete('/users/:id', requireAuth, requireRole('SUPER_ADMIN', 'HQ_ADMIN'), async (req, res) => {
  await knex('users').where({ id: req.params.id, brand_id: req.user.brand_id }).delete();
  await logAudit(req.user.brand_id, req.user.id, 'USER', Number(req.params.id), 'DELETE', null, null);
  res.json({ ok: true });
});

module.exports = router;
