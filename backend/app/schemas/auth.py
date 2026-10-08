from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional
from bson import ObjectId

class PyObjectId(str):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        return str(v)

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2)
    email: EmailStr
    password: str = Field(..., min_length=8)

    @validator("email")
    def normalize_email(cls, value):
        return value.strip().lower()

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @validator("email")
    def normalize_email(cls, value):
        return value.strip().lower()

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: Optional[str]
    name: str
    email: EmailStr
    role: str = "USER"

    class Config:
        orm_mode = True
