from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from app.config.settings import settings
from app.models.user import find_user_by_id

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code":"invalid_token","message":"Invalid token payload"})
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code":"invalid_token","message":"Token decode error"})

    user = await find_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code":"user_not_found","message":"User not found"})
    # Do not return password hash
    user_safe = {k: v for k, v in user.items() if k != "password_hash"}
    user_safe["id"] = str(user.get("_id"))
    return user_safe


def require_role(role: str):
    async def role_checker(user = Depends(get_current_user)):
        if user.get("role") != role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code":"forbidden","message":"Insufficient role"})
        return user
    return role_checker
