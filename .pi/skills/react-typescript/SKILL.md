---
name: react-typescript
description: React + TypeScript 项目编码规范。技术栈选择、深模块设计、测试哲学。适用于所有 React/TS 项目。
---

# React + TypeScript 规范

> 仅记录技术栈选择和非显而易见的设计决策。基础 TS/React 最佳实践不再重复。

## 技术栈

- **UI 组件**: shadcn/ui（不引入其他 UI 库）
- **样式**: Tailwind CSS，用 `cn()` (clsx + tailwind-merge) 合并类名
- **全局状态**: Zustand，按功能域一个 store
- **服务端状态**: TanStack Query（永远不要把服务端数据复制到 Zustand）
- **表单**: React Hook Form + Zod
- **测试**: Vitest + Testing Library
- **路径别名**: `@/` → `src/`

## 项目结构

```
src/
  components/ui/   # shadcn 原子组件
  features/        # 功能模块，每个含 components/ hooks/ utils/ types.ts
  hooks/           # 全局 hooks
  stores/          # Zustand stores
  lib/             # API client、适配器、工具函数
  types/           # 全局类型
```

- Feature 之间禁止互相导入，共享代码提到 components/hooks/lib/types
- 每个 feature 的 `index.ts` 只导出公共接口

## 深模块设计

核心原则：**小接口，大实现**。组件的 Props 和 Hook 的返回类型是它的接口——保持小。

- **删除测试**: 删掉这个模块后，复杂度是否会散落到 N 个调用方？是 → 保留；否 → 它是 pass-through
- **Seam 纪律**: 一个实现 → 不需要抽象接口；两个实现 → 提取接口。不为假想需求建抽象
- **第三方封装**: 用适配器包裹第三方库（analytics、storage），mock 适配器而非第三方

```ts
// 深模块示例：简单接口，复杂行为隐藏在内
function useUser(userId: string) {
  return useQuery({ queryKey: ["user", userId], queryFn: () => api.getUser(userId) });
}
```

## 类型设计

- 用 **discriminated union** 建模互斥状态，不用 boolean 组合

```ts
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };
```

- API 边界用 Zod 校验，内部信任类型；禁止 `as` 断言接口返回值
- 组合优于配置：优先 `children` / compound component，而非 15 个 props 的上帝组件

## 测试

- **在 Seam 测试，不测内部**: 渲染组件 → 像用户一样交互 → 断言结果
- **垂直切片 TDD**: 一个测试 → 一个实现 → 下一个测试。不要先写完所有测试
- **不 mock 你不拥有的东西**: 封装第三方到适配器，mock 适配器
- 期望值来自独立的真实来源（spec、手算结果），不是把生产逻辑再算一遍

## 导出风格

- 组件和函数用 named export，禁止 default export
- 类型单独导出: `export type { User }`
- 避免大目录的 barrel file（破坏 tree-shaking），只在 feature 边界用
