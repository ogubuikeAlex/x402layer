// Atlas agent UI: wallet, dataset catalog, and - the core of the demo - a global
// window.fetch interceptor that turns any 402 into a blocking payment approval.

const fmtCspr = (motes) =>
  motes === null || motes === undefined
    ? 'unavailable'
    : `${(Number(motes) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 })} CSPR`;

const short = (s, n = 10) => (s && s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s);

// Escape untrusted (merchant-supplied) strings before interpolating into innerHTML.
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function paymentErrorSummary(body) {
  const detail = body?.detail;
  const verify = detail?.verify;
  const settle = detail?.settle;
  if (verify?.reason) return `${verify.reason}: ${verify.detail ?? 'verification failed'}`;
  if (settle?.error) return `${settle.error}: ${settle.detail ?? 'settlement failed'}`;
  if (detail?.stage) return `${detail.stage} failed`;
  return body?.error ?? 'payment failed';
}

let MERCHANT_URL = '';
let wallet = null;
// Autonomous mode: pay 402s without asking. Server env sets the default
// (AGENT_AUTO_PAY, on unless =false); the header toggle overrides at runtime.
let autoPay = true;

// ── The global fetch interceptor ─────────────────────────────────────
// Any response with status 402 is paused. In autonomous mode the payment is
// signed + settled immediately; otherwise a blocking approval modal is shown.
const realFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const res = await realFetch(input, init);
  if (res.status !== 402) return res;

  const targetUrl = typeof input === 'string' ? input : input.url;
  const paymentRequired = res.headers.get('PAYMENT-REQUIRED');
  if (!paymentRequired) return res; // not an layer402 paywall we understand

  const paid = autoPay
    ? await executeAutonomously({ targetUrl, paymentRequired })
    : await requestPaymentApproval({ targetUrl, paymentRequired });
  if (!paid) return res; // cancelled / failed → hand back the original 402

  // Hand the caller the payment attempt result. Failed payments keep their 402
  // status so the page can render the real facilitator/merchant rejection.
  return new Response(JSON.stringify(paid), {
    status: paid.ok === false ? paid.status ?? 402 : 200,
    headers: { 'content-type': 'application/json' },
  });
};

// ── Autonomous payment (no approval step) ────────────────────────────
async function executeAutonomously({ targetUrl, paymentRequired }) {
  let amountLabel = '';
  try {
    const terms = JSON.parse(atob(paymentRequired));
    amountLabel = ` ${fmtCspr(terms.amount)}`;
  } catch {
    /* label only */
  }
  showToast(`auto-paying${amountLabel}…`, 'busy');
  try {
    const result = await realFetch('/api/pay/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUrl, paymentRequired }),
    }).then((r) => r.json());

    if (!result.ok) {
      showToast(`auto-payment failed: ${paymentErrorSummary(result)}`, 'fail');
      return result;
    }
    if (result.liveAfterMotes != null) setWalletBalance(result.liveAfterMotes);
    else if (result.projectedAfterMotes != null) setWalletBalance(result.projectedAfterMotes);
    showToast(`paid${amountLabel} autonomously ✓`, 'ok');
    return result;
  } catch (err) {
    showToast(`auto-payment error: ${err.message}`, 'fail');
    return null;
  }
}

// ── Toast (non-blocking status for autonomous payments) ──────────────
let toastTimer = null;
function showToast(text, kind) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.className = `toast ${kind ?? ''} show`;
  clearTimeout(toastTimer);
  if (kind !== 'busy') toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

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
          statusEl.textContent = `Payment failed: ${paymentErrorSummary(result)}`;
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
    autoPay = wallet.autoPay !== false;
    syncAutoPayToggle();
    setWalletBalance(wallet.balanceMotes);
    document.getElementById('w-did').textContent = wallet.did;
    if (!wallet.funded) {
      document.getElementById('w-balance').classList.add('unfunded');
    }
  } catch {
    document.getElementById('w-did').textContent = 'wallet unavailable';
  }
}

function syncAutoPayToggle() {
  const box = document.getElementById('autopay-toggle');
  const label = document.getElementById('autopay-state');
  if (!box) return;
  box.checked = autoPay;
  label.textContent = autoPay ? 'autonomous' : 'ask first';
  box.onchange = () => {
    autoPay = box.checked;
    label.textContent = autoPay ? 'autonomous' : 'ask first';
    showToast(autoPay ? 'payments: autonomous (no approval)' : 'payments: approval required', 'ok');
  };
}

async function loadCatalog() {
  const el = document.getElementById('catalog');
  try {
    const { assets } = await realFetch(`${MERCHANT_URL}/api/catalog`).then((r) => r.json());
    el.innerHTML = assets
      .map(
        (a) => `<div class="card">
          <div class="c-kind">${esc(a.kind)}</div>
          <div class="c-name">${esc(a.name)}</div>
          <div class="c-id">${esc(a.id)}</div>
          <div class="c-foot">
            <span class="c-price">${fmtCspr(a.priceMotes)}</span>
            <button class="btn small pull" data-id="${esc(a.id)}">Pull data</button>
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
      meta.innerHTML = `<span class="r-fail">Payment rejected - ${esc(paymentErrorSummary(body))}</span>`;
      out.textContent = JSON.stringify(body, null, 2);
      return;
    }

    const data = body.data ?? body;
    const settlement = body.settlement;
    const receipt = body.receipt;
    let line =
      `<span class="r-ok">✓ paid &amp; settled</span> ${esc(id)}` +
      (settlement ? ` · settlement <code>${esc(settlement.settlementId)}</code>` : '') +
      (receipt?.facilitatorSignature ? ` · receipt signed` : '');
    if (body.transferExplorerUrl) {
      line += ` · <a class="r-explorer" href="${esc(body.transferExplorerUrl)}" target="_blank" rel="noreferrer">view SettlementVault transfer on cspr.live ↗</a>`;
    } else if (body.transferSkipped) {
      line += ` · <span class="r-note">on-chain transfer skipped (${esc(body.transferSkipped)})</span>`;
    } else if (body.transferError) {
      line += ` · <span class="r-note">transfer error: ${esc(body.transferError)}</span>`;
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
