from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.models import CategoryRecord, Complaint, Role, Team, User, new_id
from app.security import CurrentUser, Database

router = APIRouter(tags=["Categories"])


class CategoryOut(BaseModel):
    id: str
    code: str
    label: str
    description: str
    target_hours: int
    target_days: int
    icon: str
    active: bool
    photo_rule: str = "recommended"  # required, recommended, optional
    default_team_id: str | None = None
    default_team_name: str | None = None
    open_reports_count: int = 0


class CategoryCreate(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    label: str = Field(min_length=2, max_length=100)
    description: str = Field(min_length=5, max_length=1000)
    target_hours: int = Field(default=168, ge=1, le=8760)
    icon: str = Field(default="AlertTriangle", max_length=40)
    photo_rule: str = Field(default="recommended", pattern="^(required|recommended|optional)$")
    active: bool = True
    default_team_id: str | None = None


class CategoryUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, min_length=5, max_length=1000)
    target_hours: int | None = Field(default=None, ge=1, le=8760)
    icon: str | None = Field(default=None, max_length=40)
    photo_rule: str | None = Field(default=None, pattern="^(required|recommended|optional)$")
    active: bool | None = None
    default_team_id: str | None = None


def require_admin(user: CurrentUser) -> User:
    if user.role != Role.ADMIN:
        raise HTTPException(403, "Admin authorization required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


@router.get("/categories")
def list_active_categories(db: Database) -> list[CategoryOut]:
    """Public list of active categories used by reporting forms and filters."""
    categories = list(
        db.scalars(
            select(CategoryRecord)
            .where(CategoryRecord.active == True)
            .order_by(CategoryRecord.label)
        )
    )
    result = []
    for c in categories:
        team_name = None
        if c.default_team_id:
            team = db.get(Team, c.default_team_id)
            if team:
                team_name = team.name
        result.append(
            CategoryOut(
                id=c.id,
                code=c.code,
                label=c.label,
                description=c.description,
                target_hours=c.target_hours,
                target_days=max(1, round(c.target_hours / 24)),
                icon=c.icon,
                active=c.active,
                photo_rule=getattr(c, "photo_rule", "recommended") or "recommended",
                default_team_id=c.default_team_id,
                default_team_name=team_name,
                open_reports_count=0,
            )
        )
    return result


@router.get("/admin/categories")
def list_admin_categories(admin: AdminUser, db: Database) -> list[CategoryOut]:
    """Admin overview of all categories with open report counts."""
    categories = list(db.scalars(select(CategoryRecord).order_by(CategoryRecord.label)))
    result = []
    for c in categories:
        team_name = None
        if c.default_team_id:
            team = db.get(Team, c.default_team_id)
            if team:
                team_name = team.name

        open_count = db.scalar(
            select(func.count())
            .select_from(Complaint)
            .where(
                Complaint.category == c.code,
                Complaint.status.in_(["submitted", "under_review", "in_progress"]),
            )
        ) or 0

        result.append(
            CategoryOut(
                id=c.id,
                code=c.code,
                label=c.label,
                description=c.description,
                target_hours=c.target_hours,
                target_days=max(1, round(c.target_hours / 24)),
                icon=c.icon,
                active=c.active,
                photo_rule=getattr(c, "photo_rule", "recommended") or "recommended",
                default_team_id=c.default_team_id,
                default_team_name=team_name,
                open_reports_count=open_count,
            )
        )
    return result


@router.post("/admin/categories", status_code=201)
def create_category(data: CategoryCreate, admin: AdminUser, db: Database) -> CategoryOut:
    """Create a new report category."""
    clean_code = data.code.strip().lower().replace(" ", "_")
    existing = db.scalar(select(CategoryRecord).where(CategoryRecord.code == clean_code))
    if existing:
        raise HTTPException(400, f"Category code '{clean_code}' already exists")

    if data.default_team_id:
        team = db.get(Team, data.default_team_id)
        if not team:
            raise HTTPException(404, "Specified default team does not exist")

    record = CategoryRecord(
        id=new_id(),
        code=clean_code,
        label=data.label.strip(),
        description=data.description.strip(),
        target_hours=data.target_hours,
        icon=data.icon.strip(),
        photo_rule=data.photo_rule,
        active=data.active,
        default_team_id=data.default_team_id,
        created_at=datetime.now(UTC),
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    team_name = None
    if record.default_team_id:
        team = db.get(Team, record.default_team_id)
        if team:
            team_name = team.name

    return CategoryOut(
        id=record.id,
        code=record.code,
        label=record.label,
        description=record.description,
        target_hours=record.target_hours,
        target_days=max(1, round(record.target_hours / 24)),
        icon=record.icon,
        active=record.active,
        photo_rule=record.photo_rule,
        default_team_id=record.default_team_id,
        default_team_name=team_name,
        open_reports_count=0,
    )


@router.put("/admin/categories/{category_id}")
def update_category(category_id: str, data: CategoryUpdate, admin: AdminUser, db: Database) -> CategoryOut:
    """Update category properties."""
    record = db.get(CategoryRecord, category_id)
    if not record:
        raise HTTPException(404, "Category not found")

    if data.label is not None:
        record.label = data.label.strip()
    if data.description is not None:
        record.description = data.description.strip()
    if data.target_hours is not None:
        record.target_hours = data.target_hours
    if data.icon is not None:
        record.icon = data.icon.strip()
    if data.photo_rule is not None:
        record.photo_rule = data.photo_rule
    if data.active is not None:
        record.active = data.active
    if data.default_team_id is not None:
        if data.default_team_id == "":
            record.default_team_id = None
        else:
            team = db.get(Team, data.default_team_id)
            if not team:
                raise HTTPException(404, "Specified default team does not exist")
            record.default_team_id = data.default_team_id

    db.commit()
    db.refresh(record)

    team_name = None
    if record.default_team_id:
        team = db.get(Team, record.default_team_id)
        if team:
            team_name = team.name

    open_count = db.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(
            Complaint.category == record.code,
            Complaint.status.in_(["submitted", "under_review", "in_progress"]),
        )
    ) or 0

    return CategoryOut(
        id=record.id,
        code=record.code,
        label=record.label,
        description=record.description,
        target_hours=record.target_hours,
        target_days=max(1, round(record.target_hours / 24)),
        icon=record.icon,
        active=record.active,
        photo_rule=getattr(record, "photo_rule", "recommended") or "recommended",
        default_team_id=record.default_team_id,
        default_team_name=team_name,
        open_reports_count=open_count,
    )


@router.post("/admin/categories/{category_id}/toggle")
@router.patch("/admin/categories/{category_id}/toggle")
def toggle_category(category_id: str, admin: AdminUser, db: Database) -> CategoryOut:
    """Toggle a category on or off. Reports in an inactive category remain saved."""
    record = db.get(CategoryRecord, category_id)
    if not record:
        raise HTTPException(404, "Category not found")

    record.active = not record.active
    db.commit()
    db.refresh(record)

    team_name = None
    if record.default_team_id:
        team = db.get(Team, record.default_team_id)
        if team:
            team_name = team.name

    open_count = db.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(
            Complaint.category == record.code,
            Complaint.status.in_(["submitted", "under_review", "in_progress"]),
        )
    ) or 0

    return CategoryOut(
        id=record.id,
        code=record.code,
        label=record.label,
        description=record.description,
        target_hours=record.target_hours,
        target_days=max(1, round(record.target_hours / 24)),
        icon=record.icon,
        active=record.active,
        default_team_id=record.default_team_id,
        default_team_name=team_name,
        open_reports_count=open_count,
    )


@router.delete("/admin/categories/{category_id}")
def delete_category(category_id: str, admin: AdminUser, db: Database):
    """Safely delete category only if no reports exist. Otherwise instruct to toggle off."""
    record = db.get(CategoryRecord, category_id)
    if not record:
        raise HTTPException(404, "Category not found")

    reports_count = db.scalar(
        select(func.count()).select_from(Complaint).where(Complaint.category == record.code)
    ) or 0

    if reports_count > 0:
        raise HTTPException(
            400,
            f"This category has {reports_count} existing report(s). Turn it off instead to hide it from new reports while keeping past records intact.",
        )

    db.delete(record)
    db.commit()
    return {"message": "Category deleted"}
