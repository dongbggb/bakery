const express = require('express');
const crypto = require('crypto');
const qs = require('qs');
const Order = require('../models/Order');
const { finalizePaidOrder } = require('../utils/orderUtils');

const router = express.Router();

const getVnpConfig = (req) => ({
  tmnCode: process.env.VNP_TMN_CODE,
  secretKey: process.env.VNP_HASH_SECRET,
  vnpUrl: process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  returnUrl: process.env.VNP_RETURN_URL || `${req.protocol}://${req.get('host')}/payment/vnpay/return`,
  ipnUrl: process.env.VNP_IPN_URL || `${req.protocol}://${req.get('host')}/payment/vnpay/ipn`
});

const sortObject = (obj) => {
  const sorted = {};
  const keys = Object.keys(obj).sort();
  keys.forEach((key) => {
    sorted[key] = obj[key];
  });
  return sorted;
};

const createSecureHash = (secretKey, vnpParams) => {
  const keys = Object.keys(vnpParams).sort();
  const signData = keys
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(vnpParams[key]).replace(/%20/g, '+')}`)
    .join('&');
  const hmac = crypto.createHmac('sha512', secretKey);
  return hmac.update(signData, 'utf-8').digest('hex');
};

const buildVnpParams = (order, config, clientIp, bankCode) => {
  const date = new Date();
  const createDate = `${date.getFullYear()}${(`${date.getMonth() + 1}`).padStart(2, '0')}${(`${date.getDate()}`).padStart(2, '0')}${(`${date.getHours()}`).padStart(2, '0')}${(`${date.getMinutes()}`).padStart(2, '0')}${(`${date.getSeconds()}`).padStart(2, '0')}`;

  const vnp_Params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.tmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: order._id.toString(),
    vnp_OrderInfo: `Thanh toan don hang ${order._id.toString()}`,
    vnp_OrderType: 'other',
    vnp_Amount: Math.round(order.finalPrice * 100),
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: clientIp,
    vnp_CreateDate: createDate,
    vnp_BankCode: bankCode || undefined
  };

  Object.keys(vnp_Params).forEach((key) => {
    if (vnp_Params[key] === undefined) delete vnp_Params[key];
  });

  return vnp_Params;
};

router.get('/vnpay/:orderId/start', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).send('Không tìm thấy đơn hàng');
    if (order.paymentMethod !== 'vnpay') return res.status(400).send('Đơn hàng không sử dụng VNPAY');
    if (order.paymentStatus === 'paid') return res.redirect(`/order/${order._id}`);

    const config = getVnpConfig(req);
    if (!config.tmnCode || !config.secretKey) {
      return res.status(500).send('Thiếu cấu hình VNPAY. Vui lòng bổ sung biến môi trường.');
    }

    const clientIp = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip;
    const vnp_Params = buildVnpParams(order, config, clientIp, req.query.bankCode);

    const sortedParams = sortObject(vnp_Params);
    const secureHash = createSecureHash(config.secretKey, sortedParams);
    sortedParams.vnp_SecureHash = secureHash;

    const paymentUrl = `${config.vnpUrl}?${qs.stringify(sortedParams, { encode: true })}`;
    return res.redirect(paymentUrl);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Lỗi khởi tạo thanh toán VNPAY');
  }
});

router.get('/vnpay/return', async (req, res) => {
  try {
    const config = getVnpConfig(req);
    const vnp_Params = { ...req.query };
    const secureHash = vnp_Params.vnp_SecureHash;
    delete vnp_Params.vnp_SecureHash;
    delete vnp_Params.vnp_SecureHashType;

    const sortedParams = sortObject(vnp_Params);
    const checkHash = createSecureHash(config.secretKey, sortedParams);

    if (secureHash !== checkHash) {
      return res.status(400).send('Chữ ký không hợp lệ');
    }

    const orderId = vnp_Params.vnp_TxnRef;
    const rspCode = vnp_Params.vnp_ResponseCode;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).send('Không tìm thấy đơn hàng');
    }

    if (order.paymentMethod !== 'vnpay') {
      return res.status(400).send('Phương thức thanh toán không hợp lệ');
    }

    const paidAmount = Number(vnp_Params.vnp_Amount || 0) / 100;
    if (Math.round(order.finalPrice) !== paidAmount) {
      return res.status(400).send('Sai số tiền thanh toán');
    }

    if (rspCode === '00') {
      await finalizePaidOrder(order, {
        paymentRef: vnp_Params.vnp_TransactionNo,
        paymentMessage: 'Thanh toán VNPAY thành công',
        paidAt: new Date()
      });

      if (req.session) {
        req.session.cart = [];
        delete req.session.discountCode;
        delete req.session.appliedDiscount;
      }

      return res.redirect(`/order/${order._id}`);
    }

    order.paymentStatus = 'failed';
    order.paymentMessage = `Thanh toán thất bại: ${rspCode}`;
    await order.save();

    return res.redirect(`/order/${order._id}`);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Lỗi xử lý phản hồi VNPAY');
  }
});

router.get('/vnpay/ipn', async (req, res) => {
  try {
    const config = getVnpConfig(req);
    const vnp_Params = { ...req.query };
    const secureHash = vnp_Params.vnp_SecureHash;

    delete vnp_Params.vnp_SecureHash;
    delete vnp_Params.vnp_SecureHashType;

    const sortedParams = sortObject(vnp_Params);
    const checkHash = createSecureHash(config.secretKey, sortedParams);

    if (secureHash !== checkHash) {
      return res.status(200).json({ RspCode: '97', Message: 'Invalid checksum' });
    }

    const orderId = vnp_Params.vnp_TxnRef;
    const rspCode = vnp_Params.vnp_ResponseCode;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(200).json({ RspCode: '01', Message: 'Order not found' });
    }

    if (order.paymentMethod !== 'vnpay') {
      return res.status(200).json({ RspCode: '02', Message: 'Invalid payment method' });
    }

    const paidAmount = Number(vnp_Params.vnp_Amount || 0) / 100;
    if (Math.round(order.finalPrice) !== paidAmount) {
      return res.status(200).json({ RspCode: '04', Message: 'Invalid amount' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(200).json({ RspCode: '00', Message: 'Order already paid' });
    }

    if (rspCode === '00') {
      await finalizePaidOrder(order, {
        paymentRef: vnp_Params.vnp_TransactionNo,
        paymentMessage: 'Thanh toán VNPAY thành công',
        paidAt: new Date()
      });

      return res.status(200).json({ RspCode: '00', Message: 'Success' });
    }

    order.paymentStatus = 'failed';
    order.paymentMessage = `Thanh toán thất bại: ${rspCode}`;
    await order.save();

    return res.status(200).json({ RspCode: '02', Message: 'Payment failed' });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
  }
});

module.exports = router;
