const API_BASE = '/api';

function formatCurrency(amount, currency = 'EUR') {
  const symbol = currency === 'USD' ? '$' : '€';
  return `${symbol}${Number(amount).toFixed(2)}`;
}

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('admin_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API Request Failed');
  return data;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}