import base64
import json
from pathlib import Path

import pytest

from fourotwo import (
    canonical_payment_message,
    derive_did,
    encode_envelope,
    keypair_from_private_key,
    sign_payment,
)

VECTORS = json.loads((Path(__file__).parent / "vectors.json").read_text("utf-8"))


def test_keypair_matches_ts():
    kp = keypair_from_private_key(VECTORS["seed"])
    assert kp.public_key_hex == VECTORS["publicKeyHex"]
    assert kp.tagged_public_key_hex == VECTORS["taggedPublicKeyHex"]
    assert kp.did == VECTORS["did"]


def test_did_derivation_matches_ts():
    assert derive_did("casper", VECTORS["taggedPublicKeyHex"]) == VECTORS["didFromTaggedKey"]


def test_canonical_message_matches_ts():
    assert canonical_payment_message(VECTORS["paymentRequired"]) == VECTORS["canonicalMessage"]


def test_envelope_encoding_matches_ts():
    assert encode_envelope(VECTORS["paymentRequired"]) == VECTORS["encodedEnvelope"]


def test_signature_matches_ts():
    signed = sign_payment(
        VECTORS["paymentRequired"],
        private_key_hex=VECTORS["seed"],
        payer_public_key_hex=VECTORS["taggedPublicKeyHex"],
    )
    assert signed.payment_signature == VECTORS["paymentSignature"]
    envelope = json.loads(base64.b64decode(signed.payment_signature))
    assert envelope["payer"] == VECTORS["taggedPublicKeyHex"]
    assert len(envelope["signature"]) == 128  # 64-byte ed25519 signature, hex


def test_expired_payment_rejected():
    from fourotwo import PaymentExpiredError

    expired = {**VECTORS["paymentRequired"], "expiry": 1}
    with pytest.raises(PaymentExpiredError):
        sign_payment(expired, private_key_hex=VECTORS["seed"], payer_public_key_hex="01ab")
