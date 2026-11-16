"""User Credit Ledger Management for MotionClone.

Maintains per-user credit balance:
- In hosted mode (FRAMEFORGE_HOSTED=1): Uses Google Cloud Firestore with transactions:
  - Document path: users/{uid} (balance, tier, created_at, updated_at)
  - Subcollection: users/{uid}/ledger/{tx_id} (amount, balance_after, reason, timestamp, job_id)
  - Atomic transactions prevent race conditions during concurrent deductions.
- In local mode (FRAMEFORGE_HOSTED=0): Uses thread-locked local storage (data/credits/{uid}.json)
- Initial signup grant: CREDITS_SIGNUP_GRANT (default 0 in hosted mode, 100 in local dev).
"""
import json
import logging
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger('motionclone.credits')

_LOCAL_LOCK = threading.Lock()


class InsufficientCreditsError(ValueError):
    """Raised when a user attempts to spend more credits than their current balance."""
    pass


def is_hosted() -> bool:
    return os.getenv('FRAMEFORGE_HOSTED', '0') == '1'


def get_signup_grant() -> int:
    """Returns initial credit grant: 0 in hosted mode, 100 in local dev unless overridden by env."""
    hosted = is_hosted()
    default_grant = '0' if hosted else '100'
    return int(os.getenv('CREDITS_SIGNUP_GRANT', default_grant))


def _get_firestore_db():
    from google.cloud import firestore
    proj = os.getenv('GCP_PROJECT') or os.getenv('GOOGLE_CLOUD_PROJECT') or 'zeperai'
    return firestore.Client(project=proj)


def _get_local_file(user_id: str) -> Path:
    from . import server
    credits_dir = getattr(server, 'DATA', Path('data')) / 'credits'
    credits_dir.mkdir(parents=True, exist_ok=True)
    safe_uid = "".join(c for c in user_id if c.isalnum() or c in ('-', '_')) or 'default_user'
    return credits_dir / f"{safe_uid}.json"


def get_balance(user_id: str = "default_user") -> int:
    """Gets the available credit balance for a user."""
    grant = get_signup_grant()

    if is_hosted():
        try:
            db = _get_firestore_db()
            doc_ref = db.collection('users').document(user_id)
            snap = doc_ref.get()
            if snap.exists:
                data = snap.to_dict() or {}
                return int(data.get('balance', grant))
            return grant
        except Exception as e:
            logger.exception("Firestore get_balance failed in hosted mode")
            raise RuntimeError(f"Hosted credit balance unavailable; refusing local fallback: {e}") from e

    with _LOCAL_LOCK:
        p = _get_local_file(user_id)
        if p.is_file():
            try:
                data = json.loads(p.read_text(encoding='utf-8'))
                return int(data.get('balance', grant))
            except Exception:
                pass
        return grant


def set_balance(user_id: str, balance: int, tier: str = "free") -> None:
    """Sets a user's credit balance directly (admin recharge or testing)."""
    bal = int(balance)
    now = time.time()

    if is_hosted():
        try:
            db = _get_firestore_db()
            doc_ref = db.collection('users').document(user_id)
            doc_ref.set({
                'balance': bal,
                'tier': tier,
                'created_at': now,
                'updated_at': now
            }, merge=True)
            return
        except Exception as e:
            logger.exception("Firestore set_balance failed in hosted mode")
            raise RuntimeError(f"Hosted credit update failed; refusing local fallback: {e}") from e

    with _LOCAL_LOCK:
        p = _get_local_file(user_id)
        data = {'balance': bal, 'tier': tier, 'ledger': []}
        if p.is_file():
            try:
                data = json.loads(p.read_text(encoding='utf-8'))
            except Exception:
                pass
        data['balance'] = bal
        data['tier'] = tier
        data['updated_at'] = now
        p.write_text(json.dumps(data, indent=2), encoding='utf-8')


def check_and_deduct_credits(
    user_id: str,
    required_credits: int | float,
    description: str = "generation",
    job_id: str = ""
) -> dict[str, Any]:
    """Atomically checks balance and deducts credits.
    Uses Firestore transaction in hosted mode, thread-locked file in local mode.
    Raises InsufficientCreditsError if balance is insufficient.
    """
    amount = int(required_credits)
    if amount <= 0:
        return {'ok': True, 'credits_deducted': 0, 'balance': get_balance(user_id)}

    grant = get_signup_grant()

    if is_hosted():
        try:
            db = _get_firestore_db()
            user_ref = db.collection('users').document(user_id)
            ledger_col = user_ref.collection('ledger')
            transaction = db.transaction()

            from google.cloud import firestore

            @firestore.transactional
            def _txn_deduct(txn):
                snap = user_ref.get(transaction=txn)
                now = time.time()
                if not snap.exists:
                    curr_bal = grant
                    tier = "free"
                    created_at = now
                else:
                    d = snap.to_dict() or {}
                    curr_bal = int(d.get("balance", grant))
                    tier = d.get("tier", "free")
                    created_at = d.get("created_at", now)

                if curr_bal < amount:
                    raise InsufficientCreditsError(
                        f"Insufficient credits: {amount} required, but only {curr_bal} available."
                    )

                new_bal = curr_bal - amount
                txn.set(user_ref, {
                    'balance': new_bal,
                    'tier': tier,
                    'created_at': created_at,
                    'updated_at': now
                })

                tx_id = f"tx_{int(now * 1000)}_{uuid.uuid4().hex[:6]}"
                tx_ref = ledger_col.document(tx_id)
                txn.set(tx_ref, {
                    'amount': -amount,
                    'balance_after': new_bal,
                    'reason': description,
                    'timestamp': now,
                    'job_id': job_id
                })
                return new_bal

            final_bal = _txn_deduct(transaction)
            return {
                'ok': True,
                'credits_deducted': amount,
                'balance': final_bal
            }
        except InsufficientCreditsError:
            raise
        except Exception as e:
            logger.exception("Firestore deduction failed in hosted mode")
            raise RuntimeError(f"Hosted credit deduction failed; refusing local fallback: {e}") from e

    # Local mode (thread-locked)
    with _LOCAL_LOCK:
        p = _get_local_file(user_id)
        data = {'balance': grant, 'ledger': []}
        if p.is_file():
            try:
                data = json.loads(p.read_text(encoding='utf-8'))
            except Exception:
                pass

        current_balance = int(data.get('balance', grant))
        if current_balance < amount:
            raise InsufficientCreditsError(
                f"Insufficient credits: {amount} required, but only {current_balance} available."
            )

        new_balance = current_balance - amount
        entry = {
            'timestamp': time.time(),
            'amount': -amount,
            'balance_after': new_balance,
            'reason': description,
            'job_id': job_id
        }
        ledger = data.get('ledger', [])
        ledger.append(entry)
        data['balance'] = new_balance
        data['ledger'] = ledger

        p.write_text(json.dumps(data, indent=2), encoding='utf-8')
        return {
            'ok': True,
            'credits_deducted': amount,
            'balance': new_balance,
            'entry': entry
        }
