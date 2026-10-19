import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.db import Base, get_db, make_engine
from app.main import app, auth_attempts
from app.models import Role, User


@pytest.fixture
def db_factory(tmp_path):
    postgres_url = os.getenv("GG_TEST_DATABASE_URL")
    if postgres_url:
        if not make_url(postgres_url).database.endswith("_test"):
            raise ValueError("Integration tests require a dedicated database ending in _test")
        engine = make_engine(postgres_url)
        with engine.connect() as connection:
            transaction = connection.begin()
            factory = sessionmaker(
                bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
            )
            yield factory
            transaction.rollback()
        engine.dispose()
        return
    engine = make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    yield factory
    engine.dispose()


@pytest.fixture
def client(db_factory, tmp_path, monkeypatch):
    def override_db():
        with db_factory() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    auth_attempts.clear()
    monkeypatch.setattr(get_settings(), "local_storage_path", tmp_path / "evidence")
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def account(client, db_factory):
    counter = 0

    def create(role=Role.CITIZEN, jurisdiction="demo-municipality"):
        nonlocal counter
        counter += 1
        email = f"user{counter}@example.com"
        result = client.post(
            "/api/v1/auth/register",
            json={
                "name": "Test user",
                "email": email,
                "password": "a-long-test-password",
            },
        )
        assert result.status_code == 201, result.text
        with db_factory() as db:
            user = db.get(User, result.json()["id"])
            user.role = role
            user.jurisdiction_id = jurisdiction
            db.commit()
        login = client.post(
            "/api/v1/auth/login",
            json={
                "email": email,
                "password": "a-long-test-password",
            },
        )
        assert login.status_code == 200, login.text
        return {"Authorization": f"Bearer {login.json()['access_token']}"}

    return create
