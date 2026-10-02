const API_BASE = '';

async function fetchProducts() {
  const res = await fetch(`${API_BASE}/api/products`);
  return res.json();
}

function getCart() {
  return JSON.parse(localStorage.getItem('basicsCart')) || [];
}

function saveCart(cart) {
  localStorage.setItem('basicsCart', JSON.stringify(cart));
}