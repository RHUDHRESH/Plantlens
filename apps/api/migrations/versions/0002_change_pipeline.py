"""Change pipeline — bundle revisions and engineer-reviewed change requests.

Revision ID: 0002_change_pipeline
Revises: 0001_initial_database_layer
Create Date: 2026-09-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_change_pipeline"
down_revision: Union[str, Sequence[str], None] = "0001_initial_database_layer"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "authored_bundle_revision",
        sa.Column("rev", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("plant_id", sa.String(length=128), nullable=False),
        sa.Column("parent_rev", sa.Integer(), nullable=True),
        sa.Column("bundle_hash", sa.String(length=64), nullable=False),
        sa.Column("bundle_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("source_change_id", sa.String(length=36), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("deployed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deployed_by", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("rev"),
    )
    op.create_index("ix_authored_bundle_revision_plant_id", "authored_bundle_revision", ["plant_id"])

    op.create_table(
        "authored_change_request",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("plant_id", sa.String(length=128), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("source_ref", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_by", sa.String(length=128), nullable=False),
        sa.Column("created_by_role", sa.String(length=32), nullable=False),
        sa.Column("base_rev", sa.Integer(), nullable=False),
        sa.Column("change_set_json", sa.JSON(), nullable=False),
        sa.Column("preview_json", sa.JSON(), nullable=False),
        sa.Column("reviewed_by", sa.String(length=128), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_comment", sa.Text(), nullable=True),
        sa.Column("approve_edges", sa.Boolean(), nullable=False),
        sa.Column("result_rev", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_authored_change_request_plant_id", "authored_change_request", ["plant_id"])
    op.create_index("ix_authored_change_request_status", "authored_change_request", ["status"])


def downgrade() -> None:
    op.drop_index("ix_authored_change_request_status", table_name="authored_change_request")
    op.drop_index("ix_authored_change_request_plant_id", table_name="authored_change_request")
    op.drop_table("authored_change_request")
    op.drop_index("ix_authored_bundle_revision_plant_id", table_name="authored_bundle_revision")
    op.drop_table("authored_bundle_revision")
