async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    localStorage.setItem('admin_token', data.token);
    window.location.href = '/admin-portal';
  } catch (err) {
    alert(err.message);
  }
}