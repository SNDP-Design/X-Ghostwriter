const iframe = document.getElementById('main-frame');
const fallback = document.getElementById('fallback');
const refreshBtn = document.getElementById('refresh-btn');
const statusText = document.getElementById('connectivity-status');

// Use relative URL if we're on the same domain, otherwise fallback
const APP_URL = window.location.origin.includes('chrome-extension') 
  ? 'https://ais-pre-bn325icmpdv6ttgrbu7mog-27836221828.asia-east1.run.app' 
  : '';

async function checkConnectivity() {
  if (!statusText) return;
  try {
    const start = Date.now();
    const endpoint = `${APP_URL}/api/health`;
    console.log('Checking connectivity to:', endpoint);
    
    const res = await fetch(endpoint, { mode: 'cors' });
    const end = Date.now();
    
    if (res.ok) {
      const data = await res.json();
      statusText.innerText = `Connected! (${end - start}ms) - Mode: ${data.env || 'unknown'}`;
      statusText.style.color = '#4ade80';
      console.log('Connectivity success:', data);
    } else {
      statusText.innerText = `Server returned ${res.status}. Login might be required.`;
      statusText.style.color = '#fbbf24';
    }
  } catch (e) {
    statusText.innerText = 'Cannot reach server. Please log in using the button below.';
    statusText.style.color = '#ef4444';
    console.error('Connectivity check failed:', e);
  }
}

// Check initially
checkConnectivity();

// Set initial iframe src
if (iframe) {
  const baseSrc = APP_URL ? `${APP_URL}/` : '/';
  // Check if src is currently about:blank or empty or just /
  const currentSrc = iframe.getAttribute('src');
  if (!currentSrc || currentSrc === '/' || currentSrc === 'about:blank') {
    iframe.src = baseSrc;
    console.log('Set initial iframe src to:', baseSrc);
  }
}

function reloadFrame(event) {
  console.log('Reloading iframe...');
  if (event) event.preventDefault();
  
  // Use relative src if on same origin
  const baseSrc = APP_URL ? `${APP_URL}/` : '/';
  const newUrl = `${baseSrc}?t=${Date.now()}`;
  
  console.log('New URL target:', newUrl);
  
  // Visual feedback on button
  const btn = event?.target || refreshBtn;
  if (btn) {
    const originalText = btn.innerText;
    btn.innerText = 'Refreshing...';
    btn.disabled = true;
    setTimeout(() => {
      btn.innerText = originalText;
      btn.disabled = false;
    }, 1000);
  }

  // Force actual reload
  if (iframe) {
    iframe.src = 'about:blank';
    setTimeout(() => {
      iframe.src = newUrl;
      checkConnectivity();
    }, 50);
  }
}

if (refreshBtn) {
  refreshBtn.addEventListener('click', reloadFrame);
}

// Timeout helper to show troubleshooting if app doesn't load
let loadTimeout = setTimeout(() => {
  if (fallback && (fallback.style.display !== 'none')) {
    const tip = document.querySelector('p[style*="font-size: 11px"]');
    if (tip) {
      tip.innerHTML = `<strong>Still stuck?</strong> Chrome might be blocking third-party cookies or the iframe. Try enabling "Allow all cookies" for this site in your browser settings.`;
      tip.style.color = '#fbbf24';
    }
  }
}, 5000);

// Listen for messages from the app
window.addEventListener('message', (event) => {
  // Guard: only accept messages from our app domain
  if (!event.origin.includes('.run.app')) return;

  if (event.data.type === 'XGHOSTWRITER_LOADED') {
    console.log('App loaded successfully in sidebar');
    clearTimeout(loadTimeout);
    if (fallback) fallback.style.display = 'none';
    if (iframe) {
      iframe.style.display = 'block';
      iframe.style.height = '100vh';
      iframe.style.width = '100vw';
    }
  }
});
