const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Product = require('../models/Product');
const Order = require('../models/Order');

const router = express.Router();

let genAI = null;
const fallbackModels = [
  process.env.GEMINI_MODEL,
  'gemini-3-flash-preview',
].filter(Boolean);

async function buildContext() {
  const [topRated, bestSellers] = await Promise.all([
    Product.find()
      .sort({ rating: -1, reviewCount: -1, createdAt: -1 })
      .limit(6)
      .lean(),
    Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.product', sold: { $sum: '$items.quantity' } } },
      { $sort: { sold: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' }
    ])
  ]);

  const topRatedText = topRated
    .map((p) => `- ${p.name} | giá ${p.price?.toLocaleString('vi-VN')}đ | rating ${(p.rating || 0).toFixed(1)} (${p.reviewCount || 0} đánh giá)`)
    .join('\n');

  const bestSellerText = bestSellers
    .map((b) => `- ${b.product.name} | giá ${b.product.price?.toLocaleString('vi-VN')}đ | đã bán ${b.sold} | rating ${(b.product.rating || 0).toFixed(1)} (${b.product.reviewCount || 0} đánh giá)`)
    .join('\n');

  return `Sản phẩm đánh giá cao:\n${topRatedText}\n\nSản phẩm bán chạy:\n${bestSellerText}`;
}

async function buildContext() {
  const [topRated, bestSellers] = await Promise.all([
    Product.find()
      .sort({ rating: -1, reviewCount: -1, createdAt: -1 })
      .limit(6)
      .lean(),
    Order.aggregate([
      { $unwind: '$items' },
      { $group: { _id: '$items.product', sold: { $sum: '$items.quantity' } } },
      { $sort: { sold: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' }
    ])
  ]);

  const topRatedText = topRated
    .map((p) => `- ${p._id}|${p.name}|${p.price}|${p.rating || 0}|${p.reviewCount || 0}|${p.image || ''}`)
    .join('\n');

  const bestSellerText = bestSellers
    .map((b) => `- ${b.product._id}|${b.product.name}|${b.product.price}|${b.product.rating || 0}|${b.product.reviewCount || 0}|${b.product.image || ''}|${b.sold}`)
    .join('\n');

  return `TOP_RATED\n${topRatedText}\nBEST_SELLERS\n${bestSellerText}`;
}

function getModel() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  const modelName = fallbackModels[0];
  return genAI.getGenerativeModel({ model: modelName });
}

router.get('/', (req, res) => {
  res.render('chat', {
    user: res.locals.user || null,
    cart: req.session.cart || []
  });
});

router.post('/api/message', async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong .env' });
    }

    const { messages = [] } = req.body || {};

    const history = messages
      .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
      .join('\n');

    const context = await buildContext();

    const prompt = `Bạn là trợ lý bán bánh. Chỉ trả lời dựa trên dữ liệu cửa hàng.\n- Dữ liệu được cung cấp dạng pipe: id|name|price|rating|reviews|imageUrl|(sold).\n- Nếu gợi ý sản phẩm, trả về HTML card với link tới trang chi tiết: <a class="product-card" href="/product/{id}" target="_blank"><img class="product-img" src="..." /><div class="product-name">Tên</div><div class="product-price">Giá ...đ</div><div class="product-meta">Rating X.X | Đã bán Y</div></a>.\n- Nếu thiếu dữ liệu (id/name/price), hãy nói chưa có thông tin.\n- Không bịa số liệu.\n\nDữ liệu cửa hàng:\n${context}\n\nHội thoại:\n${history}\nAssistant:`;

    const model = getModel();
    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    return res.json({ reply });
  } catch (error) {
    console.error('Gemini chat error:', error.message);
    const hint = fallbackModels.join(', ');
    return res.status(500).json({ error: `Không thể xử lý: ${error.message}. Thử đổi GEMINI_MODEL sang một trong: ${hint}` });
  }
});

module.exports = router;
