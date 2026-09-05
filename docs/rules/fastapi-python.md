# FastAPI + Python Coding Standards

> Injected as system-prompt rules for AI coding agents working on FastAPI projects.

---

## 1. Prime Directive

**Correctness > Consistency within module > Consistency within project > This guide.**

When rules conflict with correctness, correctness wins. When existing module style differs from this guide but is internally consistent, match the module. Never cargo-cult a pattern that makes the code worse.

---

## 2. Toolchain

| Tool | Purpose | Config |
|------|---------|--------|
| **Ruff** | Linter + formatter | `line-length = 88`, `target-version = "py312"` |
| **mypy** | Type checker | `strict = true` |
| **pytest** | Test runner | `asyncio_mode = "auto"` via pytest-asyncio |
| **pre-commit** | Git hooks | Runs ruff, mypy, tests on commit |

- 4 spaces, no tabs. No trailing whitespace.
- Ruff replaces Black, isort, flake8, and pyupgrade. Do not add those separately.
- All CI must pass `ruff check .`, `ruff format --check .`, and `mypy .` with zero errors.

---

## 3. Architecture — Layered Separation

```
Routes (API layer)  →  Services (business logic)  →  Repositories (data access)  →  Models (SQLAlchemy / domain)
```

**Rules:**
- **Routes** receive HTTP requests, validate via Pydantic, call services, return Pydantic responses. No business logic. No direct DB access.
- **Services** orchestrate business logic. Raise domain exceptions, never `HTTPException`. Services are unaware of HTTP.
- **Repositories** encapsulate all database queries. Return domain models or dataclasses, never raw rows.
- **Models** define SQLAlchemy ORM models and domain entities. No import of FastAPI or Pydantic here.

```python
# ✅ Correct: route delegates to service
@router.post("/users", status_code=201, response_model=UserOut)
async def create_user(body: UserCreate, svc: UserServiceDep) -> UserOut:
    user = await svc.create(body)
    return UserOut.model_validate(user)

# ❌ Wrong: business logic in route
@router.post("/users")
async def create_user(body: UserCreate, db: DbSession) -> dict:
    if await db.execute(select(User).where(User.email == body.email)):
        raise HTTPException(409, "exists")
    user = User(**body.model_dump())
    db.add(user)
    await db.commit()
    return {"id": user.id}
```

---

## 4. FastAPI Patterns

### App Factory

```python
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup: init DB pool, caches, etc.
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown: dispose connections
    await db_engine.dispose()

def create_app() -> FastAPI:
    app = FastAPI(title="MyService", lifespan=lifespan)
    app.include_router(users.router, prefix="/api/v1")
    app.add_exception_handler(AppError, app_error_handler)
    return app
```

Never use deprecated `@app.on_event("startup")` / `@app.on_event("shutdown")`. Use the lifespan context manager.

### Annotated Dependencies

```python
from typing import Annotated
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db() -> AsyncIterator[AsyncSession]:
    async with async_session_maker() as session:
        yield session

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
UserServiceDep = Annotated[UserService, Depends(get_user_service)]
```

Define `Annotated` aliases in a `deps.py` module. Use them in route signatures — never inline `Depends()` calls in function params.

### RORO — Receive Object, Return Object

Every route receives a Pydantic model (or path/query params) and returns a Pydantic model. Never return raw `dict`. Never accept raw `dict`.

```python
# ✅
@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(user_id: UUID, svc: UserServiceDep) -> UserOut: ...

# ❌
@router.get("/users/{user_id}")
async def get_user(user_id: str, db: DbSession) -> dict: ...
```

### Settings

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="APP_")

    database_url: str
    secret_key: str
    debug: bool = False
    allowed_origins: list[str] = ["http://localhost:3000"]

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

---

## 5. Pydantic v2

### ConfigDict, Not Inner `class Config`

```python
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, strict=True)

    id: UUID
    email: str
    created_at: datetime
```

### Schema Splits

Separate schemas by purpose. Never reuse a creation schema as a response schema.

```python
class UserCreate(BaseModel):
    email: EmailStr
    password: str  # never in response

class UserUpdate(BaseModel):
    email: EmailStr | None = None
    display_name: str | None = None

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    display_name: str | None
    created_at: datetime
```

### Validators

