"""Single-instance development container startup, with explicit migrations."""

import uvicorn
from alembic import command
from alembic.config import Config

if __name__ == "__main__":
    command.upgrade(Config("alembic.ini"), "head")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000)
