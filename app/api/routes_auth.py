"""
Auth endpoints — register / login / me. Users live only in the `users`
Mongo collection (ADM_COLLECTION_USERS); nothing about a user is ever
kept in browser localStorage except the JWT itself (needed for the
Authorization header — see adm2-ui/src/api/auth.js).
"""
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import (
    ADM_create_access_token,
    ADM_get_current_user_id,
    ADM_hash_password,
    ADM_verify_password,
)
from app.db.collections import ADM_COLLECTION_USERS
from app.db.mongo_client import ADM_get_db
from app.models.schemas import (
    ADM_TokenResponse,
    ADM_User,
    ADM_UserLoginRequest,
    ADM_UserPublic,
    ADM_UserRegisterRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def ADM__to_public(user_doc: dict) -> ADM_UserPublic:
    return ADM_UserPublic(
        user_id=user_doc["user_id"],
        username=user_doc["username"],
        email=user_doc.get("email"),
        is_admin=user_doc.get("is_admin", False),
        created_at=user_doc["created_at"],
    )


@router.post("/register", response_model=ADM_TokenResponse)
async def ADM_register(body: ADM_UserRegisterRequest):
    db = ADM_get_db()
    existing = await db[ADM_COLLECTION_USERS].find_one({"username": body.username})
    if existing:
        raise HTTPException(409, "Username already taken")

    user = ADM_User(
        username=body.username,
        email=body.email,
        hashed_password=ADM_hash_password(body.password),
    )
    await db[ADM_COLLECTION_USERS].insert_one(user.model_dump())

    token = ADM_create_access_token(user.user_id)
    return ADM_TokenResponse(access_token=token, user=ADM__to_public(user.model_dump()))


@router.post("/login", response_model=ADM_TokenResponse)
async def ADM_login(body: ADM_UserLoginRequest):
    db = ADM_get_db()
    user_doc = await db[ADM_COLLECTION_USERS].find_one({"username": body.username})
    if not user_doc or not ADM_verify_password(body.password, user_doc["hashed_password"]):
        raise HTTPException(401, "Incorrect username or password")

    token = ADM_create_access_token(user_doc["user_id"])
    return ADM_TokenResponse(access_token=token, user=ADM__to_public(user_doc))


@router.get("/me", response_model=ADM_UserPublic)
async def ADM_get_me(current_user_id: str = Depends(ADM_get_current_user_id)):
    db = ADM_get_db()
    user_doc = await db[ADM_COLLECTION_USERS].find_one({"user_id": current_user_id})
    if not user_doc:
        raise HTTPException(404, "User not found")
    return ADM__to_public(user_doc)
