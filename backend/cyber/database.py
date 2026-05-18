"""Engine + session factory dédiés à la base cyber.db (isolée des users)."""

from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

_DB_PATH = Path(__file__).parent.parent / "cyber.db"
DATABASE_URL = f"sqlite:///{_DB_PATH}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dépendance FastAPI : fournit une session DB pour chaque requête."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Crée toutes les tables (idempotent)."""
    # Import explicite pour que Base.metadata connaisse les modèles
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
