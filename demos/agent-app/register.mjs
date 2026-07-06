/**
 * Self-register the agent with the KYX registry so it appears on the /agents
 * page and gets an operator-linked, trust-scored identity.
 *
 * Note on DIDs: a fourotwo DID is *derived* from the keypair (deterministic, so
 * the SDK can compute it offline) - but derivation is not registration.
 * Registration links that DID to a verified operator and enables trust scoring +
 * on-chain presence. This runs the operator magic-link + /agents/register flow.
 */
export async function registerWithKyx({ kyxUrl, email, agentName, publicKeyHex, network = 'casper' }) {
  const post = (path, body) =>
    fetch(`${kyxUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  // 1) request an operator magic link (dev returns the token directly)
  const verifyReq = await post('/operators/verify-request', { email });
  const verifyBody = await verifyReq.json().catch(() => ({}));
  const token = verifyBody.dev_token;
  if (!token) throw new Error(`verify-request failed: ${verifyReq.status} ${JSON.stringify(verifyBody)}`);

  // 2) confirm the email
  await fetch(`${kyxUrl}/operators/verify/${token}`);

  // 3) register the agent (public_key must be the tagged key so the derived DID matches)
  const regRes = await post('/agents/register', {
    operator_email: email,
    agent_name: agentName,
    public_key: publicKeyHex,
    network,
  });
  const regBody = await regRes.json().catch(() => ({}));

  if (regRes.status === 409) {
    return { status: 'already_registered', detail: regBody };
  }
  if (!regRes.ok) {
    throw new Error(`register failed: ${regRes.status} ${JSON.stringify(regBody)}`);
  }
  return { status: 'registered', agent: regBody.agent, trust: regBody.trust };
}
