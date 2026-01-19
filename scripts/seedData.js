const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Product = require('../models/Product');
require('dotenv').config();

const seedData = async () => {
  try {
    // Kết nối MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bakery_shop');
    console.log('Connected to MongoDB');

    // Kiểm tra nếu admin đã tồn tại
    const adminExists = await User.findOne({ email: 'admin@bakery.com' });
    if (!adminExists) {
      // Tạo tài khoản admin
      const hashedPassword = await bcrypt.hash('Admin@123', 8);
      await User.create({
        name: 'Admin',
        email: 'admin@bakery.com',
        password: hashedPassword,
        phone: '0123456789',
        address: 'Hà Nội',
        role: 'admin'
      });
      console.log('✅ Tài khoản admin đã được tạo');
      console.log('   Email: admin@bakery.com');
      console.log('   Mật khẩu: Admin@123');
    } else {
      console.log('ℹ️ Tài khoản admin đã tồn tại');
    }

    // Kiểm tra nếu đã có sản phẩm
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
      // Tạo dữ liệu sản phẩm mẫu
      const products = [
        {
          name: 'Bánh Chocolate Sang Trọng',
          description: 'Bánh chocolate ngon tuyệt vời với lớp ganache mịn màng',
          price: 250000,
          category: 'bánh ngọt',
          image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400',
          stock: 15
        },
        {
          name: 'Bánh Dâu Tây Tươi Mát',
          description: 'Bánh kem dâu tây tươi ngon, thích hợp cho mọi buổi tiệc',
          price: 200000,
          category: 'bánh ngọt',
          image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400',
          stock: 20
        },
        {
          name: 'Bánh Matcha Nhật Bản',
          description: 'Bánh matcha tinh tế với hương vị truyền thống Nhật Bản',
          price: 280000,
          category: 'bánh ngọt',
          image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400',
          stock: 10
        },
        {
          name: 'Bánh Sinh Nhật Đầy Sắc Màu',
          description: 'Bánh sinh nhật tùy chỉnh với màu sắc rực rỡ và trang trí đẹp',
          price: 450000,
          category: 'bánh sinh nhật',
          image: 'https://images.unsplash.com/photo-1558636508-e0db3814a4ad?w=400',
          stock: 8
        },
        {
          name: 'Bánh Sinh Nhật Chocolate Đặc Biệt',
          description: 'Bánh sinh nhật với chocolate cao cấp và thiết kế sang trọng',
          price: 500000,
          category: 'bánh sinh nhật',
          image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400',
          stock: 6
        },
        {
          name: 'Bánh Sinh Nhật Vani Cổ Điển',
          description: 'Bánh vani truyền thống với kem tươi và hoa trang trí',
          price: 400000,
          category: 'bánh sinh nhật',
          image: 'https://images.unsplash.com/photo-1535920527894-b86f768b951e?w=400',
          stock: 10
        },
        {
          name: 'Bánh Tiramisu Ý',
          description: 'Bánh tiramisu nguyên bản từ Ý, vị cà phê đậm đà',
          price: 220000,
          category: 'bánh khác',
          image: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=400',
          stock: 12
        },
        {
          name: 'Bánh Mille-feuille Pháp',
          description: 'Bánh lớp Pháp cổ điển với kem nghệ thuật',
          price: 180000,
          category: 'bánh khác',
          image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400',
          stock: 14
        },
        {
          name: 'Bánh Cheesecake New York',
          description: 'Bánh cheesecake nổi tiếng từ New York, vị creamynhịn mịn',
          price: 300000,
          category: 'bánh khác',
          image: 'https://images.unsplash.com/photo-1533134242443-8f2282ba8250?w=400',
          stock: 9
        },
        {
          name: 'Bánh Lạnh Cream Puff',
          description: 'Bánh su kem với kem tươi và sô cô la',
          price: 150000,
          category: 'bánh khác',
          image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400',
          stock: 18
        }
      ];

      await Product.insertMany(products);
      console.log('✅ ' + products.length + ' sản phẩm mẫu đã được tạo');
    } else {
      console.log('ℹ️ Đã có sản phẩm trong cơ sở dữ liệu');
    }

    console.log('\n✨ Seed data hoàn thành!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Lỗi khi seed data:', error.message);
    process.exit(1);
  }
};

seedData();
