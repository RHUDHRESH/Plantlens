import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

LEDGER_PATH = Path(__file__).parent / 'data' / 'audit.jsonl'


def _get_last_hash() -> str:
    if not LEDGER_PATH.exists() or LEDGER_PATH.stat().st_size == 0:
        return 'genesis'

    last_line = ''
    with open(LEDGER_PATH) as f:
        for line in f:
            stripped = line.strip()
            if stripped:
                last_line = stripped

    try:
        return json.loads(last_line).get('hash', 'genesis')
    except Exception:
        return 'genesis'


def _stable_string(body: dict) -> str:
    return json.dumps(body, sort_keys=True, separators=(',', ':'), default=str)


def append_entry(entry_type: str, body: dict) -> dict:
    prev_hash = _get_last_hash()
    canonical = _stable_string(body)
    entry_hash = hashlib.sha256((prev_hash + canonical).encode()).hexdigest()

    entry = {
        'seq': _next_seq(),
        'type': entry_type,
        'ts': datetime.now(timezone.utc).isoformat(),
        'body': body,
        'prev_hash': prev_hash,
        'hash': f'sha256:{entry_hash}',
    }

    with open(LEDGER_PATH, 'a') as f:
        f.write(json.dumps(entry, default=str) + '\n')

    return entry


def _next_seq() -> int:
    if not LEDGER_PATH.exists() or LEDGER_PATH.stat().st_size == 0:
        return 1
    with open(LEDGER_PATH) as f:
        return sum(1 for _ in f) + 1


def log_alarm(alarm) -> dict:
    return append_entry('ALARM', {
        'alarm_id': alarm.alarm_id,
        'state': alarm.state,
        'tag_id': alarm.tag_id,
        'equipment_id': alarm.equipment_id,
        'process_value': alarm.process_value,
        'ts': alarm.ts,
    })


def log_acknowledgement(situation_id: str, user_id: str, role: str, marked_as: str, note: str) -> dict:
    return append_entry('ACK', {
        'situation_id': situation_id,
        'user_id': user_id,
        'role': role,
        'marked_as': marked_as,
        'note': note,
    })


def get_recent_entries(n: int = 50) -> list[dict]:
    if not LEDGER_PATH.exists() or LEDGER_PATH.stat().st_size == 0:
        return []
    entries = []
    with open(LEDGER_PATH) as f:
        for line in f:
            try:
                entries.append(json.loads(line))
            except Exception:
                pass
    return entries[-n:]