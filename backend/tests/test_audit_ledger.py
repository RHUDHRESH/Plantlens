import json
from pathlib import Path

import pytest

import audit_ledger
from audit_ledger import append_entry, get_recent_entries


@pytest.fixture
def temp_ledger(tmp_path, monkeypatch):
    ledger = tmp_path / 'audit.jsonl'
    monkeypatch.setattr(audit_ledger, 'LEDGER_PATH', ledger)
    return ledger


def test_hash_chain_links_entries(temp_ledger):
    first = append_entry('TEST', {'a': 1})
    second = append_entry('TEST', {'b': 2})

    assert first['prev_hash'] == 'genesis'
    assert second['prev_hash'] == first['hash']
    assert second['hash'].startswith('sha256:')

    lines = temp_ledger.read_text().strip().split('\n')
    assert len(lines) == 2
    assert json.loads(lines[1])['prev_hash'] == first['hash']


def test_get_recent_entries(temp_ledger):
    for i in range(3):
        append_entry('TEST', {'i': i})
    entries = get_recent_entries(2)
    assert len(entries) == 2
    assert entries[-1]['body']['i'] == 2