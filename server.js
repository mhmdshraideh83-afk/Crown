require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const Stripe = require('stripe');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/basics_store';
const JWT_SECRET = process.env.JWT_SECRET || 'basics_jwt_secret_key_123';

const app = express();

// Security Middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));

// Stripe Webhook Endpoint (Requires Raw Body)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).send('Stripe webhook not configured.');
  }

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const orderId = session.client_reference_id;
      
      const Order = mongoose.model('Order');
      const order = await Order.findById(orderId);
      if (order && order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        order.paidAt = new Date();
        order.paymentId = session.payment_intent;
        await order.save();
      }
    }
    res.json({ received: true });
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// JSON and Form Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static Directories
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin-portal', express.static(path.join(__dirname, 'admin')));

// Upload Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid image file type.'));
  }
});

// Database Schemas & Models
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'customer'], default: 'customer' }
}, { timestamps: true });

const variantSchema = new mongoose.Schema({
  size: String,
  colorName: String,
  colorHex: String,
  supplierSku: String,
  supplierVariantId: String,
  available: { type: Boolean, default: true }
});

const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, unique: true },
  description: String,
  category: { type: String, required: true },
  tags: [String],
  price: { type: Number, required: true },
  comparisonPrice: { type: Number, default: 0 },
  costPrice: { type: Number, required: true },
  images: [String],
  availableSizes: [String],
  availableColors: [{ name: String, hex: String }],
  variants: [variantSchema],
  isSoldOut: { type: Boolean, default: false },
  isPublished: { type: Boolean, default: true },
  aliExpressUrl: String,
  supplierId: String,
  supplierProductId: String,
  supplierSku: String
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  customer: {
    name: String, email: String, phone: String,
    address: String, city: String, postalCode: String, country: String
  },
  items: Array,
  subtotal: Number,
  shippingAmount: Number,
  gatewayFee: Number,
  supplierCostTotal: Number,
  estimatedProfit: Number,
  currency: { type: String, default: 'EUR' },
  paymentStatus: { type: String, default: 'pending' },
  fulfillmentStatus: { type: String, default: 'pending' },
  orderStatus: { type: String, default: 'open' },
  paymentProvider: { type: String, default: 'stripe' },
  paymentId: String,
  trackingNumber: String,
  carrier: String
}, { timestamps: true });

const settingsSchema = new mongoose.Schema({
  storeName: { type: String, default: 'BASICS Store' },
  storeCurrency: { type: String, default: 'EUR' },
  paymentProvider: { type: String, default: 'stripe' },
  providerAccountId: { type: String, default: '' },
  maskedPayoutAccount: { type: String, default: '****1234' },
  payoutStatus: { type: String, default: 'Connected' }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// Auth Middleware
const authAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Rate Limiters
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

// --- ROUTES ---

// Auth Routes
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email, role: 'admin' });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { email: user.email, role: user.role } });
});

// Public Product Routes
app.get('/api/products', async (req, res) => {
  const filter = { isPublished: true };
  if (req.query.category && req.query.category !== 'All') filter.category = req.query.category;
  if (req.query.search) filter.title = { $regex: req.query.search, $options: 'i' };

  let sort = { createdAt: -1 };
  if (req.query.sort === 'price_low') sort = { price: 1 };
  if (req.query.sort === 'price_high') sort = { price: -1 };

  const products = await Product.find(filter)
    .select('-costPrice -supplierId -supplierProductId -supplierSku -aliExpressUrl')
    .sort(sort);
  res.json(products);
});

app.get('/api/products/:id', async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, isPublished: true })
    .select('-costPrice -supplierId -supplierProductId -supplierSku -aliExpressUrl');
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

// Public Checkout Route
app.post('/api/checkout/create', async (req, res) => {
  try {
    const { customer, items } = req.body;
    let subtotal = 0;
    let supplierCostTotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isPublished) throw new Error('Product not available');

      subtotal += product.price * item.quantity;
      supplierCostTotal += product.costPrice * item.quantity;

      validatedItems.push({
        productId: product._id,
        titleSnapshot: product.title,
        quantity: item.quantity,
        selectedSize: item.selectedSize,
        selectedColor: item.selectedColor,
        salePrice: product.price,
        supplierCost: product.costPrice
      });
    }

    const gatewayFee = Number((subtotal * 0.029 + 0.30).toFixed(2));
    const estimatedProfit = Number((subtotal - supplierCostTotal - gatewayFee).toFixed(2));
    const orderNumber = `BAS-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    const order = new Order({
      orderNumber,
      customer,
      items: validatedItems,
      subtotal,
      shippingAmount: 0.00,
      gatewayFee,
      supplierCostTotal,
      estimatedProfit,
      currency: 'EUR'
    });

    await order.save();

    // Stripe Session
    if (process.env.STRIPE_SECRET_KEY) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: validatedItems.map(i => ({
          price_data: {
            currency: 'eur',
            product_data: { name: i.titleSnapshot },
            unit_amount: Math.round(i.salePrice * 100)
          },
          quantity: i.quantity
        })),
        mode: 'payment',
        client_reference_id: order._id.toString(),
        customer_email: customer.email,
        success_url: `${req.protocol}://${req.get('host')}/index.html?status=success&order=${order.orderNumber}`,
        cancel_url: `${req.protocol}://${req.get('host')}/index.html?status=cancel`
      });

      return res.json({ checkoutUrl: session.url, orderNumber });
    }

    res.json({ checkoutUrl: `/index.html?status=success&order=${order.orderNumber}`, orderNumber });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Product Management Routes
app.get('/api/admin/products', authAdmin, async (req, res) => {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
});

app.post('/api/admin/products', authAdmin, upload.array('images', 5), async (req, res) => {
  try {
    const data = JSON.parse(req.body.data || '{}');
    if (req.files && req.files.length > 0) {
      data.images = req.files.map(f => `/uploads/${f.filename}`);
    }
    data.slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
    const product = new Product(data);
    await product.save();
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/products/:id', authAdmin, async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(product);
});

app.delete('/api/admin/products/:id', authAdmin, async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// Admin Orders Routes
app.get('/api/admin/orders', authAdmin, async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.json(orders);
});

app.get('/api/admin/settings', authAdmin, async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  res.json(settings);
});

app.put('/api/admin/settings', authAdmin, async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) settings = new Settings();
  Object.assign(settings, req.body);
  await settings.save();
  res.json(settings);
});

// Page Routing Shortcuts
app.get('/admin-portal-login', (req, res) => res.sendFile(path.join(__dirname, 'admin/login.html')));
app.get('/admin-portal', (req, res) => res.sendFile(path.join(__dirname, 'admin/panel.html')));

// Bootstrap Admin & Connect Database
async function init() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.');

  const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@basicsstore.com';
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'ChangeMe123!@#';

  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await User.create({ email: adminEmail, passwordHash, role: 'admin' });
    console.log(`Initial Admin Created: ${adminEmail}`);
  }

  app.listen(PORT, () => console.log(`BASICS Server listening on port ${PORT}`));
}

init().catch(err => console.error('Initialization Failed:', err));