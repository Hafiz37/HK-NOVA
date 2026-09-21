from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter()


@router.get("/analytics")
async def analytics_page(request: Request, db: Session = Depends(get_db)):
    """Analytics and reports dashboard page."""
    return request.app.state.templates.TemplateResponse(
        request,
        "analytics/dashboard.html",
        {}
    )
