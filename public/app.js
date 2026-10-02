let products = [];
let cart = getCart();

document.addEventListener('DOMContentLoaded', async () => {
  products = await fetchProducts();
  renderProducts();
  renderCart();

  document.getElementById('cartButton').addEventListener('click', openCart);
  document.getElementById('cartCloseButton').addEventListener('click', closeCart);
  document.getElementById('drawerOverlay').addEventListener('click', closeCart);
});

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  if (!products.length) {
    grid.innerHTML = '<div class="empty">No products found.</div>';
    return;
  }

  grid.innerHTML = products.map(p => `
    <article class="product-card">
      <div class="product-image">
        <img src="${p.images[0]}" alt="${p.name}">
      </div>
      <div class="product-info">
        <h3>${p.name}</h3>
        <p>${p.price}€</p>
        <button onclick="addToCart(${p.id})" style="margin-top:8px; padding:6px 12px; background:#111; color:#fff; border:0;">Add to Cart</button>
      </div>
    </article>
  `).join('');
}

function addToCart(id) {
  const p = products.find(item => item.id === id);
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ ...p, quantity: 1 });
  }
  saveCart(cart);
  renderCart();
  openCart();
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  document.getElementById('cartCount').textContent = count;
  const cartItems = document.getElementById('cartItems');

  if (!cart.length) {
    cartItems.innerHTML = '<p style="padding:20px; text-align:center;">Your cart is empty.</p>';
    return;
  }

  cartItems.innerHTML = cart.map(item => `
    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
      <div>
        <h4>${item.name}</h4>
        <p>${item.quantity} x ${item.price}€</p>
      </div>
      <strong>${item.price * item.quantity}€</strong>
    </div>
  `).join('');
}

function openCart() {
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}

function closeCart() {
  document.getElementById('cartDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}
  <!-- داخل نافذة السلة YOUR CART -->
<div class="cart-footer">
  <hr style="margin: 15px 0; border: 0; border-top: 1px solid #eee;" />
  <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-bottom: 15px;">
    <span>المجموع الكلي:</span>
    <span id="cart-total">110€</span>
  </div>

  <button onclick="showCheckoutModal()" style="width: 100%; padding: 14px; background: #000; color: #fff; border: none; font-size: 16px; font-weight: bold; border-radius: 8px; cursor: pointer;">
    المتابعة لإتمام الطلب (Checkout)
  </button>
</div>