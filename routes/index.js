const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Wishlist = require('../models/Wishlist');
const User = require('../models/User');
const Category = require('../models/Category');
const Discount = require('../models/Discount');
const { deductStockIfNeeded, markDiscountUsedIfNeeded } = require('../utils/orderUtils');

// Middleware kiểm tra đã đăng nhập
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.redirect('/auth/login');
  }
};

// Trang chủ - danh sách sản phẩm với phân trang
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const search = req.query.search || '';
    const category = req.query.category || '';

    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      query.category = new mongoose.Types.ObjectId(category);
    }

    const total = await Product.countDocuments(query);
    const pages = Math.ceil(total / limit);

    const products = await Product.find(query)
      .populate('category')
      .limit(limit)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const cart = req.session.cart || [];
    
    // Lấy wishlist của user nếu đã đăng nhập
    let wishlistIds = [];
    if (req.session.userId) {
      const wishlist = await Wishlist.find({ user: req.session.userId });
      wishlistIds = wishlist.map(w => w.product.toString());
    }

    // Lấy danh sách danh mục
    const categories = await Category.find().sort({ name: 1 });

    res.render('index', { 
      products,
      wishlistIds,
      user: req.session.userId,
      cart,
      page,
      pages,
      search,
      category,
      categories
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Trang chi tiết sản phẩm
router.get('/product/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category');
    if (!product) {
      return res.status(404).render('404');
    }

    const reviews = await Review.find({ product: req.params.id })
      .populate('user', 'name')
      .sort({ createdAt: -1 });

    let isInWishlist = false;
    let canReview = false;
    let reviewMessage = '';
    let reviewableOrders = [];

    if (req.session.userId) {
      const wishlist = await Wishlist.findOne({
        user: req.session.userId,
        product: req.params.id
      });
      isInWishlist = !!wishlist;

      // Lấy tất cả đơn hàng đã completed chứa sản phẩm này
      const completedOrders = await Order.find({
        user: req.session.userId,
        'items.product': req.params.id,
        status: 'delivered'
      }).sort({ createdAt: -1 });

      if (completedOrders.length === 0) {
        reviewMessage = 'Bạn cần mua và hoàn thành đơn hàng chứa sản phẩm này mới có thể đánh giá';
      } else {
        // Kiểm tra từng đơn hàng
        for (const order of completedOrders) {
          const now = new Date();
          const orderDate = new Date(order.createdAt);
          const diffDays = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));

          // Kiểm tra xem đã review cho đơn hàng này chưa
          const existingReview = await Review.findOne({
            user: req.session.userId,
            product: req.params.id,
            order: order._id
          });

          if (!existingReview && diffDays <= 7) {
            canReview = true;
            reviewableOrders.push(order._id);
          }
        }

        if (!canReview && reviewableOrders.length === 0) {
          // Kiểm tra xem có review nào trong 7 ngày không
          const hasReviewWithin7Days = await Review.findOne({
            user: req.session.userId,
            product: req.params.id,
            createdAt: {
              $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          });

          if (hasReviewWithin7Days) {
            reviewMessage = 'Bạn chỉ có thể đánh giá một lần cho mỗi lần mua hàng';
          } else {
            reviewMessage = 'Thời gian đánh giá đã hết (tối đa 7 ngày sau khi nhận hàng)';
          }
        }
      }
    }

    res.render('product-detail', {
      product,
      reviews,
      isInWishlist,
      user: req.session.userId,
      canReview,
      reviewMessage,
      reviewableOrders,
      cart: req.session.cart || []
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Thêm review
router.post('/product/:id/review', isAuthenticated, async (req, res) => {
  try {
    const { rating, comment, orderId } = req.body;

    // Kiểm tra orderId có tồn tại và user có quyền review không
    const order = await Order.findOne({
      _id: orderId,
      user: req.session.userId,
      'items.product': req.params.id,
      status: 'delivered'
    });

    if (!order) {
      return res.status(403).send('Bạn không có quyền đánh giá sản phẩm này');
    }

    // Kiểm tra xem đã review cho đơn hàng này chưa
    const existingReview = await Review.findOne({
      user: req.session.userId,
      product: req.params.id,
      order: orderId
    });

    if (existingReview) {
      return res.status(400).send('Bạn đã đánh giá sản phẩm này cho đơn hàng này rồi');
    }

    // Kiểm tra xem còn trong vòng 7 ngày không
    const now = new Date();
    const orderDate = new Date(order.createdAt);
    const diffDays = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));

    if (diffDays > 7) {
      return res.status(400).send('Thời gian đánh giá đã hết (tối đa 7 ngày sau khi nhận hàng)');
    }

    const review = await Review.create({
      product: req.params.id,
      user: req.session.userId,
      order: orderId,
      rating: parseInt(rating),
      comment
    });

    // Cập nhật rating của sản phẩm
    const allReviews = await Review.find({ product: req.params.id });
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    
    await Product.findByIdAndUpdate(req.params.id, {
      rating: avgRating,
      reviewCount: allReviews.length
    });

    res.redirect(`/product/${req.params.id}`);
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Wishlist - xem danh sách yêu thích
router.get('/wishlist', isAuthenticated, async (req, res) => {
  try {
    const wishlist = await Wishlist.find({ user: req.session.userId })
      .populate('product')
      .sort({ createdAt: -1 });

    const products = wishlist.map(w => w.product);

    res.render('wishlist', {
      products,
      user: req.session.userId,
      cart: req.session.cart || []
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Thêm vào wishlist
router.post('/wishlist/add/:id', isAuthenticated, async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.session.userId;

    const exists = await Wishlist.findOne({
      user: userId,
      product: productId
    });

    if (!exists) {
      await Wishlist.create({
        user: userId,
        product: productId
      });
    }

    res.redirect(`/product/${productId}`);
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Xóa khỏi wishlist
router.post('/wishlist/remove/:id', isAuthenticated, async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.session.userId;

    await Wishlist.findOneAndDelete({
      user: userId,
      product: productId
    });

    res.redirect(`/product/${productId}`);
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Thêm vào giỏ hàng (với kiểm tra tồn kho)
router.post('/cart/add/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const quantity = parseInt(req.body.quantity) || 1;

    const product = await Product.findById(productId);
    if (!product || product.stock <= 0) {
      return res.status(400).json({ error: 'Sản phẩm hết hàng' });
    }

    if (!req.session.cart) {
      req.session.cart = [];
    }

    const existingItem = req.session.cart.find(item => item.productId === productId);
    
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      req.session.cart.push({
        productId,
        quantity
      });
    }

    res.redirect(`/product/${productId}`);
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Trang giỏ hàng
router.get('/cart', async (req, res) => {
  try {
    const cart = req.session.cart || [];
    const productIds = cart.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });

    const cartItems = cart.map(item => {
      const product = products.find(p => p._id.toString() === item.productId);
      return {
        product,
        quantity: item.quantity,
        subtotal: product.price * item.quantity
      };
    });

    const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

    // Lấy thông tin user nếu đã đăng nhập
    let user = null;
    if (req.session.userId) {
      user = await User.findById(req.session.userId);
    }

    res.render('cart', { 
      cartItems, 
      total,
      user,
      cart: req.session.cart || [],
      appliedDiscount: req.session.appliedDiscount || null
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Xóa khỏi giỏ hàng
router.post('/cart/remove/:id', (req, res) => {
  const productId = req.params.id;
  if (req.session.cart) {
    req.session.cart = req.session.cart.filter(item => item.productId !== productId);
  }
  res.redirect('/cart');
});

// Cập nhật số lượng
router.post('/cart/update/:id', (req, res) => {
  const productId = req.params.id;
  const quantity = parseInt(req.body.quantity);

  if (req.session.cart) {
    const item = req.session.cart.find(item => item.productId === productId);
    if (item) {
      if (quantity <= 0) {
        req.session.cart = req.session.cart.filter(item => item.productId !== productId);
      } else {
        item.quantity = quantity;
      }
    }
  }

  res.redirect('/cart');
});

// Áp dụng mã giảm giá
router.post('/apply-discount', isAuthenticated, async (req, res) => {
  try {
    const { discountCode } = req.body;

    if (!discountCode) {
      return res.status(400).json({ error: 'Vui lòng nhập mã giảm giá' });
    }

    const discount = await Discount.findOne({ 
      code: discountCode.toUpperCase(),
      isActive: true
    });

    if (!discount) {
      return res.status(400).json({ error: 'Mã giảm giá không hợp lệ' });
    }

    // Kiểm tra thời gian hiệu lực
    const now = new Date();
    if (now < discount.startDate || now > discount.endDate) {
      return res.status(400).json({ error: 'Mã giảm giá đã hết hiệu lực' });
    }

    // Kiểm tra lượt sử dụng
    if (discount.usageLimit && discount.usedCount >= discount.usageLimit) {
      return res.status(400).json({ error: 'Mã giảm giá đã hết lượt sử dụng' });
    }

    // Kiểm tra giá trị đơn hàng tối thiểu
    const cart = req.session.cart || [];
    const productIds = cart.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    
    const subtotal = cart.reduce((sum, item) => {
      const product = products.find(p => p._id.toString() === item.productId);
      return sum + (product.price * item.quantity);
    }, 0);

    if (subtotal < discount.minOrderValue) {
      return res.status(400).json({ 
        error: `Đơn hàng phải tối thiểu ${discount.minOrderValue.toLocaleString('vi-VN')}đ để sử dụng mã này` 
      });
    }

    // Lưu vào session
    req.session.discountCode = discountCode.toUpperCase();
    req.session.appliedDiscount = {
      code: discount.code,
      type: discount.discountType,
      value: discount.discountValue,
      maxDiscount: discount.maxDiscount
    };

    res.json({ 
      success: true, 
      message: 'Áp dụng mã giảm giá thành công!',
      discount: {
        code: discount.code,
        type: discount.discountType,
        value: discount.discountValue,
        subtotal: subtotal,
        minOrderValue: discount.minOrderValue,
        maxDiscount: discount.maxDiscount
      }
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Xóa mã giảm giá
router.post('/remove-discount', isAuthenticated, (req, res) => {
  delete req.session.discountCode;
  delete req.session.appliedDiscount;
  res.json({ success: true });
});

// Checkout
router.post('/checkout', isAuthenticated, async (req, res) => {
  try {
    const cart = req.session.cart || [];

    if (cart.length === 0) {
      return res.redirect('/cart');
    }

    const { name, phone, address, paymentMethod } = req.body;
    const normalizedPayment = paymentMethod === 'vnpay' ? 'vnpay' : 'cod';

    if (!name || !phone || !address) {
      return res.status(400).send('Vui lòng điền đầy đủ thông tin giao hàng');
    }

    const productIds = cart.map(item => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });

    const items = cart.map(item => {
      const product = products.find(p => p._id.toString() === item.productId);
      return {
        product: product._id,
        quantity: item.quantity,
        price: product.price
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    let discountAmount = 0;
    let discountCode = null;
    let finalPrice = subtotal;

    if (req.session.appliedDiscount) {
      const discount = req.session.appliedDiscount;

      if (discount.type === 'percentage') {
        discountAmount = (subtotal * discount.value) / 100;
      } else {
        discountAmount = discount.value;
      }

      if (discount.maxDiscount && discountAmount > discount.maxDiscount) {
        discountAmount = discount.maxDiscount;
      }

      discountCode = discount.code;
      finalPrice = Math.max(0, subtotal - discountAmount);
    }

    const order = await Order.create({
      user: req.session.userId,
      items,
      totalPrice: subtotal,
      discountCode,
      discountAmount,
      finalPrice,
      shippingName: name,
      shippingPhone: phone,
      shippingAddress: address,
      paymentMethod: normalizedPayment,
      paymentStatus: 'pending',
      stockDeducted: false,
      discountUsed: false
    });

    await User.findByIdAndUpdate(req.session.userId, { name, phone, address });

    if (normalizedPayment === 'vnpay') {
      return res.redirect(`/payment/vnpay/${order._id}/start`);
    }

    await deductStockIfNeeded(order);
    await markDiscountUsedIfNeeded(order);

    req.session.cart = [];
    delete req.session.discountCode;
    delete req.session.appliedDiscount;

    return res.redirect(`/order/${order._id}`);
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Xem chi tiết đơn hàng
router.get('/order/:id', isAuthenticated, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product')
      .populate('user');

    if (!order || order.user._id.toString() !== req.session.userId) {
      return res.status(403).send('Không có quyền');
    }

    // Kiểm tra review eligibility cho mỗi sản phẩm
    let productReviewStatus = {};
    
    if (order.status === 'delivered') {
      const now = new Date();
      const orderDate = new Date(order.createdAt);
      const diffDays = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));

      for (const item of order.items) {
        const productId = item.product._id.toString();
        
        // Kiểm tra xem đã review chưa
        const existingReview = await Review.findOne({
          user: req.session.userId,
          product: productId,
          order: order._id
        });

        if (existingReview) {
          productReviewStatus[productId] = { canReview: false, reason: 'Đã đánh giá' };
        } else if (diffDays > 7) {
          productReviewStatus[productId] = { canReview: false, reason: 'Hết thời gian' };
        } else {
          productReviewStatus[productId] = { canReview: true, reason: null };
        }
      }
    }

    res.render('order-detail', { 
      order,
      user: req.session.userId,
      cart: req.session.cart || [],
      productReviewStatus
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Trang lịch sử đơn hàng
router.get('/orders', isAuthenticated, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.session.userId })
      .populate('items.product')
      .sort({ createdAt: -1 });

    res.render('orders', { 
      orders,
      user: req.session.userId,
      cart: req.session.cart || []
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Trang profile
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      return res.status(404).send('Không tìm thấy người dùng');
    }

    // Tính số đơn hàng và tổng chi tiêu
    const orders = await Order.find({ user: req.session.userId });
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + order.finalPrice, 0);

    res.render('profile', {
      user,
      totalOrders,
      totalSpent,
      success: null,
      error: null,
      cart: req.session.cart || []
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Cập nhật profile
router.post('/profile', isAuthenticated, async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;

    // Kiểm tra email đã tồn tại chưa (nếu thay đổi)
    const user = await User.findById(req.session.userId);
    
    if (email !== user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        const orders = await Order.find({ user: req.session.userId });
        const totalOrders = orders.length;
        const totalSpent = orders.reduce((sum, order) => sum + order.finalPrice, 0);
        
        return res.status(400).render('profile', {
          user,
          totalOrders,
          totalSpent,
          error: 'Email này đã được sử dụng',
          success: null,
          cart: req.session.cart || []
        });
      }
    }

    // Cập nhật user
    const updatedUser = await User.findByIdAndUpdate(
      req.session.userId,
      { name, email, phone, address },
      { new: true }
    );

    const orders = await Order.find({ user: req.session.userId });
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + order.finalPrice, 0);

    res.render('profile', {
      user: updatedUser,
      totalOrders,
      totalSpent,
      success: 'Cập nhật thông tin thành công!',
      error: null,
      cart: req.session.cart || []
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

module.exports = router;
