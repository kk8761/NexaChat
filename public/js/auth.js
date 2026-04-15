/* ═══════════════════════════════════════════════════
   NexaChat — Auth Page Logic
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // If already authenticated, redirect to chat
  if (isAuthenticated()) {
    navigateTo('/chat');
    return;
  }

  initTabs();
  initPhoneAuth();
  initGoogleAuth();
});

// ── Tab Switching ──
function initTabs() {
  const tabs = document.querySelectorAll('.auth-tab');
  const phoneAuth = document.getElementById('phone-auth');
  const googleAuth = document.getElementById('google-auth');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const target = tab.dataset.tab;
      if (target === 'phone') {
        phoneAuth.classList.remove('hidden');
        googleAuth.classList.add('hidden');
      } else {
        phoneAuth.classList.add('hidden');
        googleAuth.classList.remove('hidden');
      }
    });
  });
}

// ═══════════════════════════════════════════════════
// PHONE OTP AUTH
// ═══════════════════════════════════════════════════
function initPhoneAuth() {
  const phoneInput = document.getElementById('phone-input');
  const nameInput = document.getElementById('name-input');
  const sendOtpBtn = document.getElementById('send-otp-btn');
  const verifyOtpBtn = document.getElementById('verify-otp-btn');
  const backBtn = document.getElementById('back-to-phone');
  const resendBtn = document.getElementById('resend-otp-btn');
  
  const step1 = document.getElementById('phone-step-1');
  const step2 = document.getElementById('phone-step-2');
  
  let countdownInterval;

  // Send OTP
  sendOtpBtn.addEventListener('click', async () => {
    const phone = phoneInput.value.trim();
    const name = nameInput.value.trim();

    if (!phone || phone.length < 10) {
      showToast('Please enter a valid phone number', 'error');
      phoneInput.focus();
      return;
    }

    sendOtpBtn.disabled = true;
    sendOtpBtn.innerHTML = '<span class="spinner"></span> Sending...';

    try {
      const data = await api('/api/auth/send-otp', {
        method: 'POST',
        body: { phone, displayName: name },
      });

      showToast(data.message, 'success');

      // Show step 2
      step1.classList.remove('active');
      step2.classList.add('active');

      // Display phone number
      document.getElementById('otp-phone-display').textContent = phone;

      // Demo mode: show OTP
      if (data.demoOtp) {
        const demoBox = document.getElementById('demo-otp-box');
        demoBox.classList.remove('hidden');
        document.getElementById('demo-otp-code').textContent = data.demoOtp;
      }

      // Start countdown
      startCountdown(60);

      // Focus first OTP input
      document.querySelector('.otp-input[data-index="0"]').focus();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      sendOtpBtn.disabled = false;
      sendOtpBtn.innerHTML = '<span>Send OTP</span><span>→</span>';
    }
  });

  // OTP Input handling
  const otpInputs = document.querySelectorAll('.otp-input');
  otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      const value = e.target.value.replace(/\D/g, '');
      e.target.value = value;

      if (value && index < 5) {
        otpInputs[index + 1].focus();
      }

      // Check if all filled
      const code = Array.from(otpInputs).map(i => i.value).join('');
      verifyOtpBtn.disabled = code.length !== 6;
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        otpInputs[index - 1].focus();
      }
    });

    // Paste handling
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      paste.split('').forEach((char, i) => {
        if (otpInputs[i]) otpInputs[i].value = char;
      });
      const code = Array.from(otpInputs).map(i => i.value).join('');
      verifyOtpBtn.disabled = code.length !== 6;
      if (code.length === 6) verifyOtpBtn.focus();
    });
  });

  // Verify OTP
  verifyOtpBtn.addEventListener('click', async () => {
    const code = Array.from(otpInputs).map(i => i.value).join('');
    const phone = phoneInput.value.trim();
    const name = nameInput.value.trim();

    if (code.length !== 6) {
      showToast('Please enter the full 6-digit OTP', 'error');
      return;
    }

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.innerHTML = '<span class="spinner"></span> Verifying...';

    try {
      const data = await api('/api/auth/verify-otp', {
        method: 'POST',
        body: { phone, code, displayName: name },
      });

      setToken(data.token);
      setUser(data.user);

      showToast('Welcome to NexaChat! 🚀', 'success');
      
      setTimeout(() => navigateTo('/chat'), 800);
    } catch (error) {
      showToast(error.message, 'error');
      otpInputs.forEach(i => { i.value = ''; });
      otpInputs[0].focus();
    } finally {
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.innerHTML = '<span>Verify & Sign In</span><span>✓</span>';
    }
  });

  // Back button
  backBtn.addEventListener('click', () => {
    step2.classList.remove('active');
    step1.classList.add('active');
    otpInputs.forEach(i => { i.value = ''; });
    verifyOtpBtn.disabled = true;
    clearInterval(countdownInterval);
    document.getElementById('demo-otp-box').classList.add('hidden');
  });

  // Resend OTP
  resendBtn.addEventListener('click', () => {
    sendOtpBtn.click();
  });

  // Countdown timer
  function startCountdown(seconds) {
    clearInterval(countdownInterval);
    let remaining = seconds;
    const timerText = document.getElementById('otp-timer-text');
    const countdown = document.getElementById('otp-countdown');
    
    timerText.classList.remove('hidden');
    resendBtn.classList.add('hidden');

    countdownInterval = setInterval(() => {
      remaining--;
      countdown.textContent = remaining;

      if (remaining <= 0) {
        clearInterval(countdownInterval);
        timerText.classList.add('hidden');
        resendBtn.classList.remove('hidden');
      }
    }, 1000);
  }

  // Enter key handling
  phoneInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendOtpBtn.click();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendOtpBtn.click();
  });
}

// ═══════════════════════════════════════════════════
// GOOGLE AUTH
// ═══════════════════════════════════════════════════
function initGoogleAuth() {
  const googleBtn = document.getElementById('google-signin-btn');

  googleBtn.addEventListener('click', async () => {
    // Try using Google Identity Services
    if (window.google && window.google.accounts) {
      try {
        const { clientId } = await api('/api/auth/google/client-id');
        
        if (clientId && clientId !== '') {
          google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredential,
          });
          google.accounts.id.prompt();
        } else {
          showToast('Google OAuth not configured. Please set GOOGLE_CLIENT_ID in server .env file.', 'info', 6000);
        }
      } catch (e) {
        showToast('Google sign-in unavailable. Check console for details.', 'error');
        console.error('Google auth error:', e);
      }
    } else {
      showToast('Google Identity Services not loaded. Try refreshing the page.', 'error');
    }
  });
}

// Google credential callback (global)
async function handleGoogleCredential(response) {
  try {
    const data = await api('/api/auth/google', {
      method: 'POST',
      body: { credential: response.credential },
    });

    setToken(data.token);
    setUser(data.user);

    showToast('Welcome to NexaChat! 🚀', 'success');
    setTimeout(() => navigateTo('/chat'), 800);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Make it globally accessible for Google callback
window.handleGoogleCredential = handleGoogleCredential;
