const API_BASE = '/api/admin';

document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('admin_token')) {
    window.location.href = '/admin-portal-login';
    return;
  }
  loadProducts();
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('productsView').style.display = 'none';
  document.getElementById('ordersView').style.display = 'none';
  document.getElementById('settingsView').style.display = 'none';

  if (tab === 'products') {
    document.getElementById('productsView').style.display = 'block';
    loadProducts();
  } else if (tab === 'orders') {
    document.getElementById('ordersView').style.display = 'block';
    loadOrders();
  } else if (tab === 'settings') {
    document.getElementById('settingsView').style.display = 'block';
  }
}

async function authFetch(url, options = {}) {
  const token = localStorage.getItem('admin_token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  if (res.status === 401 || res.status === 403) {
    logout();
    throw new Error('Unauthenticated');
  }
  return res.json();
}

async function loadProducts() {
  const products = await authFetch(`${API_BASE}/products`);
  const tbody = document.getElementById('productsTable');
  tbody.innerHTML = products.map(p => `
    <tr>
      <td><img src="${p.images?.[0] || ''}" width="40" height="40"></td>
      <td>${p.title}</td>
      <td>€${p.price}</td>
      <td>€${p.costPrice}</td>
      <td>€${(p.price - p.costPrice).toFixed(2)}</td>
      <td><button onclick="deleteProduct('${p._id}')">حذف</button></td>
    </tr>
  `).join('');
}

async function loadOrders() {
  const orders = await authFetch(`${API_BASE}/orders`);
  const tbody = document.getElementById('ordersTable');
  tbody.innerHTML = orders.map(o => `
    <tr>
      <td>${o.orderNumber}</td>
      <td>${o.customer?.name || ''}</td>
      <td>€${o.subtotal}</td>
      <td>${o.paymentStatus}</td>
      <td>${new Date(o.createdAt).toLocaleDateString()}</td>
    </tr>
  `).join('');
}

async function deleteProduct(id) {
  if (confirm('هل أنت تأكد من حذف هذا المنتج؟')) {
    await authFetch(`${API_BASE}/products/${id}`, { method: 'DELETE' });
    loadProducts();
  }
}

function logout() {
  localStorage.removeItem('admin_token');
  window.location.href = '/admin-portal-login';
}