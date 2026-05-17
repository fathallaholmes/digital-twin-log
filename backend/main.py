"""
Digital Twin Maroc — Backend FastAPI v2
Authentification JWT multi-utilisateurs + partage d'état en temps réel (WebSocket).
"""
import json, uuid, asyncio
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from sqlalchemy import create_engine, Column, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# ── Config ─────────────────────────────────────────────────────────────────────
SECRET_KEY = "dt-maroc-secret-2024-change-in-prod"
ALGORITHM  = "HS256"
TOKEN_TTL  = 60 * 8   # 8 heures

DATABASE_URL = "sqlite:///./digital_twin.db"

# ── SQLAlchemy ─────────────────────────────────────────────────────────────────
engine       = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()


class UserModel(Base):
    __tablename__ = "users"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username   = Column(String, unique=True, index=True, nullable=False)
    full_name  = Column(String, nullable=True)
    hashed_pw  = Column(String, nullable=False)
    role       = Column(String, default="user")   # admin | user
    created_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Auth helpers ───────────────────────────────────────────────────────────────
pwd_ctx    = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_sch = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_pw(pw: str) -> str:
    return pwd_ctx.hash(pw)

def verify_pw(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)

def make_token(username: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=TOKEN_TTL)
    return jwt.encode({"sub": username, "exp": exp}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_sch), db: Session = Depends(get_db)):
    exc = HTTPException(status_code=401, detail="Token invalide",
                        headers={"WWW-Authenticate": "Bearer"})
    try:
        payload  = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise exc
    except JWTError:
        raise exc
    user = db.query(UserModel).filter(UserModel.username == username).first()
    if not user:
        raise exc
    return user


# ── État partagé en mémoire ────────────────────────────────────────────────────
# Survivra tant que le serveur est actif. Pour la persistance, sauvegarder en DB.
shared = {
    "transport_orders": [],   # liste de dicts (ordres de transport)
    "events":           [],   # liste de strings (journal)
    "scenarios":        [],   # [{id, name, author, created_at, data}]
}
shared_lock = asyncio.Lock()


# ── WebSocket Manager ──────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self._conns: dict[WebSocket, str] = {}   # ws → username

    async def connect(self, ws: WebSocket, username: str):
        await ws.accept()
        self._conns[ws] = username
        await self._notify_presence()

    def disconnect(self, ws: WebSocket) -> Optional[str]:
        return self._conns.pop(ws, None)

    def online(self) -> list[str]:
        return list(set(self._conns.values()))

    async def broadcast(self, data: dict, exclude: Optional[WebSocket] = None):
        dead = []
        for ws, _ in list(self._conns.items()):
            if ws is exclude:
                continue
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._conns.pop(ws, None)

    async def _notify_presence(self):
        await self.broadcast({"type": "online_users", "online": self.online()})


manager = ConnectionManager()


# ── Pydantic Schemas ───────────────────────────────────────────────────────────
class RegisterReq(BaseModel):
    username:  str
    password:  str
    full_name: Optional[str] = None

