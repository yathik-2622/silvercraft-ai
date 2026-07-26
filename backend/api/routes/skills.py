from fastapi import APIRouter, Depends, HTTPException
from typing import List
from bson import ObjectId
from database import get_db
from models.user import UserModel
from models.skill import SkillModel, SkillCreate, SkillResponse
from api.routes.auth import get_current_user

router = APIRouter()

def _to_response(s: dict) -> SkillResponse:
    s = dict(s)
    s["id"] = str(s.pop("_id"))
    return SkillResponse(**s)

@router.post("/", response_model=SkillResponse, status_code=201)
async def create_skill(skill: SkillCreate, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    doc = SkillModel(name=skill.name, description=skill.description, content=skill.content, created_by=str(current_user.id))
    result = await db["skills"].insert_one(doc.model_dump(by_alias=True, exclude={"id"}))
    created = await db["skills"].find_one({"_id": result.inserted_id})
    return _to_response(created)

@router.get("/", response_model=List[SkillResponse])
async def list_skills(current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    user_id = str(current_user.id)
    cursor = db["skills"].find({"$or": [{"created_by": None}, {"created_by": user_id}]})
    skills = await cursor.to_list(length=200)
    return [_to_response(s) for s in skills]

@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(skill_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(skill_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid skill ID")
    skill = await db["skills"].find_one({"_id": oid})
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return _to_response(skill)

@router.delete("/{skill_id}", status_code=204)
async def delete_skill(skill_id: str, current_user: UserModel = Depends(get_current_user), db=Depends(get_db)):
    try:
        oid = ObjectId(skill_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid skill ID")
    skill = await db["skills"].find_one({"_id": oid})
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.get("created_by") != str(current_user.id):
        raise HTTPException(status_code=403, detail="Cannot delete a skill you did not create")
    await db["skills"].delete_one({"_id": oid})
