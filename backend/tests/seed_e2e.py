"""Fixed credentials for disposable end-to-end test databases ONLY."""

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.config import get_settings
from app.db import SessionLocal
from app.models import Role, User
from app.security import password_hasher


def main():
    url = make_url(get_settings().database_url)
    db_name = url.database or ""
    if not (db_name.endswith("_test") or Path(db_name).stem.endswith("_test")):
        raise RuntimeError("Refusing test accounts outside a dedicated *_test database")
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == "gro.e2e@example.com")):
            return
        db.add(
            User(
                email="gro.e2e@example.com",
                name="E2E officer",
                role=Role.GRO,
                jurisdiction_id=get_settings().jurisdiction_id,
                password_hash=password_hasher.hash("e2e-local-only-password"),
            )
        )
        db.commit()


if __name__ == "__main__":
    main()
