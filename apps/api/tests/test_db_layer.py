"""Database layer tests — session lifecycle, migrations, layer separation, red-team."""

import asyncio
import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text

from app.db.models import LAYER_TABLES
from app.db.session import (
    check_database_connectivity,
    dispose_db_engine,
    get_bound_database_url,
    get_session_factory,
    init_db_engine,
    is_db_initialized,
    open_session,
    reset_db_state_for_tests,
)
from app.settings import get_settings

API_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = API_ROOT.parents[1]

FORBIDDEN_MODEL_IMPORT_PREFIXES = (
    "app.runtime",
    "app.studio",
    "app.auth",
    "app.gateway",
    "app.agents",
    "app.schemas",
)

# Guardian map: every table → architectural layer (Prompt 10 audit artifact).
TABLE_LAYER_MAP: dict[str, str] = {
    table: layer for layer, tables in LAYER_TABLES.items() for table in tables
}

FORBIDDEN_AUTHORED_COLUMNS = frozenset(
    {
        "derived_at",
        "situation_id",
        "card_id",
        "content_hash",
        "compiled_at",
        "hash_self",
        "hash_prev",
        "occurred_at",
        "state",
    }
)

APP_TABLE_NAMES = frozenset(TABLE_LAYER_MAP.keys())


@pytest.fixture
def tmp_database_url(tmp_path: Path) -> str:
    db_file = tmp_path / "test_plantlens.db"
    return f"sqlite+aiosqlite:///{db_file.as_posix()}"


@pytest.fixture(autouse=True)
def reset_db_between_tests() -> None:
    yield
    if is_db_initialized():
        # Best-effort sync reset when async dispose did not run.
        reset_db_state_for_tests()


