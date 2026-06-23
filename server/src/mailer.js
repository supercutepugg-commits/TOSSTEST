const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendLowStockAlert(ingredients, storeName = '') {
  const rows = ingredients
    .map(i => `• ${i.name}: 현재 ${i.stock}${i.unit} (알림 기준: ${i.threshold}${i.unit})`)
    .join('\n');
  const storeLabel = storeName ? `[${storeName}] ` : '';

  await transporter.sendMail({
    from: `"재고 알림" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    subject: `⚠️ ${storeLabel}재고 부족 알림 — ${ingredients.map(i => i.name).join(', ')}`,
    text: `${storeLabel}아래 재료의 재고가 기준치 이하로 떨어졌습니다.\n\n${rows}\n\n발주를 확인해주세요.`,
    html: `
      <h2>⚠️ ${storeLabel}재고 부족 알림</h2>
      <p>아래 재료의 재고가 기준치 이하로 떨어졌습니다.</p>
      <ul>${ingredients.map(i => `<li><b>${i.name}</b>: 현재 ${i.stock}${i.unit} (기준: ${i.threshold}${i.unit})</li>`).join('')}</ul>
      <p>발주를 확인해주세요.</p>
    `,
  });
}

module.exports = { sendLowStockAlert };
