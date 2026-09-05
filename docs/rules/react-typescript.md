# React + TypeScript 代码规范

## 组件

- 始终使用**函数组件** + hooks，禁止 class 组件
- 组件文件使用 PascalCase 命名：`UserProfile.tsx`
- 每个组件一个文件，导出为 named export（非 default export）
- Props 使用 `interface` 定义，命名为 `{Component}Props`

```tsx
interface UserProfileProps {
  userId: string;
  onUpdate: (user: User) => void;
}

export function UserProfile({ userId, onUpdate }: UserProfileProps) {
  // ...
}
```

## TypeScript

- 启用 `strict: true`，不使用 `any`
- 优先使用 `interface` 定义对象类型，`type` 用于联合类型和工具类型
- API 响应必须定义完整类型，禁止 `as` 强制断言
- 使用 `unknown` 替代 `any`，通过类型守卫收窄

## 样式

- 使用 **Tailwind CSS** 进行样式编写
- UI 组件库使用 **shadcn/ui**，不引入其他组件库
- 避免内联 `style` 属性
- 响应式设计使用 Tailwind 断点：`sm:`, `md:`, `lg:`

## 状态管理

- 全局状态使用 **Zustand**
- 局部状态使用 `useState` / `useReducer`
- 服务端状态使用 **TanStack Query**（React Query）
- Store 按功能拆分，避免单一巨大 store

```ts
// stores/useAuthStore.ts
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  login: async (credentials) => { /* ... */ },
  logout: () => set({ user: null }),
}));
```

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `UserProfile` |
| 函数/变量 | camelCase | `getUserName` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| 类型/接口 | PascalCase | `UserProfile`, `ApiResponse` |
| 文件（组件） | PascalCase | `UserProfile.tsx` |
| 文件（工具） | camelCase | `formatDate.ts` |
| 目录 | kebab-case | `user-profile/` |

## Hooks

- 自定义 hooks 以 `use` 开头：`useAuth`, `useDebounce`
- hooks 中不包含 UI 渲染逻辑
- 复杂逻辑抽取为自定义 hook

## 项目结构

```
src/
  components/     # 通用 UI 组件
  features/       # 功能模块（每个模块含 components/, hooks/, utils/）
  hooks/          # 全局自定义 hooks
  stores/         # Zustand stores
  lib/            # 工具函数、API client
  types/          # 全局类型定义
```

## 测试

- 组件测试使用 **Vitest** + **Testing Library**
- 测试文件与源文件同目录：`UserProfile.test.tsx`
- 测试用户行为，不测试实现细节
