const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const Category = require('../models/Category');
const Discount = require('../models/Discount');

// Middleware kiểm tra là admin
const isAdmin = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/auth/login');
  }
  
  try {
    const user = await User.findById(req.session.userId);
    if (user && user.role === 'admin') {
      next();
    } else {
      return res.status(403).send('Bạn không có quyền truy cập trang này');
    }
  } catch (error) {
    console.log(error);
    return res.status(500).send('Error');
  }
};

// Dashboard chính
router.get('/dashboard', isAdmin, async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalUsers = await User.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$finalPrice' } } }
    ]);

    const recentOrders = await Order.find()
      .populate('user')
      .populate('items.product')
      .sort({ createdAt: -1 })
      .limit(5);

    res.render('admin/dashboard', {
      totalProducts,
      totalUsers,
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      recentOrders,
      user: req.session.userId
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Trang quản lý sản phẩm
router.get('/', isAdmin, async (req, res) => {
  try {
    const products = await Product.find().populate('category');
    res.render('admin/products', { 
      products,
      user: req.session.userId 
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Trang thêm sản phẩm
router.get('/add', isAdmin, async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/add-product', {
      message: null,
      categories,
      user: req.session.userId 
    });
  } catch (error) {
    console.log(error);
    res.render('admin/add-product', {
      message: 'Lỗi khi tải danh mục',
      categories: [],
      user: req.session.userId 
    });
  }
});

// Xử lý thêm sản phẩm
router.post('/add', isAdmin, async (req, res) => {
  try {
    const { name, description, price, category, image, stock } = req.body;

    if (!name || !price || !category) {
      const categories = await Category.find().sort({ name: 1 });
      return res.status(400).render('admin/add-product', {
        message: 'Vui lòng nhập tên, giá và chọn danh mục',
        categories
      });
    }

    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      const categories = await Category.find().sort({ name: 1 });
      return res.status(400).render('admin/add-product', {
        message: 'Danh mục không hợp lệ',
        categories
      });
    }

    const product = await Product.create({
      name,
      description,
      price: parseFloat(price),
      category,
      image,
      stock: parseInt(stock) || 0
    });

    res.redirect('/admin');
  } catch (error) {
    console.log(error);
    const categories = await Category.find().sort({ name: 1 });
    res.status(500).render('admin/add-product', {
      message: 'Lỗi server',
      categories
    });
  }
});

// Trang chỉnh sửa sản phẩm
router.get('/edit/:id', isAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category');
    const categories = await Category.find().sort({ name: 1 });
    res.render('admin/edit-product', { 
      product,
      categories,
      message: null,
      user: req.session.userId 
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Xử lý chỉnh sửa sản phẩm
router.post('/edit/:id', isAdmin, async (req, res) => {
  try {
    const { name, description, price, category, image, stock } = req.body;

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        price: parseFloat(price),
        category,
        image,
        stock: parseInt(stock) || 0
      },
      { new: true }
    );

    res.redirect('/admin');
  } catch (error) {
    console.log(error);
    const product = await Product.findById(req.params.id).populate('category');
    const categories = await Category.find().sort({ name: 1 });
    res.status(500).render('admin/edit-product', {
      product,
      categories,
      message: 'Lỗi server',
      user: req.session.userId
    });
  }
});

// Xóa sản phẩm
router.post('/delete/:id', isAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// ========== QUẢN LÝ ĐƠN HÀNG ==========

// Danh sách đơn hàng
router.get('/orders', isAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('user')
      .populate('items.product')
      .sort({ createdAt: -1 });

    res.render('admin/orders', {
      orders,
      user: req.session.userId
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Chi tiết đơn hàng
router.get('/order/:id', isAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user')
      .populate('items.product');

    res.render('admin/order-detail', {
      order,
      user: req.session.userId
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Cập nhật trạng thái đơn hàng
router.post('/order/:id/status', isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await Order.findByIdAndUpdate(req.params.id, { status });
    res.redirect('/admin/order/' + req.params.id);
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// ========== QUẢN LÝ NGƯỜI DÙNG ==========

// Danh sách người dùng
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });

    res.render('admin/users', {
      users,
      user: req.session.userId
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Chi tiết người dùng
router.get('/user/:id', isAdmin, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    const userOrders = await Order.find({ user: req.params.id })
      .populate('items.product')
      .sort({ createdAt: -1 });

    res.render('admin/user-detail', {
      targetUser,
      userOrders,
      user: req.session.userId
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Cập nhật role người dùng
router.post('/user/:id/role', isAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    await User.findByIdAndUpdate(req.params.id, { role });
    res.redirect('/admin/user/' + req.params.id);
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Xóa người dùng
router.post('/user/:id/delete', isAdmin, async (req, res) => {
  try {
    // Không xóa nếu là admin chính mình
    if (req.params.id === req.session.userId.toString()) {
      return res.status(403).send('Không thể xóa tài khoản admin của chính mình');
    }
    await User.findByIdAndDelete(req.params.id);
    res.redirect('/admin/users');
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// ========== QUẢN LÝ DANH MỤC ==========

// Trang danh sách danh mục
router.get('/categories', isAdmin, async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    const productCounts = {};
    
    for (let cat of categories) {
      const count = await Product.countDocuments({ category: cat._id });
      productCounts[cat._id] = count;
    }
    
    res.render('admin/categories', { 
      categories,
      productCounts,
      user: req.session.userId 
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Trang thêm danh mục
router.get('/category/add', isAdmin, (req, res) => {
  res.render('admin/add-category', {
    message: null,
    user: req.session.userId 
  });
});

// Xử lý thêm danh mục
router.post('/category/add', isAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).render('admin/add-category', {
        message: 'Vui lòng nhập tên danh mục'
      });
    }

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).render('admin/add-category', {
        message: 'Danh mục này đã tồn tại'
      });
    }

    await Category.create({
      name: name.trim(),
      description: description || ''
    });

    res.redirect('/admin/categories');
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Trang chỉnh sửa danh mục
router.get('/category/:id/edit', isAdmin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).send('Không tìm thấy danh mục');
    }

    res.render('admin/edit-category', {
      category,
      message: null,
      user: req.session.userId 
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Xử lý cập nhật danh mục
router.post('/category/:id/edit', isAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).render('admin/edit-category', {
        category: { _id: req.params.id, name, description },
        message: 'Vui lòng nhập tên danh mục'
      });
    }

    // Kiểm tra tên danh mục không trùng với các danh mục khác
    const existingCategory = await Category.findOne({ 
      name: name.trim(),
      _id: { $ne: req.params.id }
    });
    
    if (existingCategory) {
      return res.status(400).render('admin/edit-category', {
        category: { _id: req.params.id, name, description },
        message: 'Danh mục này đã tồn tại'
      });
    }

    await Category.findByIdAndUpdate(req.params.id, {
      name: name.trim(),
      description: description || ''
    });

    res.redirect('/admin/categories');
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Xóa danh mục
router.post('/category/:id/delete', isAdmin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).send('Không tìm thấy danh mục');
    }

    // Kiểm tra xem có sản phẩm nào dùng danh mục này không
    const productCount = await Product.countDocuments({ category: req.params.id });
    if (productCount > 0) {
      return res.status(400).send(`Không thể xóa danh mục này vì còn ${productCount} sản phẩm đang sử dụng`);
    }

    await Category.findByIdAndDelete(req.params.id);
    res.redirect('/admin/categories');
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// ========== QUẢN LÝ MÃ GIẢM GIÁ ==========

// Danh sách mã giảm giá
router.get('/discounts', isAdmin, async (req, res) => {
  try {
    const discounts = await Discount.find().sort({ createdAt: -1 });

    res.render('admin/discounts', {
      discounts,
      user: req.session.userId
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Trang thêm mã giảm giá
router.get('/discount/add', isAdmin, (req, res) => {
  res.render('admin/add-discount', {
    message: null,
    user: req.session.userId
  });
});

// Xử lý thêm mã giảm giá
router.post('/discount/add', isAdmin, async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderValue,
      maxDiscount,
      usageLimit,
      startDate,
      endDate
    } = req.body;

    // Validate
    if (!code || !discountType || !discountValue || !startDate || !endDate) {
      return res.status(400).render('admin/add-discount', {
        message: 'Vui lòng điền đầy đủ các trường bắt buộc'
      });
    }

    // Kiểm tra mã giảm giá đã tồn tại
    const existingDiscount = await Discount.findOne({ code: code.toUpperCase() });
    if (existingDiscount) {
      return res.status(400).render('admin/add-discount', {
        message: 'Mã giảm giá này đã tồn tại'
      });
    }

    // Kiểm tra ngày kết thúc lớn hơn ngày bắt đầu
    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).render('admin/add-discount', {
        message: 'Ngày kết thúc phải sau ngày bắt đầu'
      });
    }

    const discount = await Discount.create({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue: parseFloat(discountValue),
      minOrderValue: parseFloat(minOrderValue) || 0,
      maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    });

    res.redirect('/admin/discounts');
  } catch (error) {
    console.log(error);
    res.status(500).render('admin/add-discount', {
      message: 'Lỗi server'
    });
  }
});

// Trang chỉnh sửa mã giảm giá
router.get('/discount/:id/edit', isAdmin, async (req, res) => {
  try {
    const discount = await Discount.findById(req.params.id);
    if (!discount) {
      return res.status(404).send('Không tìm thấy mã giảm giá');
    }

    res.render('admin/edit-discount', {
      discount,
      message: null,
      user: req.session.userId
    });
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

// Xử lý cập nhật mã giảm giá
router.post('/discount/:id/edit', isAdmin, async (req, res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderValue,
      maxDiscount,
      usageLimit,
      startDate,
      endDate,
      isActive
    } = req.body;

    // Validate
    if (!code || !discountType || !discountValue || !startDate || !endDate) {
      const discount = await Discount.findById(req.params.id);
      return res.status(400).render('admin/edit-discount', {
        discount,
        message: 'Vui lòng điền đầy đủ các trường bắt buộc'
      });
    }

    // Kiểm tra ngày kết thúc lớn hơn ngày bắt đầu
    if (new Date(endDate) <= new Date(startDate)) {
      const discount = await Discount.findById(req.params.id);
      return res.status(400).render('admin/edit-discount', {
        discount,
        message: 'Ngày kết thúc phải sau ngày bắt đầu'
      });
    }

    await Discount.findByIdAndUpdate(req.params.id, {
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue: parseFloat(discountValue),
      minOrderValue: parseFloat(minOrderValue) || 0,
      maxDiscount: maxDiscount ? parseFloat(maxDiscount) : null,
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: isActive === 'on' || isActive === true
    });

    res.redirect('/admin/discounts');
  } catch (error) {
    console.log(error);
    const discount = await Discount.findById(req.params.id);
    res.status(500).render('admin/edit-discount', {
      discount,
      message: 'Lỗi server'
    });
  }
});

// Xóa mã giảm giá
router.post('/discount/:id/delete', isAdmin, async (req, res) => {
  try {
    await Discount.findByIdAndDelete(req.params.id);
    res.redirect('/admin/discounts');
  } catch (error) {
    console.log(error);
    res.status(500).send('Error');
  }
});

module.exports = router;
