const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/admin/login.html';

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  document.getElementById(`tab-${tabName}`).classList.add('active');
  event.target.classList.add('active');

  if (tabName === 'orders') loadOrders();
  if (tabName === 'products') loadProducts();
}

function toggleProductForm() {
  const form = document.getElementById('productForm');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// Load & Display Products
async function loadProducts() {
  const res = await fetch('/api/products');
  const products = await res.json();
  const container = document.getElementById('productsList');
  
  if(!products.length) {
    container.innerHTML = '<p>لا يوجد منتجات حالياً.</p>';
    return;
  }

  container.innerHTML = products.map(p => `
    <div style="display:flex; align-items:center; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
      <div style="display:flex; align-items:center; gap:10px;">
        <img src="${p.images[0]}" width="50" height="50" style="object-fit:cover; border-radius:5px;" />
        <div>
          <strong>${p.name}</strong><br/>
          <small>سعر البيع: $${p.price} | التكلفة: $${p.costPrice}</small>
        </div>
      </div>
      <button onclick="deleteProduct(${p.id})" style="background:#ff4d4d; color:white; border:none; padding:6px 12px; border-radius:5px; cursor:pointer;">حذف</button>
    </div>
  `).join('');
}

// Delete Product
async function deleteProduct(id) {
  if(!confirm('هل أنت تأكد من حذف المنتج؟')) return;
  await fetch(`/api/products/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  loadProducts();
}

// Submit Product
document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById('p_name').value,
    price: document.getElementById('p_price').value,
    costPrice: document.getElementById('p_cost').value,
    category: document.getElementById('p_category').value,
    aliExpressUrl: document.getElementById('p_ali_url').value,
    supplierId: document.getElementById('p_supplier').value,
    imageUrl: document.getElementById('p_img').value
  };

  const res = await fetch('/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    alert('تم إضافة المنتج بنجاح!');
    toggleProductForm();
    loadProducts();
  }
});

// Load Orders
async function loadOrders() {
  const res = await fetch('/api/admin/orders', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const orders = await res.json();
  
  document.getElementById('orderCount').textContent = orders.length;
  const tbody = document.getElementById('ordersTable');

  if(!orders.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">لا يوجد طلبات حتى الآن.</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map(o => `
    <tr>
      <td>#${o.id}</td>
      <td>${o.customer.name}</td>
      <td>${o.customer.phone || 'N/A'}<br/><small>${o.customer.address || ''}</small></td>
      <td>$${o.total}</td>
      <td style="color:green; font-weight:bold;">+$${o.profit}</td>
      <td><span class="badge">${o.status}</span></td>
    </tr>
  `).join('');
}

// Save Payout Settings
document.getElementById('payoutForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const card = document.getElementById('payoutCard').value;
  
  const res = await fetch('/api/admin/payout-settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ card })
  });

  if(res.ok) {
    alert('تم حفظ إعدادات بطاقة الأرباح بنجاح!');
  }
});

// Initial Load
loadProducts();