def _run_alembic(database_url: str, *args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=API_ROOT,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def _run_alembic_upgrade(database_url: str) -> None:
    result = _run_alembic(database_url, "upgrade", "head")
    assert result.returncode == 0, result.stderr or result.stdout


@pytest.mark.asyncio
async def test_session_commits_and_closes(tmp_database_url: str):
    _run_alembic_upgrade(tmp_database_url)
    init_db_engine(tmp_database_url)
    async for session in open_session():
        await session.execute(text("SELECT 1"))
    await dispose_db_engine()


@pytest.mark.asyncio
async def test_session_rolls_back_on_exception(tmp_database_url: str):
    _run_alembic_upgrade(tmp_database_url)
    init_db_engine(tmp_database_url)
    factory = get_session_factory()

    with pytest.raises(Exception):
        async with factory() as session:
            await session.execute(text("SELECT * FROM definitely_missing_table"))
            await session.commit()

    async with factory() as session:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar_one() == 1

    await dispose_db_engine()


def test_two_lifespan_cycles_do_not_reuse_disposed_engine():
    get_settings.cache_clear()

    from app.main import create_app

    with TestClient(create_app()) as first:
        assert first.get("/readyz").json()["database"] == "ok"

    with TestClient(create_app()) as second:
        body = second.get("/readyz").json()
        assert body["database"] == "ok"
        assert body["active_plant_id"]


def test_importing_main_does_not_create_repo_root_db_file():
    script = (
        "import sys; "
        "from pathlib import Path; "
        f"root = Path({repr(str(API_ROOT))}); "
        "db = root / 'plantlens.db'; "
        "db.unlink(missing_ok=True); "
        "import app.main; "
        "print(db.exists())"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=API_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "False"


def test_db_models_do_not_import_forbidden_subsystems():
    script = (
        "import sys; "
        "import app.db.models; "
        f"prefixes = {FORBIDDEN_MODEL_IMPORT_PREFIXES!r}; "
        "mods = sorted(m for m in sys.modules if any(m.startswith(p) for p in prefixes)); "
        "print(mods)"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=API_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "[]"


def test_layer_tables_are_physically_distinct():
    all_tables = [table for tables in LAYER_TABLES.values() for table in tables]
    assert len(all_tables) == len(set(all_tables))

    prefixes = {
        "authored": "authored_",
        "compiled": "compiled_",
        "event": "event_",
        "derived": "derived_",
        "audit": "audit_",
    }
    for layer, tables in LAYER_TABLES.items():
        prefix = prefixes[layer]
        for table in tables:
            assert table.startswith(prefix), f"{table} not in {layer} namespace"

    authored = set(LAYER_TABLES["authored"])
    derived = set(LAYER_TABLES["derived"])
    assert authored.isdisjoint(derived)


def test_alembic_upgrade_head_creates_all_layers(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_file = tmp_path / "migrated.db"
    database_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr or result.stdout
    assert db_file.exists()

    init_db_engine(database_url)
    factory = get_session_factory()

    async def _inspect_tables() -> set[str]:
        async with factory() as session:
            connection = await session.connection()

            def _load_tables(sync_conn) -> set[str]:
                return set(inspect(sync_conn).get_table_names())

            tables = await connection.run_sync(_load_tables)
            return tables

    tables = asyncio.run(_inspect_tables())
    expected = {table for group in LAYER_TABLES.values() for table in group}
    assert expected.issubset(tables)
    asyncio.run(dispose_db_engine())


@pytest.mark.asyncio
async def test_check_database_connectivity_without_init_returns_false():
    reset_db_state_for_tests()
    assert await check_database_connectivity() is False


def test_no_engine_created_at_session_module_import():
    import app.db.session as session_module

    assert session_module._engine is None
    assert session_module._session_factory is None


def test_init_binds_database_url_without_leaking_in_readyz(client: TestClient):
    body = client.get("/readyz").json()
    assert body["database"] == "ok"
    assert "sqlite" not in str(body).lower()
    assert "database_url" not in body
    assert get_bound_database_url() is not None


# --- Prompt 10 guardian: layer semantics ---


def test_table_layer_map_is_complete():
    assert len(TABLE_LAYER_MAP) == 8
    assert set(TABLE_LAYER_MAP) == APP_TABLE_NAMES
    assert TABLE_LAYER_MAP["authored_plant_bundle"] == "authored"
    assert TABLE_LAYER_MAP["compiled_bundle"] == "compiled"
    assert TABLE_LAYER_MAP["event_tag_frame"] == "event"
    assert TABLE_LAYER_MAP["derived_situation_snapshot"] == "derived"
    assert TABLE_LAYER_MAP["audit_record"] == "audit"


def test_authored_models_exclude_runtime_and_event_fields():
    from app.db.models.authored import AuthoredConfigDocument, AuthoredPlantBundle

    for model in (AuthoredPlantBundle, AuthoredConfigDocument):
        columns = {column.key for column in model.__table__.columns}
        assert columns.isdisjoint(FORBIDDEN_AUTHORED_COLUMNS), model.__tablename__


def test_event_models_are_append_only_without_updated_at():
    from app.db.models.event import EventAlarm, EventTagFrame

    for model in (EventTagFrame, EventAlarm):
        columns = {column.key for column in model.__table__.columns}
        assert "updated_at" not in columns
        assert "created_at" in columns


def test_compiled_and_authored_tables_are_disjoint():
    assert set(LAYER_TABLES["compiled"]).isdisjoint(set(LAYER_TABLES["authored"]))


def test_audit_table_isolated_from_business_layers():
    audit_tables = set(LAYER_TABLES["audit"])
    business = set().union(
        LAYER_TABLES["authored"],
        LAYER_TABLES["compiled"],
        LAYER_TABLES["event"],
        LAYER_TABLES["derived"],
    )
    assert audit_tables.isdisjoint(business)


def test_migration_metadata_matches_layer_tables():
    from app.db.base import Base
    from app.db.models import (  # noqa: F401 — register mappers
        AuditRecordRow,
        AuthoredConfigDocument,
        AuthoredPlantBundle,
        CompiledBundle,
        DerivedCalmCardSnapshot,
        DerivedSituationSnapshot,
        EventAlarm,
        EventTagFrame,
    )

    orm_tables = {table.name for table in Base.metadata.sorted_tables}
    assert APP_TABLE_NAMES == orm_tables


def test_migration_file_has_no_hardcoded_credentials_or_absolute_paths():
    migration = API_ROOT / "migrations" / "versions" / "0001_initial_database_layer.py"
    content = migration.read_text(encoding="utf-8").lower()
    assert "password" not in content
    assert "postgresql://" not in content
    assert "c:\\users" not in content
    assert "c:/users" not in content


def test_alembic_downgrade_removes_all_layer_tables(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    db_file = tmp_path / "downgrade.db"
    database_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()

    upgrade = _run_alembic(database_url, "upgrade", "head")
    assert upgrade.returncode == 0, upgrade.stderr or upgrade.stdout

    downgrade = _run_alembic(database_url, "downgrade", "base")
    assert downgrade.returncode == 0, downgrade.stderr or downgrade.stdout

    init_db_engine(database_url)
    factory = get_session_factory()

    async def _tables() -> set[str]:
        async with factory() as session:
            connection = await session.connection()

            def _load(sync_conn) -> set[str]:
                return set(inspect(sync_conn).get_table_names())

            return await connection.run_sync(_load)

    tables = asyncio.run(_tables())
    assert APP_TABLE_NAMES.isdisjoint(tables)
    asyncio.run(dispose_db_engine())


def test_fastapi_startup_does_not_create_schema_without_migration(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    get_settings.cache_clear()

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        assert test_client.get("/healthz").json()["status"] == "ok"
        factory = get_session_factory()

        async def _tables() -> set[str]:
            async with factory() as session:
                connection = await session.connection()

                def _load(sync_conn) -> set[str]:
                    return set(inspect(sync_conn).get_table_names())

                return await connection.run_sync(_load)

        tables = asyncio.run(_tables())

    assert APP_TABLE_NAMES.isdisjoint(tables)


@pytest.mark.asyncio
async def test_get_db_dependency_closes_session(tmp_database_url: str):
    _run_alembic_upgrade(tmp_database_url)
    init_db_engine(tmp_database_url)

    from app.dependencies import get_db

    generator = get_db()
    session = await generator.__anext__()
    await session.execute(text("SELECT 1"))
    with pytest.raises(StopAsyncIteration):
        await generator.__anext__()

    await dispose_db_engine()


def test_db_session_module_does_not_import_forbidden_subsystems():
    script = (
        "import sys; "
        "import app.db.session; "
        "import app.db.base; "
        f"prefixes = {FORBIDDEN_MODEL_IMPORT_PREFIXES!r}; "
        "mods = sorted(m for m in sys.modules if any(m.startswith(p) for p in prefixes)); "
        "print(mods)"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=API_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "[]"


def test_healthz_unchanged_by_db_layer(client: TestClient):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "plantlens-api"}