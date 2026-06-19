"""Initial database layer — authored, compiled, event, derived, audit tables.

Revision ID: 0001_initial_database_layer
Revises:
Create Date: 2026-06-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial_database_layer"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "authored_plant_bundle",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plant_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("bundle_version", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_authored_plant_bundle_plant_id", "authored_plant_bundle", ["plant_id"])

    op.create_table(
        "authored_config_document",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plant_id", sa.String(length=128), nullable=False),
        sa.Column("doc_type", sa.String(length=64), nullable=False),
        sa.Column("revision", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_authored_config_document_plant_id", "authored_config_document", ["plant_id"])

    op.create_table(
        "compiled_bundle",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plant_id", sa.String(length=128), nullable=False),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("content_hash", sa.String(length=128), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("compiled_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_compiled_bundle_plant_id", "compiled_bundle", ["plant_id"])

    op.create_table(
        "event_tag_frame",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plant_id", sa.String(length=128), nullable=False),
        sa.Column("tag_id", sa.String(length=128), nullable=False),
        sa.Column("asset_id", sa.String(length=128), nullable=False),
        sa.Column("quality", sa.String(length=32), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_event_tag_frame_plant_id", "event_tag_frame", ["plant_id"])
    op.create_index("ix_event_tag_frame_tag_id", "event_tag_frame", ["tag_id"])

    op.create_table(
        "event_alarm",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plant_id", sa.String(length=128), nullable=False),
        sa.Column("alarm_id", sa.String(length=128), nullable=False),
        sa.Column("tag_id", sa.String(length=128), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("state", sa.String(length=32), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_event_alarm_plant_id", "event_alarm", ["plant_id"])
    op.create_index("ix_event_alarm_alarm_id", "event_alarm", ["alarm_id"])

    op.create_table(
        "derived_situation_snapshot",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plant_id", sa.String(length=128), nullable=False),
        sa.Column("situation_id", sa.String(length=128), nullable=False),
        sa.Column("situation_type", sa.String(length=128), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("derived_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_derived_situation_snapshot_plant_id", "derived_situation_snapshot", ["plant_id"])
    op.create_index(
        "ix_derived_situation_snapshot_situation_id",
        "derived_situation_snapshot",
        ["situation_id"],
    )

    op.create_table(
        "derived_calm_card_snapshot",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plant_id", sa.String(length=128), nullable=False),
        sa.Column("situation_id", sa.String(length=128), nullable=False),
        sa.Column("card_id", sa.String(length=128), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("derived_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_derived_calm_card_snapshot_plant_id", "derived_calm_card_snapshot", ["plant_id"])
    op.create_index("ix_derived_calm_card_snapshot_situation_id", "derived_calm_card_snapshot", ["situation_id"])
    op.create_index("ix_derived_calm_card_snapshot_card_id", "derived_calm_card_snapshot", ["card_id"])

    op.create_table(
        "audit_record",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("audit_id", sa.String(length=64), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_type", sa.String(length=32), nullable=False),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("hash_prev", sa.String(length=128), nullable=False),
        sa.Column("hash_self", sa.String(length=128), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_record_audit_id", "audit_record", ["audit_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_audit_record_audit_id", table_name="audit_record")
    op.drop_table("audit_record")
    op.drop_index("ix_derived_calm_card_snapshot_card_id", table_name="derived_calm_card_snapshot")
    op.drop_index("ix_derived_calm_card_snapshot_situation_id", table_name="derived_calm_card_snapshot")
    op.drop_index("ix_derived_calm_card_snapshot_plant_id", table_name="derived_calm_card_snapshot")
    op.drop_table("derived_calm_card_snapshot")
    op.drop_index("ix_derived_situation_snapshot_situation_id", table_name="derived_situation_snapshot")
    op.drop_index("ix_derived_situation_snapshot_plant_id", table_name="derived_situation_snapshot")
    op.drop_table("derived_situation_snapshot")
    op.drop_index("ix_event_alarm_alarm_id", table_name="event_alarm")
    op.drop_index("ix_event_alarm_plant_id", table_name="event_alarm")
    op.drop_table("event_alarm")
    op.drop_index("ix_event_tag_frame_tag_id", table_name="event_tag_frame")
    op.drop_index("ix_event_tag_frame_plant_id", table_name="event_tag_frame")
    op.drop_table("event_tag_frame")
    op.drop_index("ix_compiled_bundle_plant_id", table_name="compiled_bundle")
    op.drop_table("compiled_bundle")
    op.drop_index("ix_authored_config_document_plant_id", table_name="authored_config_document")
    op.drop_table("authored_config_document")
    op.drop_index("ix_authored_plant_bundle_plant_id", table_name="authored_plant_bundle")
    op.drop_table("authored_plant_bundle")