```python
class UserCreate(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 10:
            msg = "Password must be at least 10 characters"
            raise ValueError(msg)
        return v

    @model_validator(mode="after")
    def check_consistency(self) -> Self:
        # cross-field validation here
        return self
```

---

## 6. Error Handling

### Domain Exception Hierarchy

```python
class AppError(Exception):
    """Base for all domain exceptions."""

    def __init__(
        self,
        message: str,
        code: str = "APP_ERROR",
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(message)

class NotFoundError(AppError):
    def __init__(self, resource: str, id: str | UUID) -> None:
        super().__init__(f"{resource} {id} not found", code="NOT_FOUND", details={"resource": resource, "id": str(id)})

class ValidationError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="VALIDATION_ERROR", details=details)

class AuthenticationError(AppError):
    def __init__(self, message: str = "Invalid credentials") -> None:
        super().__init__(message, code="AUTHENTICATION_ERROR")

class AuthorizationError(AppError):
    def __init__(self, message: str = "Insufficient permissions") -> None:
        super().__init__(message, code="AUTHORIZATION_ERROR")

class ConflictError(AppError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message, code="CONFLICT", details=details)
```

### Global Exception Handler — ONE Place

```python
from fastapi import Request
from fastapi.responses import JSONResponse

_STATUS_MAP: dict[type[AppError], int] = {
    NotFoundError: 404,
    ValidationError: 422,
    AuthenticationError: 401,
    AuthorizationError: 403,
    ConflictError: 409,
}

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    status = _STATUS_MAP.get(type(exc), 500)
    return JSONResponse(
        status_code=status,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )
```

Register via `app.add_exception_handler(AppError, app_error_handler)` in the app factory. Services never import `HTTPException`.

### Exception Chaining — Always

```python
# ✅
try:
    result = await db.execute(query)
except IntegrityError as exc:
    raise ConflictError("Email already registered") from exc

# ❌ Swallows traceback
except IntegrityError:
    raise ConflictError("Email already registered")
```

---

## 7. Type Annotations

```python
from __future__ import annotations  # top of EVERY file
```

- Annotate **all** function signatures: parameters and return types.
- Annotate **all** class attributes and module-level variables.
- Use `X | None` not `Optional[X]`. Use `list[int]` not `List[int]`.
- `Any` requires a `# noqa` comment explaining why. Prefer `object` for truly unknown.
- Use `TypeVar` / `ParamSpec` / `Protocol` for generic patterns.
- Collections: use `collections.abc` types (`Sequence`, `Mapping`, `Iterable`) for inputs; concrete types (`list`, `dict`) only for outputs.

```python
from collections.abc import Sequence

# ✅ Accept broad, return narrow
async def get_users(ids: Sequence[UUID]) -> list[UserOut]: ...

# ❌ Too restrictive for input
async def get_users(ids: list[UUID]) -> list[UserOut]: ...
```

---

## 8. Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Functions / methods | `snake_case` | `get_user_by_email` |
| Variables | `snake_case` | `user_count` |
| Classes | `PascalCase` | `UserService` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Modules / packages | `snake_case` | `user_service.py` |
| Enum members | `UPPER_SNAKE_CASE` | `Status.ACTIVE` |
| Type aliases | `PascalCase` | `DbSession` |
| Private | `_leading_underscore` | `_hash_password` |
| Dunder | Only for Python protocols | `__init__`, `__repr__` |

**Never shadow builtins:** `list`, `dict`, `type`, `id`, `input`, `filter`, `map`, `hash`, `set`, `str`, `int`, `format`, `object`, `range`, `next`, `iter`, `open`, `all`, `any`, `sum`, `min`, `max`.

Use domain-specific names instead: `user_id` not `id`, `items` not `list`, `user_type` not `type`.

**Enums for domain states:**

```python
import enum

class OrderStatus(enum.StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    SHIPPED = "shipped"
    CANCELLED = "cancelled"
```

---

## 9. Async

- **All I/O is async.** Use `async def` for routes, services, and repositories.
- **httpx** for outbound HTTP, never `requests`.
- **SQLAlchemy async** with `AsyncSession`, `create_async_engine`.
- **Never call blocking I/O in async context** without `asyncio.to_thread()`.
- File I/O: use `aiofiles` or `asyncio.to_thread(Path.read_text, ...)`.

