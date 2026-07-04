const loginTab = document.getElementById('loginTab');
const signupTab = document.getElementById('signupTab');
const authForm = document.getElementById('authForm');
const submitBtn = document.getElementById('submitBtn');
const errorMsg = document.getElementById('errorMsg');
const roomJoinBox = document.getElementById('roomJoinBox');

let mode = 'login';

loginTab.onclick = () => setMode('login');
signupTab.onclick = () => setMode('signup');

function setMode(newMode) {
  mode = newMode;
  loginTab.classList.toggle('active', mode === 'login');
  signupTab.classList.toggle('active', mode === 'signup');
  submitBtn.textContent = mode === 'login' ? 'Login' : 'Sign Up';
  errorMsg.textContent = '';
}

authForm.onsubmit = async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  const endpoint = mode === 'login' ? '/api/login' : '/api/signup';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      errorMsg.textContent = data.error || 'Something went wrong';
      return;
    }

    if (mode === 'signup') {
      // After signup, switch to login automatically
      setMode('login');
      errorMsg.style.color = '#4dff88';
      errorMsg.textContent = 'Account created! Please log in.';
      return;
    }

    // Logged in — store username, show room join box
    sessionStorage.setItem('username', data.username);
    authForm.style.display = 'none';
    roomJoinBox.style.display = 'flex';
  } catch (err) {
    errorMsg.textContent = 'Server error. Is the backend running?';
  }
};

document.getElementById('joinRoomBtn').onclick = () => {
  const roomId = document.getElementById('roomId').value.trim();
  if (!roomId) return alert('Enter a room ID');
  sessionStorage.setItem('roomId', roomId);
  window.location.href = 'room.html';
};
