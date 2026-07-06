// Meridian API-doc page: fill the base URL, render pricing, poll live settlements.
const CSPR = (motes) => (Number(motes) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 4 });
const base = location.origin;

// Inject the live base URL into the code samples.
for (const id of ['base-a', 'base-b', 'base-c']) {
  const el = document.getElementById(id);
  if (el) el.textContent = base;
}

async function loadCatalog() {
  try {
    const { assets } = await fetch(`${base}/api/catalog`).then((r) => r.json());
    const rows = assets
      .map(
        (a) => `<tr>
          <td>${a.name}</td>
          <td>${a.kind}</td>
          <td><code>${a.id}</code></td>
          <td class="right price">${CSPR(a.priceMotes)} CSPR</td>
        </tr>`,
      )
      .join('');
    document.querySelector('#pricing-table tbody').innerHTML = rows;
  } catch {
    /* leave the loading row */
  }
}

async function loadEarnings() {
  try {
    const { count, totalMotes, settlements, explorer, merchantAccountHash } = await fetch(
      `${base}/api/earnings`,
    ).then((r) => r.json());
    document.getElementById('earn-total').textContent = `${CSPR(totalMotes)} CSPR`;
    document.getElementById('earn-count').textContent = `· ${count} settlement${count === 1 ? '' : 's'}`;

    // Link the merchant's own account so you can watch its balance grow on-chain.
    const acctEl = document.getElementById('merchant-account');
    if (acctEl && merchantAccountHash) {
      acctEl.innerHTML = `payout account <a href="${explorer}/account/${merchantAccountHash}" target="_blank" rel="noreferrer">${merchantAccountHash.slice(0, 10)}… ↗</a>`;
    }

    const list = document.getElementById('earnings-list');
    if (!settlements.length) {
      list.innerHTML = '<div class="empty">No settlements yet. Waiting for a paying agent…</div>';
      return;
    }
    list.innerHTML = settlements
      .map((s) => {
        const link = s.explorerUrl
          ? `<a href="${s.explorerUrl}" target="_blank" rel="noreferrer">view transfer on cspr.live ↗</a>`
          : `<span class="pending">settlement recorded - awaiting on-chain transfer</span>`;
        return `<div class="settlement">
          <div class="s-asset">${s.asset}</div>
          <div class="s-amount">+ ${CSPR(s.amount)} CSPR</div>
          <div class="s-did">${s.did}</div>
          <div class="s-meta">settlement ${s.settlementId} · ${s.mode} · ${new Date(s.at).toLocaleTimeString()}</div>
          <div class="s-link">${link}</div>
        </div>`;
      })
      .join('');
  } catch {
    /* ignore transient errors */
  }
}

loadCatalog();
loadEarnings();
setInterval(loadEarnings, 4000);