```python
# ✅ Async HTTP client
async def fetch_external(url: str) -> ExternalData:
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=10.0)
        resp.raise_for_status()
        return ExternalData.model_validate(resp.json())

# ❌ Blocks the event loop
def fetch_external(url: str) -> dict:
    return requests.get(url).json()
```

---

## 10. Testing

### Setup

```toml
# pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

### Naming

```
test_{method_or_action}_{scenario}_{expected_outcome}
```

```python
async def test_create_user_duplicate_email_raises_conflict() -> None: ...
async def test_get_user_nonexistent_id_returns_404() -> None: ...
async def test_login_valid_credentials_returns_token() -> None: ...
```

### AAA Pattern — Arrange, Act, Assert

```python
async def test_create_user_success(
    client: AsyncClient,
    user_factory: UserFactory,
) -> None:
    # Arrange
    payload = {"email": "new@example.com", "password": "strongpass123"}

    # Act
    response = await client.post("/api/v1/users", json=payload)

    # Assert
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["email"] == "new@example.com"
    assert "password" not in data
```

### Factories — Never Hardcode

```python
import factory
from factory.alchemy import SQLAlchemyModelFactory

class UserFactory(SQLAlchemyModelFactory):
    class Meta:
        model = User
        sqlalchemy_session_persistence = "commit"

    email = factory.Sequence(lambda n: f"user{n}@test.com")
    display_name = factory.Faker("name")
    hashed_password = factory.LazyFunction(lambda: hash_password("testpass123"))
```

### Fixtures

```python
@pytest.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with test_async_session() as session:
        yield session
        await session.rollback()

@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
```

### Mock at Boundaries

```python
# ✅ Mock the external boundary
async def test_send_welcome_email(mocker: MockerFixture) -> None:
    mock_send = mocker.patch("app.services.email.smtp_client.send")
    await user_service.create(UserCreate(email="a@b.com", password="strongpass123"))
    mock_send.assert_called_once()

# ❌ Mock internals
async def test_create_user(mocker: MockerFixture) -> None:
    mocker.patch("app.services.user.UserService._validate_email")  # don't mock private methods
```

### Datetime Tests

Use `freezegun` or `time-machine`:

```python
from freezegun import freeze_time

@freeze_time("2024-01-15T12:00:00Z")
async def test_token_expiry() -> None:
    token = create_access_token(user_id=uuid4())
    payload = decode_token(token)
    assert payload["exp"] == 1705320600  # 12:30 UTC
```

### Coverage Requirements

| Path | Minimum |
|------|---------|
| General business logic | 80% |
| Authentication / authorization | 95% |
| Payment / billing | 95% |
| Data migrations | 90% |

---

## 11. API Design

### URL Structure

```
/api/v1/{plural-resource}              # collection
/api/v1/{plural-resource}/{id}         # single item
/api/v1/{plural-resource}/{id}/{sub}   # nested resource
```

- Plural nouns: `/users`, `/orders`, `/line-items`
- Kebab-case for multi-word resources: `/order-items`, not `/orderItems`
- No verbs in URLs. Use HTTP methods: `POST /users` not `POST /create-user`
- Version prefix: `/api/v1/`

### HTTP Methods

| Method | Usage | Success Code |
|--------|-------|-------------|
| `GET` | Read | 200 |
| `POST` | Create | 201 |
| `PUT` | Full replace | 200 |
| `PATCH` | Partial update | 200 |
| `DELETE` | Remove | 204 (no body) |

### Response Shapes

**Success — single:**
```json
{"data": {"id": "...", "email": "..."}}
```

**Success — list (always paginated):**
```json
{
  "data": [{"id": "..."}, {"id": "..."}],
  "meta": {"total": 142, "page": 1, "per_page": 20, "total_pages": 8}
}
```

**Error:**
```json
{"error": {"code": "NOT_FOUND", "message": "User abc not found", "details": {"resource": "User", "id": "abc"}}}
```

### Pagination

```python
class PaginationParams(BaseModel):
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.per_page

class PaginatedResponse(BaseModel, Generic[T]):
    data: list[T]
    meta: PaginationMeta

