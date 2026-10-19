"""Local account provisioning; never expose this as a public API."""

import argparse
from getpass import getpass

from pydantic import EmailStr, TypeAdapter
from sqlalchemy import select

from app.config import get_settings
from app.db import SessionLocal
from app.models import Role, User
from app.security import password_hasher


def main():
    parser = argparse.ArgumentParser(description="Create one local GrievanceGrid account")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--role", choices=list(Role), required=True)
    parser.add_argument("--jurisdiction", default=get_settings().jurisdiction_id)
    args = parser.parse_args()
    email = str(TypeAdapter(EmailStr).validate_python(args.email)).lower()
    password = getpass("New password (12+ characters): ")
    if len(password) < 12 or len(password) > 128:
        parser.error("Password must have 12–128 characters")
    if password != getpass("Confirm password: "):
        parser.error("Passwords do not match")
    if not args.name.strip() or not args.jurisdiction.strip():
        parser.error("Name and jurisdiction must not be empty")
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.email == email)):
            parser.error("Account already exists; no changes made")
        db.add(
            User(
                email=email,
                name=args.name.strip(),
                role=args.role,
                jurisdiction_id=args.jurisdiction.strip(),
                password_hash=password_hasher.hash(password),
            )
        )
        db.commit()
    print(f"Created {args.role} account in {args.jurisdiction}. No default password was saved.")


if __name__ == "__main__":
    main()
