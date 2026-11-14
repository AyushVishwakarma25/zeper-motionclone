"""User Credit Ledger Management for MotionClone.

Maintains per-user credit balance:
- Local storage: DATA / 'credits' / f'{safe_user_id}.json'
- Provides get_balance, check_and_deduct_credits, set_balance, and ledger history.
"""
import json
import logging
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger('motionclone.credits')

DEFAULT_INITIAL_BALANCE = 100.0


def _get_credit_file(user_id: str) -> Path:
    from . import server
    credits_dir = getattr(server, 'DATA', Path('data')) / 'credits'
    credits_dir.mkdir(parents=True, exist_ok=True)
    safe_uid = "".join(c for c in user_id if c.isalnum() or c in ('-', '_')) or 'default_user'
    return credits_dir / f"{safe_uid}.json"


def get_balance(user_id: str = "default_user") -> float:
    """Gets the available credit balance for a user."""
    p = _get_credit_file(user_id)
    if p.is_file():
        try:
            data = json.loads(p.read_text(encoding='utf-8'))
            return float(data.get('balance', DEFAULT_INITIAL_BALANCE))
        except Exception:
            pass
    return DEFAULT_INITIAL_BALANCE


def set_balance(user_id: str, balance: float) -> None:
    """Sets a user's credit balance directly (e.g. for testing or credit recharge)."""
    p = _get_credit_file(user_id)
    data = {'balance': float(balance), 'ledger': []}
    if p.is_file():
        try:
            data = json.loads(p.read_text(encoding='utf-8'))
        except Exception:
            pass
    data['balance'] = float(balance)
    p.write_text(json.dumps(data, indent=2), encoding='utf-8')


def check_and_deduct_credits(
    user_id: str,
    required_credits: int | float,
    description: str = "",
    job_id: str = ""
) -> dict[str, Any]:
    """Checks user balance; if sufficient, deducts credits and writes ledger entry.
    Otherwise raises ValueError indicating insufficient balance.
    """
    p = _get_credit_file(user_id)
    data = {'balance': DEFAULT_INITIAL_BALANCE, 'ledger': []}
    if p.is_file():
        try:
            data = json.loads(p.read_text(encoding='utf-8'))
        except Exception:
            pass

    current_balance = float(data.get('balance', DEFAULT_INITIAL_BALANCE))
    req = float(required_credits)
    if current_balance < req:
        raise ValueError(
            f"Insufficient credits: {req} required, but only {current_balance} available."
        )

    new_balance = round(current_balance - req, 2)
    entry = {
        'timestamp': time.time(),
        'amount': -req,
        'new_balance': new_balance,
        'description': description,
        'job_id': job_id
    }
    ledger = data.get('ledger', [])
    ledger.append(entry)
    data['balance'] = new_balance
    data['ledger'] = ledger

    p.write_text(json.dumps(data, indent=2), encoding='utf-8')
    return {
        'ok': True,
        'credits_deducted': req,
        'balance': new_balance,
        'entry': entry
    }

