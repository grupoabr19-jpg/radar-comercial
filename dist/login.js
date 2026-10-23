const form = document.querySelector('#loginForm');
const errorBox = document.querySelector('#loginError');

fetch('/api/auth/session').then((response) => {
  if (response.ok) window.location.replace('/');
}).catch(() => {});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  const button = form.querySelector('button');
  button.disabled = true;
  button.textContent = 'Entrando…';
  try {
    const body = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível entrar.');
    window.location.replace('/');
  } catch (error) {
    errorBox.textContent = error.message;
    button.disabled = false;
    button.textContent = 'Entrar';
  }
});