class TokenResp(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    username:     str
    full_name:    Optional[str]
    role:         str

class PushReq(BaseModel):
    type:    str    # transport_order | order_status | event_log | scenario
    payload: dict

class ScenarioReq(BaseModel):
    name: str
    data: dict      # état complet à sauvegarder


# ── FastAPI ────────────────────────────────────────────────────────────────────
app = FastAPI(title="Digital Twin Maroc API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ── Extensions IA (module isolé : backend/ai_extensions/) ─────────────────────
from ai_extensions.api_routes import router as ai_router
app.include_router(ai_router)


@app.on_event("startup")
def seed_admin():
    db = SessionLocal()
    if not db.query(UserModel).filter(UserModel.username == "admin").first():
        db.add(UserModel(
            username="admin", full_name="Administrateur",
            hashed_pw=hash_pw("admin123"), role="admin",
        ))
        db.commit()
    db.close()


# ── Auth ───────────────────────────────────────────────────────────────────────
@app.post("/auth/register", status_code=201)
def register(req: RegisterReq, db: Session = Depends(get_db)):
    if db.query(UserModel).filter(UserModel.username == req.username).first():
        raise HTTPException(400, "Nom d'utilisateur déjà pris")
    db.add(UserModel(
        username=req.username,
        full_name=req.full_name or req.username,
        hashed_pw=hash_pw(req.password),
    ))
    db.commit()
    return {"message": "Compte créé", "username": req.username}


@app.post("/auth/login", response_model=TokenResp)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.username == form.username).first()
    if not user or not verify_pw(form.password, user.hashed_pw):
        raise HTTPException(401, "Identifiants incorrects")
    return TokenResp(
        access_token=make_token(user.username),
        username=user.username,
        full_name=user.full_name,
        role=user.role,
    )


@app.get("/auth/me")
def me(user: UserModel = Depends(get_current_user)):
    return {"username": user.username, "full_name": user.full_name, "role": user.role}


@app.get("/auth/users")
def list_users(user: UserModel = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(403, "Réservé à l'admin")
    rows = db.query(UserModel).all()
    return [{"username": r.username, "full_name": r.full_name, "role": r.role,
             "created_at": r.created_at.isoformat()} for r in rows]


# ── Shared state ───────────────────────────────────────────────────────────────
@app.get("/shared/state")
async def get_state(user: UserModel = Depends(get_current_user)):
    async with shared_lock:
        return {
            "transport_orders": shared["transport_orders"],
            "events":           shared["events"],
            "scenarios":        shared["scenarios"],
            "online":           manager.online(),
        }


@app.post("/shared/push")
async def push_event(req: PushReq, user: UserModel = Depends(get_current_user)):
    """Reçoit un delta du client, l'applique à l'état partagé et le diffuse."""
    async with shared_lock:
        _apply(req.type, req.payload, user.username)

    await manager.broadcast({
        "type":    "shared_event",
        "subtype": req.type,
        "payload": req.payload,
        "author":  user.username,
    })
    return {"status": "ok"}


def _apply(etype: str, payload: dict, author: str):
    """Applique un delta à l'état partagé en mémoire."""
    if etype == "transport_order":
        # Ajoute ou met à jour un ordre
        existing = next((o for o in shared["transport_orders"] if o.get("id") == payload.get("id")), None)
        if existing is None:
            shared["transport_orders"].append({**payload, "_author": author})
        else:
            existing.update({**payload, "_author": author})

    elif etype == "order_status":
        # Mise à jour du statut d'un ordre existant
        for o in shared["transport_orders"]:
            if o.get("id") == payload.get("id"):
                o.update(payload)
                break

    elif etype == "event_log":
        msg = payload.get("message", "")
        if msg:
            shared["events"].append(f"[{author}] {msg}")
            if len(shared["events"]) > 500:
                shared["events"] = shared["events"][-500:]

    elif etype == "scenario":
        # Sauvegarde d'un scénario nommé
        scen = {
            "id":         str(uuid.uuid4()),
            "name":       payload.get("name", "Sans nom"),
            "author":     author,
            "created_at": datetime.utcnow().isoformat(),
            "data":       payload.get("data", {}),
        }
        shared["scenarios"].append(scen)

    elif etype == "scenario_delete":
        sid = payload.get("id")
        shared["scenarios"] = [s for s in shared["scenarios"] if s["id"] != sid]


# ── WebSocket ──────────────────────────────────────────────────────────────────
@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket, token: str):
    try:
        payload  = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            await ws.close(code=4001)
            return
    except JWTError:
        await ws.close(code=4001)
        return

    await manager.connect(ws, username)
    try:
        while True:
            await ws.receive_text()   # keepalive ping from client
    except WebSocketDisconnect:
        departed = manager.disconnect(ws)
        if departed:
            await manager.broadcast({"type": "user_left", "username": departed,
                                     "online": manager.online()})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
