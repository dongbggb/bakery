const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Middleware kiểm tra đã đăng nhập
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.redirect('/auth/login');
  }
};

// Trang đăng ký
router.get('/register', (req, res) => {
  res.render('auth/register', { message: null });
});

// Xử lý đăng ký
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, passwordConfirm } = req.body;

    if (!name || !email || !password || !passwordConfirm) {
      return res.status(400).render('auth/register', {
        message: 'Vui lòng nhập đầy đủ thông tin'
      });
    }

    if (password !== passwordConfirm) {
      return res.status(400).render('auth/register', {
        message: 'Mật khẩu không khớp'
      });
    }

    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).render('auth/register', {
        message: 'Email đã tồn tại'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'user'
    });

    req.session.userId = newUser._id;
    return res.status(201).redirect('/');
  } catch (error) {
    console.log(error);
    res.status(500).render('auth/register', {
      message: 'Lỗi server'
    });
  }
});

// Trang đăng nhập
router.get('/login', (req, res) => {
  res.render('auth/login', { message: null });
});

// Xử lý đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).render('auth/login', {
        message: 'Vui lòng nhập email và mật khẩu'
      });
    }

    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).render('auth/login', {
        message: 'Email hoặc mật khẩu không chính xác'
      });
    }

    req.session.userId = user._id;
    
    // Nếu là admin, redirect tới dashboard, nếu không redirect tới home
    if (user.role === 'admin') {
      res.status(200).redirect('/admin/dashboard');
    } else {
      res.status(200).redirect('/');
    }
  } catch (error) {
    console.log(error);
    res.status(500).render('auth/login', {
      message: 'Lỗi server'
    });
  }
});

// Đăng xuất
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.send('Error');
    res.redirect('/');
  });
});

module.exports = router;
