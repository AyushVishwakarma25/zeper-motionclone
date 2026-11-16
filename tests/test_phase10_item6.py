"""Phase 10 Item 6 Acceptance Tests: Real credits store, Firestore transactions, and signup grant.

Acceptance:
- Test concurrency: 5 parallel deduction requests on a user with balance 10 (each trying to deduct 4).
  Exactly 2 must succeed, 3 must return HTTP 402 with code INSUFFICIENT_CREDITS, and the final balance must be exactly 2.
- Test sign-up grant: new user in hosted mode starts with 0 (or CREDITS_SIGNUP_GRANT); in local mode starts with 100.
"""
import concurrent.futures
import json
import os
import time
import uuid
import pytest
from fastapi.testclient import TestClient

from app import credits, server


def _auth_headers():
    return {'X-Frameforge-Token': server.TOKEN}


@pytest.fixture(autouse=True)
def reset_server_state():
    server.ACTIVE['id'] = None
    yield
    server.ACTIVE['id'] = None


def test_signup_grant_local_and_hosted(tmp_path, monkeypatch):
    """Test signup grant: local defaults to 100; hosted defaults to 0 (or CREDITS_SIGNUP_GRANT)."""
    monkeypatch.setattr(server, 'DATA', tmp_path)

    # 1. Local mode (HOSTED=0, default grant 100)
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '0')
    monkeypatch.delenv('CREDITS_SIGNUP_GRANT', raising=False)
    assert credits.get_signup_grant() == 100
    u_local = f"user_local_{uuid.uuid4().hex[:6]}"
    assert credits.get_balance(u_local) == 100

    # 2. Hosted mode default (HOSTED=1, default grant 0)
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    monkeypatch.delenv('CREDITS_SIGNUP_GRANT', raising=False)
    assert credits.get_signup_grant() == 0

    # 3. Hosted mode with explicit grant env
    monkeypatch.setenv('CREDITS_SIGNUP_GRANT', '50')
    assert credits.get_signup_grant() == 50


def test_concurrency_parallel_deductions_local(tmp_path, monkeypatch):
    """5 parallel deduction requests on a user with balance 10 (each trying to deduct 4).
    Exactly 2 must succeed (200), 3 must return HTTP 402 with code INSUFFICIENT_CREDITS,
    and the final balance must be exactly 2.
    """
    monkeypatch.setattr(server, 'DATA', tmp_path)
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '0')
    monkeypatch.setattr(server, 'HOSTED', False)

    test_uid = f"user_conc_{uuid.uuid4().hex[:6]}"
    credits.set_balance(test_uid, 10)
    assert credits.get_balance(test_uid) == 10

    results = []

    def _do_deduct():
        with TestClient(server.app) as client:
            resp = client.post('/api/credits/deduct', headers=_auth_headers(), json={
                "user_id": test_uid,
                "amount": 4,
                "reason": "concurrency test"
            })
            return resp.status_code, resp.json()

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(_do_deduct) for _ in range(5)]
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    # Count successes and 402s
    successes = [r for r in results if r[0] == 200]
    failures = [r for r in results if r[0] == 402]

    assert len(successes) == 2, f"Expected 2 successes, got {len(successes)}: {results}"
    assert len(failures) == 3, f"Expected 3 failures, got {len(failures)}: {results}"

    for status_code, data in failures:
        assert data.get("detail", {}).get("code") == "INSUFFICIENT_CREDITS"

    # Verify final balance is exactly 2
    final_balance = credits.get_balance(test_uid)
    assert final_balance == 2, f"Expected final balance 2, got {final_balance}"


@pytest.mark.integration
def test_concurrency_firestore_transactions_hosted(monkeypatch):
    """Tests atomic Firestore transactions in hosted mode (FRAMEFORGE_HOSTED=1).
    Runs real concurrent transactions against Firestore collection users/{uid}.
    """
    monkeypatch.setenv('FRAMEFORGE_HOSTED', '1')
    monkeypatch.setenv('GCP_PROJECT', 'zeperai')

    test_uid = f"test_user_fs_{uuid.uuid4().hex[:8]}"

    try:
        from google.cloud import firestore
        db = firestore.Client(project='zeperai')
    except Exception as exc:
        pytest.skip(f"Firestore client unavailable: {exc}")

    user_ref = db.collection('users').document(test_uid)

    try:
        # Initialize user with balance 10
        credits.set_balance(test_uid, 10)
        assert credits.get_balance(test_uid) == 10

        success_count = 0
        insufficient_count = 0

        def _deduct_task():
            try:
                res = credits.check_and_deduct_credits(test_uid, 4, description="fs transaction test")
                return True, res
            except credits.InsufficientCreditsError:
                return False, "INSUFFICIENT_CREDITS"

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(_deduct_task) for _ in range(5)]
            for f in concurrent.futures.as_completed(futures):
                ok, val = f.result()
                if ok:
                    success_count += 1
                else:
                    insufficient_count += 1

        assert success_count == 2, f"Expected exactly 2 successes, got {success_count}"
        assert insufficient_count == 3, f"Expected exactly 3 insufficient credit errors, got {insufficient_count}"

        # Final balance on Firestore must be exactly 2
        final_bal = credits.get_balance(test_uid)
        assert final_bal == 2, f"Expected final balance 2, got {final_bal}"

    finally:
        # Clean up Firestore documents in test subcollection and user
        try:
            for doc in user_ref.collection('ledger').stream():
                doc.reference.delete()
            user_ref.delete()
        except Exception:
            pass

