# FastAPI + Python 代码规范

## 基本原则

- Python 3.11+，使用类型注解
- 异步优先：所有 I/O 操作使用 `async/await`
- 使用 **Pydantic v2** 进行数据验证

## 分层架构

```
app/
  api/            # 路由层（thin，只做参数解析和响应）
    routes/
  core/           # 配置、安全、依赖注入
  models/         # SQLAlchemy / 数据库模型
  schemas/        # Pydantic schemas（请求/响应）
  services/       # 业务逻辑层
  repositories/   # 数据访问层
```

### 职责划分

- **Routes（路由）**：参数解析、调用 service、返回响应，不含业务逻辑
- **Services（服务）**：业务逻辑、编排多个 repository
- **Repositories（仓库）**：数据库操作、查询构建

## Pydantic v2

- 使用 `model_validator`、`field_validator` 替代 v1 的 `validator`
- Schema 按用途拆分：`UserCreate`, `UserUpdate`, `UserResponse`
- 使用 `ConfigDict` 替代 `class Config`

```python
from pydantic import BaseModel, ConfigDict, field_validator

class UserCreate(BaseModel):
    model_config = ConfigDict(strict=True)

    username: str
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v:
            raise ValueError("Invalid email")
        return v.lower()
```

## 错误处理 — ToolResult 模式

- **不抛异常传递业务错误**，使用 `ToolResult` 返回结构化结果
- 异常仅用于不可恢复错误（数据库连接失败等）

```python
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")

@dataclass
class ToolResult(Generic[T]):
    success: bool
    data: T | None = None
    error: str | None = None

    @classmethod
    def ok(cls, data: T) -> "ToolResult[T]":
        return cls(success=True, data=data)

    @classmethod
    def fail(cls, error: str) -> "ToolResult[T]":
        return cls(success=False, error=error)
```

```python
# service 层
async def create_user(self, payload: UserCreate) -> ToolResult[User]:
    existing = await self.repo.get_by_email(payload.email)
    if existing:
        return ToolResult.fail("Email already registered")
    user = await self.repo.create(payload)
    return ToolResult.ok(user)

# route 层
@router.post("/users")
async def create_user(payload: UserCreate, service: UserService = Depends()):
    result = await service.create_user(payload)
    if not result.success:
        raise HTTPException(status_code=400, detail=result.error)
    return result.data
```

## 异步

- 数据库使用 `asyncpg` / `SQLAlchemy async`
- HTTP 客户端使用 `httpx.AsyncClient`
- 文件 I/O 使用 `aiofiles`
- 禁止在 async 函数中调用同步阻塞操作

## 依赖注入

- 使用 FastAPI 的 `Depends()` 进行依赖注入
- 数据库 session 通过依赖注入传递
- 配置通过 `pydantic-settings` 管理

```python
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    secret_key: str

    model_config = ConfigDict(env_file=".env")

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 函数/变量 | snake_case | `get_user_by_id` |
| 类 | PascalCase | `UserService` |
| 常量 | UPPER_SNAKE_CASE | `MAX_CONNECTIONS` |
| 文件/模块 | snake_case | `user_service.py` |
| 路由路径 | kebab-case | `/api/user-profiles` |

## 测试

- 使用 **pytest** + **pytest-asyncio**
- 测试文件：`test_user_service.py`
- 使用 `httpx.AsyncClient` 进行 API 集成测试
- Mock 外部依赖，不 mock 被测对象内部实现