class PaginationMeta(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
```

### Datetimes

- Always UTC. Always ISO 8601: `2024-01-15T12:00:00Z`.
- Store as `datetime` with `timezone.utc`. Serialize via Pydantic.
- Never use naive datetimes.

---

## 12. Code Style Details

### Strings

- F-strings preferred. No function calls inside braces.
- Multiline: use `textwrap.dedent` or parenthesized string concatenation.

```python
# ✅
name = user.display_name
msg = f"Welcome, {name}!"

# ❌ Function call inside f-string
msg = f"Welcome, {user.get_display_name()}!"
```

### Docstrings — Google Style, Imperative Mood

```python
async def get_user_by_email(email: str) -> User | None:
    """Retrieve a user by email address.

    Args:
        email: The email address to search for.

    Returns:
        The matching user, or None if not found.

    Raises:
        DatabaseError: If the query fails.
    """
```

Required on: all public functions, classes, and modules. Private helpers: optional but encouraged for non-obvious logic.

### Trailing Commas

Always on multiline structures:

```python
user = UserCreate(
    email="test@example.com",
    password="strongpass123",
    display_name="Test User",  # trailing comma
)
```

### Imports

Ruff handles sorting. Logical order: stdlib → third-party → local. Use absolute imports.

```python
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DbSession, CurrentUser
from app.schemas.user import UserCreate, UserOut
```

---

## 13. Anti-Patterns — Never Do These

### Silent Exception Swallowing

```python
# ❌ NEVER
try:
    await send_email(user.email)
except Exception:
    pass

# ✅ Log and re-raise, or handle specifically
try:
    await send_email(user.email)
except SMTPError as exc:
    logger.warning("Email send failed for %s: %s", user.email, exc)
    raise NotificationError("Failed to send email") from exc
```

### Bare `except:`

```python
# ❌
except:
    ...

# ❌
except Exception:
    pass

# ✅ Catch specific exceptions
except (ValueError, KeyError) as exc:
    ...
```

### Mutable Default Arguments

```python
# ❌
def process(items: list[str] = []) -> None: ...

# ✅
def process(items: list[str] | None = None) -> None:
    items = items if items is not None else []
```

### Global Mutable State

```python
# ❌ Module-level mutable state
_cache: dict[str, Any] = {}

# ✅ Inject via dependency or use a proper cache service
class CacheService:
    def __init__(self) -> None:
        self._store: dict[str, Any] = {}
```

### Business Logic in Routes

See Section 3. Routes are thin dispatch layers only.

### Raw Dict Returns

```python
# ❌
return {"user": {"id": str(user.id), "email": user.email}}

# ✅
return UserResponse(data=UserOut.model_validate(user))
```

### `HTTPException` in Services

```python
# ❌ Service knows about HTTP
from fastapi import HTTPException
class UserService:
    async def get(self, user_id: UUID) -> User:
        user = await self.repo.get(user_id)
        if not user:
            raise HTTPException(404, "Not found")

# ✅ Service raises domain exception
class UserService:
    async def get(self, user_id: UUID) -> User:
        user = await self.repo.get(user_id)
        if not user:
            raise NotFoundError("User", user_id)
```

### Blocking Calls in Async

```python
# ❌ Blocks event loop
content = open("file.txt").read()
result = requests.get("https://api.example.com")
time.sleep(5)

# ✅
content = await asyncio.to_thread(Path("file.txt").read_text)
async with httpx.AsyncClient() as client:
    result = await client.get("https://api.example.com")
await asyncio.sleep(5)
```

---

## Quick Reference Checklist

Before submitting code, verify:

- [ ] `from __future__ import annotations` at top of file
- [ ] All functions have full type annotations (params + return)
- [ ] No `Any` without comment justification
- [ ] No shadowed builtins
- [ ] Pydantic v2 patterns (`ConfigDict`, not inner `class Config`)
- [ ] Domain exceptions, not `HTTPException` in services
- [ ] Exception chaining (`raise X from exc`)
- [ ] No bare `except:` or `except Exception: pass`
- [ ] No mutable default arguments
- [ ] Async for all I/O operations
- [ ] Routes are thin — logic lives in services
- [ ] Schemas split: Create / Update / Out
- [ ] Tests follow AAA pattern with descriptive names
- [ ] `ruff check .` and `mypy .` pass clean
