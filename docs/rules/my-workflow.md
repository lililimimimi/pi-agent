# 我的工作流规范

## Git 工作流

### Conventional Commits

所有 commit message 必须遵循 Conventional Commits 格式：

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**类型：**

| Type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档变更 |
| `style` | 格式调整（不影响逻辑） |
| `refactor` | 重构（不改变功能） |
| `test` | 测试相关 |
| `chore` | 构建、工具、依赖等 |
| `ci` | CI/CD 配置 |
| `perf` | 性能优化 |

**示例：**
```
feat(auth): add JWT refresh token support
fix(api): handle null response in user endpoint
docs(readme): update installation instructions
test(auth): add unit tests for login service
```

### 分支策略

- `main` — 生产分支，保护
- `feat/<name>` — 功能分支
- `fix/<name>` — 修复分支
- `chore/<name>` — 杂项分支

## 开发原则

### TDD（测试驱动开发）

1. **Red** — 先写失败的测试
2. **Green** — 写最少的代码让测试通过
3. **Refactor** — 重构，保持测试通过

```
写测试 → 运行（失败）→ 写实现 → 运行（通过）→ 重构 → 运行（通过）→ 提交
```

### YAGNI（You Aren't Gonna Need It）

- 只实现当前需要的功能
- 不为"未来可能需要"编写代码
- 不过度抽象，不过度设计
- 等到真正需要时再扩展

### 其他原则

- **DRY**（Don't Repeat Yourself）— 消除重复，但不要为了消除而过度抽象
- **KISS**（Keep It Simple, Stupid）— 保持简单
- **单一职责** — 每个函数/类/模块只做一件事

## 提交流程

```
1. 写测试（确保失败）
2. 实现功能（确保测试通过）
3. 重构（确保测试仍然通过）
4. lint + format
5. git add + git commit（Conventional Commits 格式）
6. 推送 + PR
```

## Code Review 检查清单

- [ ] 是否有对应的测试？
- [ ] 测试是否覆盖了边界情况？
- [ ] 是否遵循命名规范？
- [ ] 是否有不必要的复杂度？
- [ ] commit message 是否符合 Conventional Commits？
- [ ] 是否引入了不需要的依赖？
