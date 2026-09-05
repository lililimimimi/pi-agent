# 模块 12：Docker 容器隔离

**目标：** 工具执行放入 Docker 容器，防止宿主机污染。

## 文件
- `backend/app/sandbox/docker_executor.py` — DockerExecutor
- `backend/app/sandbox/Dockerfile.sandbox` — 沙箱镜像
- `backend/app/tools/run_command.py` — 使用 DockerExecutor
- `backend/tests/test_docker_executor.py`

## DockerExecutor 接口

```python
class DockerExecutor:
    def run(self, cmd: str, project_root: str, timeout: int = 30) -> ExecuteResult:
        # docker run --rm --network none --memory 512m --cpus 0.5
        #   -v project_root:/workspace:ro sandbox sh -c cmd
```

## Dockerfile.sandbox
```dockerfile
FROM python:3.11-slim
RUN apt-get install -y git nodejs npm
WORKDIR /workspace
```

## 降级策略
- Docker 未安装 → 本地执行 + SecurityInterceptor 兜底
- 超时 → `docker kill` 强制终止
- `config.yaml`: `sandbox.enabled: true/false`

## 步骤

- [ ] 写 `Dockerfile.sandbox` + `docker build -t sandbox .`
- [ ] 写 `docker_executor.py`（subprocess 调 docker run）
- [ ] 写 `run_command.py`（优先 Docker，降级本地）
- [ ] 写测试（mock + 实际 `docker run sandbox echo hello`）
- [ ] `pytest tests/test_docker_executor.py -v` → 通过

## ⏸ 审核后继续
