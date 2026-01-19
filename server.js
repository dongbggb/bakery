const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
require('dotenv').config();

const app = express();

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bakery_shop')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error:', err));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware để lưu thông tin user vào res.locals
app.use((req, res, next) => {
  if (req.session.userId) {
    const User = require('./models/User');
    User.findById(req.session.userId)
      .then(user => {
        res.locals.user = user;
        next();
      })
      .catch(err => {
        console.log('Error finding user:', err);
        res.locals.user = null;
        next();
      });
  } else {
    res.locals.user = null;
    next();
  }
});

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/payment', require('./routes/payment'));

// 404 handler
app.use((req, res) => {
  res.status(404).render('404');
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('500', { error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
