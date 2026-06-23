const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { knex } = require('../db/schema');
const { signToken, requireAuth, requireRole, HQ_ROLES } = require('../middleware/auth');

// 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await knex('users').where({ email, is_active: true }).first();
    if (!user) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    const token = signToken(user);
    const { password_hash, ...userInfo } = user;
    res.json({ token, user: userInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 내 정보
router.get('/me', requireAuth, async (req, res) => {
  const user = await knex('users').where({ id: req.user.id }).first();
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
    const [id] = await knex('users').insert({
      brand_id: req.user.brand_id,
      store_id: store_id || null,
      name, email,
      password_hash: hash,
      role: role || 'STORE_OWNER',
    });
    res.json({ id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 사용자 수정
router.put('/users/:id', requireAuth, requireRole('SUPER_ADMIN', 'HQ_ADMIN'), async (req, res) => {
  const { name, role, store_id, is_active, password } = req.body;
  if (role === 'SUPER_ADMIN' && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: '최고관리자만 최고관리자 권한을 부여할 수 있습니다' });
  }
  const update = { name, role, store_id: store_id || null, is_active };
  if (password) update.password_hash = await bcrypt.hash(password, 10);
  await knex('users').where({ id: req.params.id, brand_id: req.user.brand_id }).update(update);
  res.json({ ok: true });
});

// 사용자 삭제
router.delete('/users/:id', requireAuth, requireRole('SUPER_ADMIN', 'HQ_ADMIN'), async (req, res) => {
  await knex('users').where({ id: req.params.id, brand_id: req.user.brand_id }).delete();
  res.json({ ok: true });
});

module.exports = router;
