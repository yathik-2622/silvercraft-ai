from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import timedelta
import jwt
from database import get_db
from models.user import UserCreate, UserResponse, UserModel, Token
from core.security import get_password_hash, verify_password, create_access_token
from config import settings

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme), db=Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    user = await db["users"].find_one({"email": email})
    if user is None:
        raise credentials_exception
    return UserModel(**user)

@router.post("/register", response_model=UserResponse, status_code=201)
async def register(user: UserCreate, db=Depends(get_db)):
    existing = await db["users"].find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = get_password_hash(user.password)
    new_user = UserModel(email=user.email, hashed_password=hashed, full_name=user.full_name)
    result = await db["users"].insert_one(new_user.model_dump(by_alias=True, exclude={"id"}))
    created = await db["users"].find_one({"_id": result.inserted_id})
    return UserResponse(id=str(created["_id"]), email=created["email"], full_name=created["full_name"])

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db=Depends(get_db)):
    user = await db["users"].find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(
        data={"sub": user["email"]},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: UserModel = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id) if current_user.id else "",
        email=current_user.email,
        full_name=current_user.full_name,
    )
