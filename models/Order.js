const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      },
      quantity: Number,
      price: Number
    }
  ],
  totalPrice: {
    type: Number,
    required: true
  },
  discountCode: {
    type: String,
    default: null
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  finalPrice: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['cod', 'vnpay'],
    default: 'cod'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentRef: {
    type: String,
    default: null
  },
  paymentMessage: {
    type: String,
    default: null
  },
  paidAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  discountUsed: {
    type: Boolean,
    default: false
  },
  stockDeducted: {
    type: Boolean,
    default: false
  },
  shippingName: String,
  shippingPhone: String,
  shippingAddress: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Order', orderSchema);
