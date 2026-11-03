"""Admin user management and self-service password changes."""
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.modules.audit_service import AuditService
from app.schemas.user import PasswordChange, UserCreate, UserRead, UserUpdate
from app.security import get_current_user, hash_password, require_admin, verify_password

router = APIRouter()


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return user


def _create_user(db: Session, data: UserCreate, actor: User, request: Request) -> User:
    user = User(**data.model_dump(exclude={"password"}), password_hash=hash_password(data.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Username already exists") from None
    db.refresh(user)
    AuditService.log(
        db, action="CREATE", resource_type="users", user=actor,
        resource_id=user.id, resource_name=user.username,
        new_value={"username": user.username, "role": user.role.value, "is_active": user.is_active},
        request=request,
    )
    return user


def _guard_change(db: Session, target: User, actor: User, *, role: UserRole, active: bool, deleting: bool = False) -> None:
    # Serialize admin changes, including SQLite where FOR UPDATE is ignored.
    # Raw SQL deliberately avoids the model's updated_at onupdate hook.
    db.execute(text("UPDATE users SET id = id WHERE role = 'admin'"))
    db.refresh(target)
    db.refresh(actor)
    if actor.role != UserRole.admin or not actor.is_active:
        raise HTTPException(403, "Administrator access is no longer active")
    if target.id == actor.id and (deleting or not active or role != UserRole.admin):
        raise HTTPException(400, "You cannot delete, deactivate, or demote your own account")
    removes_admin = deleting or not active or role != UserRole.admin
    if target.role == UserRole.admin and target.is_active and removes_admin:
        count = db.scalar(select(func.count()).select_from(User).where(User.role == UserRole.admin, User.is_active.is_(True)))
        if count <= 1:
            raise HTTPException(400, "Cannot remove the last active administrator")


def _update_user(db: Session, user_id: int, data: UserUpdate, actor: User, request: Request) -> User:
    user = _get_user(db, user_id)
    values = data.model_dump(exclude_unset=True)
    _guard_change(db, user, actor, role=values.get("role", user.role), active=values.get("is_active", user.is_active))
    old_value = {"role": user.role.value, "is_active": user.is_active}
    for key, value in values.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    AuditService.log(
        db, action="UPDATE", resource_type="users", user=actor,
        resource_id=user.id, resource_name=user.username, old_value=old_value,
        new_value={"role": user.role.value, "is_active": user.is_active},
        request=request,
    )
    return user


def _delete_user(db: Session, user_id: int, actor: User, request: Request) -> None:
    user = _get_user(db, user_id)
    _guard_change(db, user, actor, role=user.role, active=user.is_active, deleting=True)
    username = user.username
    db.delete(user)
    db.commit()
    AuditService.log(
        db, action="DELETE", resource_type="users", user=actor,
        resource_id=user_id, resource_name=username, request=request,
    )


def _form(request: Request, *, user: User | None = None, values: dict | None = None, error: str | None = None, status_code: int = 200) -> Response:
    return request.app.state.templates.TemplateResponse(request, "users/form.html", {
        "user": user, "values": values or {}, "roles": list(UserRole), "error": error,
    }, status_code=status_code)


def _validation_message(exc: ValidationError) -> str:
    return "; ".join(f"{error['loc'][0]}: {error['msg']}" for error in exc.errors())


@router.get("/users", dependencies=[Depends(require_admin)])
def list_users(request: Request, db: Session = Depends(get_db)) -> Response:
    return request.app.state.templates.TemplateResponse(request, "users/list.html", {
        "users": db.scalars(select(User).order_by(User.username)).all(),
        "success": request.query_params.get("success"),
    })


@router.get("/users/add", dependencies=[Depends(require_admin)])
def add_user_form(request: Request) -> Response:
    return _form(request)


@router.post("/users/add")
def add_user(request: Request, username: str = Form(...), password: str = Form(...),
             full_name: str = Form(""), role: str = Form("viewer"), is_active: bool = Form(False),
             db: Session = Depends(get_db), actor: User = Depends(require_admin)) -> Response:
    values = dict(username=username, full_name=full_name, role=role, is_active=is_active)
    try:
        _create_user(db, UserCreate(**values, password=password), actor, request)
    except (ValidationError, HTTPException) as exc:
        message = _validation_message(exc) if isinstance(exc, ValidationError) else exc.detail
        return _form(request, values=values, error=message, status_code=400)
    return RedirectResponse("/users?success=User+created", status_code=303)


@router.get("/users/{user_id}/edit", dependencies=[Depends(require_admin)])
def edit_user_form(user_id: int, request: Request, db: Session = Depends(get_db)) -> Response:
    user = _get_user(db, user_id)
    return _form(request, user=user, values=UserRead.model_validate(user).model_dump())


@router.post("/users/{user_id}/edit")
def edit_user(user_id: int, request: Request, full_name: str = Form(""),
              role: str = Form(...), is_active: bool = Form(False),
              db: Session = Depends(get_db), actor: User = Depends(require_admin)) -> Response:
    user = _get_user(db, user_id)
    values = dict(full_name=full_name, role=role, is_active=is_active)
    try:
        _update_user(db, user_id, UserUpdate(**values), actor, request)
    except (ValidationError, HTTPException) as exc:
        db.rollback()
        message = _validation_message(exc) if isinstance(exc, ValidationError) else exc.detail
        return _form(request, user=user, values=values, error=message, status_code=400 if isinstance(exc, ValidationError) else exc.status_code)
    return RedirectResponse("/users?success=User+updated", status_code=303)


@router.post("/users/{user_id}/delete")
def delete_user(user_id: int, request: Request, actor: User = Depends(require_admin), db: Session = Depends(get_db)) -> Response:
    _delete_user(db, user_id, actor, request)
    return RedirectResponse("/users?success=User+deleted", status_code=303)


@router.get("/profile", dependencies=[Depends(get_current_user)])
def profile(request: Request) -> Response:
    return request.app.state.templates.TemplateResponse(request, "users/profile.html", {})


@router.post("/profile/password")
def change_password(request: Request, current_password: str = Form(...), new_password: str = Form(...),
                    confirm_password: str = Form(...), user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)) -> Response:
    error = None
    try:
        data = PasswordChange(current_password=current_password, new_password=new_password)
        if not verify_password(data.current_password, user.password_hash):
            error = "Current password is incorrect"
        elif new_password != confirm_password:
            error = "Password confirmation does not match"
    except ValidationError as exc:
        error = _validation_message(exc)
    if error:
        return request.app.state.templates.TemplateResponse(request, "users/profile.html", {"error": error}, status_code=400)
    user.password_hash = hash_password(new_password)
    db.commit()
    AuditService.log(
        db, action="PASSWORD_CHANGE", resource_type="users", user=user,
        resource_id=user.id, resource_name=user.username, request=request,
    )
    return request.app.state.templates.TemplateResponse(request, "users/profile.html", {"success": "Password changed successfully"})


@router.get("/api/users", response_model=list[UserRead], dependencies=[Depends(require_admin)])
def api_list_users(db: Session = Depends(get_db)) -> list[User]:
    return list(db.scalars(select(User).order_by(User.username)))


@router.post("/api/users", response_model=UserRead, status_code=201)
def api_create_user(data: UserCreate, request: Request, actor: User = Depends(require_admin), db: Session = Depends(get_db)) -> User:
    return _create_user(db, data, actor, request)


@router.get("/api/users/{user_id}", response_model=UserRead, dependencies=[Depends(require_admin)])
def api_get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    return _get_user(db, user_id)


@router.put("/api/users/{user_id}", response_model=UserRead)
def api_update_user(user_id: int, data: UserUpdate, request: Request, actor: User = Depends(require_admin), db: Session = Depends(get_db)) -> User:
    return _update_user(db, user_id, data, actor, request)


@router.delete("/api/users/{user_id}", status_code=204)
def api_delete_user(user_id: int, request: Request, actor: User = Depends(require_admin), db: Session = Depends(get_db)) -> Response:
    _delete_user(db, user_id, actor, request)
    return Response(status_code=204)
