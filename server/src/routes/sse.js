const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { SECRET } = require('../middleware/auth');

const clients = new Set();

router.get('/', (req, res) => {
  // EventSource는 커스텀 헤더를 보낼 수 없어 토큰을 쿼리스트링으로 전달
  const token = req.query.token;
  try {
    jwt.verify(token, SECRET);
  } catch {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.add(res);
  req.on('close', () => clients.delete(res));
});

function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => res.write(msg));
}

module.exports = { router, broadcast };
