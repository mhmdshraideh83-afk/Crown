let products = [];
let cart = JSON.parse(localStorage.getItem('basics_cart') || '[]');

document.addEventListener('DOMContentLoaded', () => {
  fetchProducts();
  renderCart();
});

async function fetchProducts() {
  try {
    products = await apiRequest('/products');
    renderProducts(products);
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

function renderProducts(items) {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = items.map(item => `
    <div class="product-card">
      <img src="${item.images?.[0] || 'https://via.placeholder.com/300'}" alt="${escapeHtml(item.title)}">
      <div class="product-title">${escapeHtml(item.title)}</div>
      <div class="product-price">${formatCurrency(item.price)}</div>
      <button class="btn-add" onclick="openProductModal('${item._id}')">VIEW PRODUCT</button>
    </div>
  `).join('');
}

function handleSearch() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const filtered = products.filter(p => p.title.toLowerCase().includes(search));
  renderProducts(filtered);
}

function handleFilter() {
  const category = document.getElementById('categorySelect').value;
  const sort = document.getElementById('sortSelect').value;
  let url = `/products?category=${category}`;
  if (sort !== 'default') url += `&sort=${sort}`;
  
  apiRequest(url).then(res => renderProducts(res));
}

function openProductModal(id) {
  const p = products.find(x => x._id === id);
  if (!p) return;

  const view = document.getElementById('modalProductDetail');
  view.innerHTML = `
    <h2>${escapeHtml(p.title)}</h2>
    <p style="margin: 10px 0; color:#777;">${escapeHtml(p.description || '')}</p>
    <div style="font-size:20px; font-weight:bold; margin-bottom:15px;">${formatCurrency(p.price)}</div>
    
    <label>Size:</label>
    <select id="selectSize" style="width:100%; padding:8px; margin-bottom:10px;">
      ${(p.availableSizes || ['M']).map(s => `<option value="${s}">${s}</option>`).join('')}
    </select>

    <label>Color:</label>
    <select id="selectColor" style="width:100%; padding:8px; margin-bottom:15px;">
      ${(p.availableColors || [{ name: 'Default' }]).map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
    </select>

    <button class="btn-checkout" onclick="addToCart('${p._id}')">ADD TO CART</button>
  `;

  document.getElementById('productModal').classList.add('open');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('open');
}

function addToCart(productId) {
  const product = products.find(p => p._id === productId);
  const size = document.getElementById('selectSize').value;
  const color = document.getElementById('selectColor').value;

  const existing = cart.find(c => c.productId === productId && c.size === size && c.color === color);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      productId,
      title: product.title,
      price: product.price,
      size,
      color,
      quantity: 1
    });
  }

  saveCart();
  closeProductModal();
  toggleCart();
}

function saveCart() {
  localStorage.setItem('basics_cart', JSON.stringify(cart));
  renderCart();
}

function renderCart() {
  const cartItems = document.getElementById('cartItems');
  const cartCount = document.getElementById('cartCount');
  const cartTotal = document.getElementById('cart-total');

  let total = 0;
  let count = 0;

  cartItems.innerHTML = cart.map((item, index) => {
    total += item.price * item.quantity;
    count += item.quantity;
    return `
      <div class="cart-item">
        <div>
          <strong>${escapeHtml(item.title)}</strong><br>
          <small>${item.size} / ${item.color}</small><br>
          ${formatCurrency(item.price)} x ${item.quantity}
        </div>
        <button onclick="removeFromCart(${index})" style="border:none; background:none; cursor:pointer;">✕</button>
      </div>
    `;
  }).join('');

  cartCount.innerText = count;
  cartTotal.innerText = formatCurrency(total);
}

function removeFromCart(index) {
  cart.splice(index, 1);
  saveCart();
}

function toggleCart() {
  document.getElementById('cartDrawer').classList.toggle('open');
  document.getElementById('drawerOverlay').classList.toggle('open');
}

function openCheckout() {
  if (cart.length === 0) return alert('Your cart is empty');
  toggleCart();
  document.getElementById('checkoutModal').classList.add('open');
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').classList.remove('open');
}

async function processCheckout(e) {
  e.preventDefault();
  const customer = {
    name: document.getElementById('custName').value,
    email: document.getElementById('custEmail').value,
    phone: document.getElementById('custPhone').value,
    address: document.getElementById('custAddress').value,
    city: document.getElementById('custCity').value,
    postalCode: document.getElementById('custZip').value,
    country: document.getElementById('custCountry').value
  };

  const items = cart.map(c => ({
    productId: c.productId,
    quantity: c.quantity,
    selectedSize: c.size,
    selectedColor: c.color
  }));

  try {
    const res = await apiRequest('/checkout/create', {
      method: 'POST',
      body: JSON.stringify({ customer, items })
    });

    localStorage.removeItem('basics_cart');
    window.location.href = res.checkoutUrl;
  } catch (err) {
    alert(err.message);
  }
}