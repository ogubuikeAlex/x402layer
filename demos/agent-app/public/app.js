// Atlas agent UI: wallet, dataset catalog, and - the core of the demo - a global
// window.fetch interceptor that turns any 402 into a blocking payment approval.

const fmtCspr = (motes) =>
  motes === null || motes === undefined
    ? 'unavailable'
    : `${(Number(motes) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })} CSPR`;

const short = (s, n = 10) => (s && s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

let MERCHANT_URL = '';
let wallet = null;

// ── The global fetch interceptor ─────────────────────────────────────
// Any response with status 402 is paused: we read the payment terms, block the
// UI with an approval modal, and only resolve the original call once paid.
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const res = await realFetch(input, init);
  if (res.status !== 402) return res;

  const targetUrl = typeof input === 'string' ? input : input.url;
  const paymentRequired = res.headers.get('PAYMENT-REQUIRED');
  if (!paymentRequired) return res; // not an layer402 paywall we understand

  const paid = await requestPaymentApproval({ targetUrl, paymentRequired });
  if (!paid) return res; // user cancelled → hand back the original 402

  // Hand the caller a normal 200 carrying the now-paid data.
  return new Response(JSON.stringify(paid), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

// ── Payment approval modal ───────────────────────────────────────────
const overlay = document.getElementById('overlay');
let resolveApproval = null;

function requestPaymentApproval({ targetUrl, paymentRequired }) {
  return new Promise(async (resolve) => {
    resolveApproval = resolve;

    // Ask our backend to decode the terms and compute the debit breakdown.
    let preview;
    try {
      preview = await realFetch('/api/pay/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentRequired }),
      }).then((r) => r.json());
    } catch {
      preview = null;
    }

    populateModal(preview);
    showModal();

    const approveBtn = document.getElementById('m-approve');
    const cancelBtn = document.getElementById('m-cancel');
    const statusEl = document.getElementById('m-status');

    const IDLE_LABEL = 'Approve &amp; pay';
    const setLoading = (on) => {
      approveBtn.disabled = on;
      cancelBtn.disabled = on;
      approveBtn.classList.toggle('loading', on);
      approveBtn.innerHTML = on ? '<span class="btn-spinner"></span> Paying…' : IDLE_LABEL;
    };
    setLoading(false); // reset in case the modal is reused after a prior attempt

    const cleanup = () => {
      approveBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    cancelBtn.onclick = () => {
      cleanup();
      hideModal();
      resolve(null);
    };

    approveBtn.onclick = async () => {
      setLoading(true);
      statusEl.hidden = false;
      statusEl.textContent = 'Signing payment and settling on-chain…';
      try {
        const result = await realFetch('/api/pay/execute', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ targetUrl, paymentRequired }),
        }).then((r) => r.json());

        if (!result.ok) {
          statusEl.textContent = `Payment failed: ${result.error ?? 'unknown error'}`;
          setLoading(false);
          return;
        }
        if (result.liveAfterMotes != null) setWalletBalance(result.liveAfterMotes);
        else if (result.projectedAfterMotes != null) setWalletBalance(result.projectedAfterMotes);

        cleanup();
        hideModal();
        setLoading(false);
        resolve(result);
      } catch (err) {
        statusEl.textContent = `Error: ${err.message}`;
        setLoading(false);
      }
    };
  });
}

function populateModal(p) {
  const warn = document.getElementById('m-warn');
  if (!p) {
    document.getElementById('m-balance').textContent = 'unavailable';
    document.getElementById('m-amount').textContent = '-';
    document.getElementById('m-after').textContent = '-';
    warn.hidden = false;
    warn.textContent = 'Could not read payment terms.';
    return;
  }
  document.getElementById('m-balance').textContent = fmtCspr(p.balanceMotes);
  document.getElementById('m-amount').textContent = `- ${fmtCspr(p.amountMotes)}`;
  document.getElementById('m-after').textContent = fmtCspr(p.afterMotes);
  document.getElementById('m-recipient').textContent = short(p.recipient, 12);
  document.getElementById('m-network').textContent = p.network;
  document.getElementById('m-did').textContent = short(p.did, 14);

  if (p.funded === false) {
    warn.hidden = false;
    warn.textContent = 'Demo wallet is not funded - balance is illustrative. Set AGENT_PRIVATE_KEY_HEX to a funded key.';
  } else if (p.sufficient === false) {
    warn.hidden = false;
    warn.textContent = 'Balance is below the requested amount - settlement may be rejected.';
  } else {
    warn.hidden = true;
  }
  document.getElementById('m-status').hidden = true;
}

