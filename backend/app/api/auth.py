from fastapi import APIRouter, HTTPException, status, Depends
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserOut
from app.models.user import find_user_by_email, create_user
from app.auth.security import hash_password, verify_password, create_access_token
from app.database.mongodb import get_database
from app.auth.deps import get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

@router.post("/register", response_model=UserOut)
async def register(payload: RegisterRequest):
    existing = await find_user_by_email(payload.email)
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code":"user_exists","message":"User with this email already exists"})
    password_hash = hash_password(payload.password)
    user = await create_user(payload.name, payload.email, password_hash)
    return {"id": str(user.get("_id")), "name": user.get("name"), "email": user.get("email")}

@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    user = await find_user_by_email(payload.email)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code":"invalid_credentials","message":"Invalid email or password"})
    if not verify_password(payload.password, user.get("password_hash")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code":"invalid_credentials","message":"Invalid email or password"})
    token = create_access_token(subject=str(user.get("_id")))
    return {"access_token": token, "token_type":"bearer"}


@router.get("/me", response_model=UserOut)
async def get_me(user=Depends(get_current_user)):
    return {
        "id": user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role", "USER"),
    }
