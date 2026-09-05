---
name: fastapi-python
description: FastAPI + Python 项目编码规范。分层架构、领域异常、Pydantic v2 模式。适用于所有 FastAPI 项目。
---

# FastAPI + Python 规范

> 仅记录架构决策和项目特有模式。PEP 8、基础类型注解、标准命名等不再重复。

## 技术栈

- **Python 3.12+**，`from __future__ import annotations` 每个文件
- **Ruff** (lint+format, line-length=88)，**mypy** (strict=true)，**pytest** + pytest-asyncio
- **Pydantic v2** + pydantic-settings，**SQLAlchemy 2.x async**，**httpx** (async HTTP)
- **structlog** 做日志，禁止 `print()`

## 分层架构

```
Routes → Services → Repositories → Models
```

- **Route**: 薄调度层。接收 Pydantic、调用 Service、返回 Pydantic。零业务逻辑
- **Service**: 业务逻辑。抛领域异常，**禁止 import HTTPException**
- **Repository**: 数据库查询。包裹 DB 异常为领域异常
- **Model**: SQLAlchemy ORM。不 import FastAPI/Pydantic

## FastAPI 模式

```python
# App factory + lifespan（不用 @app.on_event）
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield

def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)
    app.add_exception_handler(AppError, app_error_handler)
    return app
```

```python
# Annotated 依赖——定义在 deps.py，路由中直接用类型别名
DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
```

- **RORO**: 路由接收 Pydantic model，返回 Pydantic model，禁止 raw dict
- **Schema 按用途拆分**: `UserCreate` / `UserUpdate` / `UserOut`，禁止复用

## 领域异常体系

```python
class AppError(Exception):
    def __init__(self, message: str, code: str = "APP_ERROR",
                 details: dict[str, Any] | None = None) -> None:
        self.message, self.code, self.details = message, code, details or {}
        super().__init__(message)

class NotFoundError(AppError): ...
class ConflictError(AppError): ...
class AuthenticationError(AppError): ...
class AuthorizationError(AppError): ...
```

```python
# 全局异常处理器——唯一映射 domain → HTTP 的地方
_STATUS = {NotFoundError: 404, ConflictError: 409,
           AuthenticationError: 401, AuthorizationError: 403}

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(status_code=_STATUS.get(type(exc), 500),
                        content={"error": {"code": exc.code, "message": exc.message}})
```

- 永远 `raise X from exc` 保留异常链
- Repository 层捕获 `IntegrityError` 等，包装为 `ConflictError` / `NotFoundError`

## API 响应格式

```json
成功单条: {"data": {...}}
成功列表: {"data": [...], "meta": {"total": 142, "page": 1, "per_page": 20}}
错误:     {"error": {"code": "NOT_FOUND", "message": "..."}}
```

- URL: `/api/v1/{plural-noun}`，kebab-case，名词不是动词
- 列表端点必须分页，`per_page` 上限 100
- 时间格式: ISO 8601 UTC `2024-01-15T12:00:00Z`

## 测试

- **命名**: `test_{action}_{scenario}_{expected}`
- **AAA**: Arrange → Act → Assert，每个测试一个 Act
- **factory_boy** 造数据，禁止硬编码
- **Mock 边界**: mock 外部服务 / DB boundary，不 mock 内部私有方法
- 覆盖率: 业务逻辑 ≥80%，认证/支付路径 ≥95%

## 关键禁令

- ❌ `except Exception: pass`（静默吞异常）
- ❌ Service 中 `raise HTTPException`（用领域异常）
- ❌ 路由中写业务逻辑（Route 是薄层）
- ❌ 可变默认参数 `def f(x=[])`
- ❌ 在 async 中调用同步阻塞 I/O（用 `asyncio.to_thread`）
- ❌ 返回 raw dict（用 Pydantic response model）
