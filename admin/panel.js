const token = localStorage.getItem('adminToken');
if (!token) window.location.href = '/admin/login.html';

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const body = {
    name: document.getElementById('name').value,
    price: document.getElementById('price').value,
    costPrice: document.getElementById('costPrice').value,
    category: document.getElementById('category').value,
    aliExpressUrl: document.getElementById('aliExpressUrl').value,
    supplierId: document.getElementById('supplierId').value,
    imageUrl: document.getElementById('imageUrl').value
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
    alert('Product added successfully!');
    location.reload();
  } else {
    alert('Failed to add product');
  }
});