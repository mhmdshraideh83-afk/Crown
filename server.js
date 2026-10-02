require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// OWASP Security Hardening
app.use(helmet({ contentSecurityPolicy: false }));
app.use(mongoSanitize());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, try again later.' }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage for uploaded images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Database Mock File
const DATA_FILE = path.join(__dirname, 'data.json');
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ products: [], orders: [], settings: {} }));
}

function getData() { return JSON.parse(fs.readFileSync(DATA_FILE)); }
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

// Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// Auth Route
app.post('/api/admin/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

  if (username === adminUser && password === adminPass) {
    const token = jwt.sign({ role: 'admin', user: username }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

// Products API
app.get('/api/products', (req, res) => {
  const data = getData();
  res.json(data.products);
});

app.post('/api/products', authenticateToken, upload.array('images', 5), (req, res) => {
  const data = getData();
  const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
  
  const newProduct = {
    id: Date.now(),
    name: req.body.name,
    price: parseFloat(req.body.price),
    costPrice: parseFloat(req.body.costPrice),
    category: req.body.category,
    sizes: req.body.sizes ? JSON.parse(req.body.sizes) : [],
    colors: req.body.colors ? JSON.parse(req.body.colors) : [],
    aliExpressUrl: req.body.aliExpressUrl,
    supplierId: req.body.supplierId,
    images: images.length > 0 ? images : [req.body.imageUrl || 'https://via.placeholder.com/400'],
    soldOut: req.body.soldOut === 'true'
  };

  data.products.push(newProduct);
  saveData(data);
  res.status(201).json(newProduct);
});

app.delete('/api/products/:id', authenticateToken, (req, res) => {
  const data = getData();
  data.products = data.products.filter(p => p.id !== parseInt(req.params.id));
  saveData(data);
  res.json({ success: true });
});

// Order & Payment Webhook
app.post('/api/checkout', (req, res) => {
  const { cart, customer } = req.body;
  const data = getData();
  
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cost = cart.reduce((sum, item) => sum + ((item.costPrice || 0) * item.quantity), 0);
  const profit = total - cost;

  const order = {
    id: Date.now(),
    customer,
    cart,
    total,
    profit,
    status: 'Paid & Processed',
    fulfillmentNote: 'Drop-shipping order - Do NOT include invoices. Sender: Mohammad Shareeda'
  };

  data.orders.push(order);
  saveData(data);

  res.json({ success: true, orderId: order.id });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));