import os

import pytest
from sqlalchemy import text

from tests.test_workflow import submit


@pytest.mark.skipif(
    not os.getenv("GG_TEST_DATABASE_URL"),
    reason="Dedicated PostgreSQL test database not configured",
)
def test_migrated_postgis_location_is_correct(client, account, db_factory):
    record = submit(client, account())
    with db_factory() as db:
        row = db.execute(
            text("""
            SELECT ST_X(location::geometry), ST_Y(location::geometry),
                ST_DWithin(location, ST_SetSRID(ST_MakePoint(76.9,9.85),4326)::geography, 1)
            FROM complaints WHERE tracking_id=:tracking
        """),
            {"tracking": record["tracking_id"]},
        ).one()
        assert row[0] == 76.9 and row[1] == 9.85 and row[2] is True
