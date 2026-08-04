"""
Auth core — password hashing (passlib/bcrypt) + JWT issue/verify
(python-jose). One dependency, `ADM_get_current_user_id`, is what every
protected route imports; nothing else in the codebase touches a JWT
directly. Users live only in the `users` Mongo collection — this file
never caches a user in memory, so DB stays the single source of truth.
"""
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import ADM_get_settings
from app.db.collections import ADM_COLLECTION_USERS
from app.db.mongo_client import ADM_get_db

ADM_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# tokenUrl is just for the /docs "Authorize" button's form target —
# actual login is a normal JSON POST at /auth/login.
ADM_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def ADM_hash_password(plain_password: str) -> str:
    return ADM_pwd_context.hash(plain_password)


def ADM_verify_password(plain_password: str, hashed_password: str) -> bool:
    return ADM_pwd_context.verify(plain_password, hashed_password)


def ADM_create_access_token(user_id: str) -> str:
    settings = ADM_get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def ADM_decode_access_token(token: str) -> str:
    """Returns the user_id (`sub` claim). Raises HTTPException(401) on any
    invalid/expired/missing token."""
    settings = ADM_get_settings()
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")
    return user_id


async def ADM_get_current_user_id(token: str | None = Depends(ADM_oauth2_scheme)) -> str:
    """Drop this in as a route dependency: `current_user_id: str =
    Depends(ADM_get_current_user_id)`. Confirms the user still exists in
    the `users` collection on every call — DB stays the source of truth,
    a deleted/deactivated user is rejected immediately, not just once at
    login time."""
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    user_id = ADM_decode_access_token(token)

    db = ADM_get_db()
    user_doc = await db[ADM_COLLECTION_USERS].find_one({"user_id": user_id}, {"_id": 0, "user_id": 1})
    if not user_doc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return user_id


def ADM_is_admin_username(username: str) -> bool:
    """Single source of truth for admin status — a deployment-level trust
    list (settings.ADMIN_USERNAMES), not a stored Mongo field. Re-reads
    settings on every call (cached via ADM_get_settings's lru_cache, so
    this is cheap), same "never cached per-request" principle the rest of
    auth already follows — just the source of truth moved from a `users`
    document field to env config."""
    return username in ADM_get_settings().ADMIN_USERNAMES_LIST


async def ADM_require_admin(current_user_id: str = Depends(ADM_get_current_user_id)) -> str:
    """Stricter dependency for admin-only routes (KB/skill ingestion).
    Checked fresh on every call against ADMIN_USERNAMES — there is no API
    path and no script that grants admin; it's granted only by editing
    .env and restarting the process."""
    db = ADM_get_db()
    user_doc = await db[ADM_COLLECTION_USERS].find_one({"user_id": current_user_id}, {"_id": 0, "username": 1})
    if not user_doc or not ADM_is_admin_username(user_doc["username"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin privileges required")
    return current_user_id
