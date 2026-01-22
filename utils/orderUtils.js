const Product = require('../models/Product');
const Discount = require('../models/Discount');

async function deductStockIfNeeded(order) {
  if (order.stockDeducted) return order;

  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity }
    });
  }

  order.stockDeducted = true;
  await order.save();
  return order;
}

async function markDiscountUsedIfNeeded(order) {
  if (!order.discountCode || order.discountUsed) return order;

  await Discount.findOneAndUpdate(
    { code: order.discountCode },
    { $inc: { usedCount: 1 } }
  );

  order.discountUsed = true;
  await order.save();
  return order;
}

async function finalizePaidOrder(order, options = {}) {
  if (order.paymentStatus === 'paid') return order;

  order.paymentStatus = 'paid';
  order.status = options.status || 'confirmed';
  order.paymentRef = options.paymentRef || order.paymentRef;
  order.paymentMessage = options.paymentMessage || order.paymentMessage;
  order.paidAt = options.paidAt || new Date();
  await order.save();

  await deductStockIfNeeded(order);
  await markDiscountUsedIfNeeded(order);
  return order;
}

module.exports = {
  deductStockIfNeeded,
  markDiscountUsedIfNeeded,
  finalizePaidOrder
};