function showModal() {
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('show'));
}
function hideModal() {
  overlay.classList.remove('show');
  setTimeout(() => (overlay.hidden = true), 180);
}

// ── Wallet + catalog ─────────────────────────────────────────────────
function setWalletBalance(motes) {
  document.getElementById('w-balance').textContent = fmtCspr(motes);
}

async function loadWallet() {
  try {
    wallet = await realFetch('/api/wallet').then((r) => r.json());
    MERCHANT_URL = wallet.merchantUrl;
    setWalletBalance(wallet.balanceMotes);
    document.getElementById('w-did').textContent = wallet.did;
    if (!wallet.funded) {
      document.getElementById('w-balance').classList.add('unfunded');
    }
  } catch {
    document.getElementById('w-did').textContent = 'wallet unavailable';
  }
}

async function loadCatalog() {
  const el = document.getElementById('catalog');
  try {
    const { assets } = await realFetch(`${MERCHANT_URL}/api/catalog`).then((r) => r.json());
    el.innerHTML = assets
      .map(
        (a) => `<div class="card">
          <div class="c-kind">${a.kind}</div>
          <div class="c-name">${a.name}</div>
          <div class="c-id">${a.id}</div>
          <div class="c-foot">
            <span class="c-price">${fmtCspr(a.priceMotes)}</span>
            <button class="btn small pull" data-id="${a.id}">Pull data</button>
          </div>
        </div>`,
      )
      .join('');
    el.querySelectorAll('.pull').forEach((btn) => {
      btn.onclick = () => fetchAsset(btn.dataset.id);
    });
  } catch {
    el.innerHTML = '<div class="empty">Could not reach the data provider. Is the Meridian API running?</div>';
  }
}

// The "agent" simply calls fetch() - the interceptor handles any paywall.
async function fetchAsset(id) {
  const section = document.getElementById('results-section');
  const meta = document.getElementById('result-meta');
  const out = document.getElementById('result-json');
  meta.textContent = `Requesting ${id}…`;
  section.hidden = false;
  out.textContent = '';

  try {
    const res = await fetch(`${MERCHANT_URL}/api/assets/${encodeURIComponent(id)}`); // intercepted on 402
    const body = await res.json();

    if (!res.ok) {
      meta.innerHTML = `<span class="r-fail">Payment cancelled - ${id} not retrieved.</span>`;
      out.textContent = JSON.stringify(body, null, 2);
      return;
    }

    const data = body.data ?? body;
    const settlement = body.settlement;
    const receipt = body.receipt;
    let line =
      `<span class="r-ok">✓ paid &amp; settled</span> ${id}` +
      (settlement ? ` · settlement <code>${settlement.settlementId}</code>` : '') +
      (receipt?.facilitatorSignature ? ` · receipt signed` : '');
    if (body.transferExplorerUrl) {
      line += ` · <a class="r-explorer" href="${body.transferExplorerUrl}" target="_blank" rel="noreferrer">view SettlementVault transfer on cspr.live ↗</a>`;
    } else if (body.transferSkipped) {
      line += ` · <span class="r-note">on-chain transfer skipped (${body.transferSkipped})</span>`;
    } else if (body.transferError) {
      line += ` · <span class="r-note">transfer error: ${body.transferError}</span>`;
    }
    meta.innerHTML = line;
    out.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    meta.innerHTML = `<span class="r-fail">Error: ${err.message}</span>`;
  }
}

(async function init() {
  await loadWallet();
  await loadCatalog();
})();
