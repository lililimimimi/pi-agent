# React + TypeScript Coding Standards

## Prime Directive

When standards conflict, resolve in this order:

1. **Correctness** — broken code that follows style is still broken
2. **Consistency within the module** — a file should read as one voice
3. **Consistency within the project** — follow existing patterns before introducing new ones
4. **This guide** — defaults for when nothing else applies

---

## TypeScript

### Strictness

- `strict: true` in `tsconfig.json`. No exceptions.
- Never use `any`. Use `unknown` + type guards or explicit narrow types.
- No `@ts-ignore`. Use `@ts-expect-error` only with a comment explaining the specific issue.

### Types vs Interfaces

- `interface` for object shapes (props, API responses, domain entities).
- `type` for unions, intersections, mapped types, and utilities.

```typescript
// Object shape → interface
interface User {
  id: string;
  name: string;
  role: UserRole;
}

// Union → type
type UserRole = "admin" | "editor" | "viewer";

// Utility → type
type UserUpdate = Partial<Pick<User, "name" | "role">>;
```

### Discriminated Unions for State

Model exclusive states explicitly. Never use boolean flags that create impossible combinations.

```typescript
// ✅ Discriminated union — states are explicit and exhaustive
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };

// ❌ Boolean soup — is loading+error possible? Who knows
interface BadState<T> {
  isLoading: boolean;
  isError: boolean;
  data: T | null;
  error: Error | null;
}
```

### API Types

- Every API response gets a full type definition. No `as` assertions on responses.
- Validate at the boundary (Zod schemas or equivalent), then trust the types internally.

```typescript
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["admin", "editor", "viewer"]),
});

type User = z.infer<typeof UserSchema>;
```

### Other Type Practices

- Use `as const` for literal types and exhaustive checks.
- Use template literal types when modeling string patterns: `type Route = \`/api/${string}\``.
- Prefer `readonly` for arrays and objects that shouldn't be mutated.
- Export types separately: `export type { User }` to keep type-only imports clean.

---

## Components

### Fundamentals

- Function components only. No class components.
- Named exports only. No default exports (improves refactoring and grep-ability).
- Props defined as `interface {ComponentName}Props`.

```typescript
interface UserCardProps {
  user: User;
  onSelect: (userId: string) => void;
}

export function UserCard({ user, onSelect }: UserCardProps) {
  return (
    <button onClick={() => onSelect(user.id)}>
      {user.name}
    </button>
  );
}
```

### Size and Extraction

- Aim for components under 50 lines of JSX. Not a hard rule — clarity wins.
- When a component grows, extract logic into custom hooks, not into helper functions that close over component state.
- Extract sub-components when a chunk of JSX has its own identity (its own props, its own test surface).

### Composition Over Configuration

Prefer `children`, render props, and compound components over god-components with 15 props.

```typescript
// ✅ Composable — caller controls layout and content
<Card>
  <Card.Header>
    <h2>{title}</h2>
  </Card.Header>
  <Card.Body>{children}</Card.Body>
</Card>

// ❌ Over-configured — Card now owns too many concerns
<Card
  title={title}
  subtitle={subtitle}
  headerIcon={icon}
  footerActions={actions}
  variant="outlined"
  showDivider
/>
```

---

## Deep Module Design

Design components and hooks as **deep modules**: small interface (props / return type), complex behavior hidden inside. The goal is **leverage** for callers (do more with less API surface) and **locality** for maintainers (changes stay inside the module).

### Vocabulary

Use these terms consistently across code reviews, docs, and discussions:

| Term | Meaning |
|------|---------|
| **Module** | Anything with an interface and an implementation — a component, hook, or utility |
| **Interface** | Everything a caller must know: props, return type, invariants, error modes |
| **Implementation** | What's inside the module — hidden from callers |
| **Depth** | Leverage at the interface: behavior per unit of API surface |
| **Seam** | Where you can alter behavior without editing the caller |
| **Adapter** | A concrete thing that satisfies an interface at a seam |
| **Leverage** | What callers get from depth — more capability, less learning |
| **Locality** | What maintainers get — changes concentrate in one place |

### Applying Depth to React

Custom hooks are the primary mechanism for depth:

```typescript
// Deep module: simple interface, complex behavior hidden
// Interface: (userId: string) => { user, isLoading, error, refetch }
// Implementation: caching, revalidation, optimistic updates, error retry
export function useUser(userId: string) {
  return useQuery({
    queryKey: ["user", userId],
    queryFn: () => api.getUser(userId),
    staleTime: 5 * 60 * 1000,
    retry: 3,
  });
}
```

A component's props are its interface. Keep them small:

```typescript
// ✅ Deep — small interface, rich behavior inside
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  onRowClick?: (row: T) => void;
}

// ❌ Shallow — interface is as complex as implementation
interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  sortColumn: string;
  sortDirection: "asc" | "desc";
  onSort: (col: string) => void;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  filterValue: string;
  onFilterChange: (val: string) => void;
  selectedRows: Set<string>;
  onSelectionChange: (rows: Set<string>) => void;
}
```

### The Deletion Test

Imagine deleting the module. If complexity vanishes, it was a pass-through (shallow). If complexity reappears across N callers, it was earning its keep (deep).

### Seam Discipline

- **One adapter = hypothetical seam.** Don't introduce an abstraction until something actually varies.
- **Two adapters = real seam.** Now the interface earns its keep.
- Wrap third-party libraries at a seam. Your code depends on your adapter, not on the library directly.

```typescript
// Seam: your app talks to this interface
interface Analytics {
  track(event: string, properties?: Record<string, unknown>): void;
}

// Adapter 1: production
export const posthogAnalytics: Analytics = {
  track: (event, props) => posthog.capture(event, props),
};

// Adapter 2: test/dev
export const noopAnalytics: Analytics = {
  track: () => {},
};
```

---

## State Management

### Where State Lives

| State type | Tool | Example |
|-----------|------|---------|
| UI-local | `useState` / `useReducer` | Form inputs, toggles, accordion open/closed |
| Shared client | Zustand store | Theme, auth, sidebar state |
| Server / async | TanStack Query | User data, lists, search results |
| URL | URL search params / router | Filters, pagination, selected tab |

### Rules

- **Never duplicate server state in client stores.** TanStack Query is the cache. Zustand stores hold client-only state.
- One Zustand store per feature domain. Don't create a god-store.
- Use `useReducer` when local state has complex transitions or multiple related fields.

```typescript
// Zustand store — one domain, small interface
interface AuthStore {
  user: User | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  login: async (credentials) => {
    const user = await api.login(credentials);
    set({ user });
  },
  logout: () => set({ user: null }),
}));
```

---

## Styling

- **Tailwind CSS** for utility classes. **shadcn/ui** for component primitives.
- No inline `style` attributes (except for truly dynamic values like calculated positions).
- Use `cn()` utility (clsx + tailwind-merge) for conditional/merged classes.
- Responsive design with mobile-first breakpoints: `sm:`, `md:`, `lg:`.

```typescript
import { cn } from "@/lib/utils";

interface ButtonProps {
  variant?: "primary" | "secondary";
  className?: string;
  children: React.ReactNode;
}

export function Button({ variant = "primary", className, children }: ButtonProps) {
  return (
    <button
      className={cn(
        "rounded-md px-4 py-2 font-medium transition-colors",
        variant === "primary" && "bg-blue-600 text-white hover:bg-blue-700",
        variant === "secondary" && "bg-gray-100 text-gray-900 hover:bg-gray-200",
        className
      )}
    >
      {children}
    </button>
  );
}
```

---

## Testing

### Tools

- **Vitest** as test runner. **Testing Library** for component tests.
- Co-locate test files: `UserProfile.tsx` → `UserProfile.test.tsx` in the same directory.

### Test at Seams, Not Internals

Tests cross the same interface as callers. If you're reaching past the interface to test, the module is the wrong shape.

```typescript
// ✅ Tests the seam: render the component, interact like a user
test("submits the form with user input", async () => {
  const onSubmit = vi.fn();
  render(<LoginForm onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText("Email"), "user@test.com");
  await userEvent.type(screen.getByLabelText("Password"), "password123");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

  expect(onSubmit).toHaveBeenCalledWith({
    email: "user@test.com",
    password: "password123",
  });
});

// ❌ Tests internals: couples to state shape, breaks on refactor
test("sets email state", () => {
  const { result } = renderHook(() => useLoginForm());
  act(() => result.current.setEmail("user@test.com"));
  expect(result.current.email).toBe("user@test.com");
});
```

### Anti-Patterns to Avoid

- **Tautological tests**: assertion recalculates expected value the same way the code does. Expected values must come from an independent source of truth — a known-good literal, a worked example.
- **Implementation-coupled tests**: mock internal collaborators, test private methods, or break when you refactor without changing behavior.
- **Horizontal slicing**: writing all tests first, then all implementation. Work in **vertical slices** — one test → one implementation → repeat.

### Mocking Discipline

- **Never mock what you don't own.** Wrap third-party APIs in an adapter (seam), then mock your adapter.
- Prefer real implementations over mocks when feasible (in-memory stores, test servers).
- Mock at the seam boundary, not deep inside the module.

```typescript
// ✅ Wrap the third-party, mock your wrapper
// lib/storage.ts — your adapter
export const storage = {
  get: (key: string) => localStorage.getItem(key),
  set: (key: string, value: string) => localStorage.setItem(key, value),
};

// In tests: mock your adapter
vi.mock("@/lib/storage", () => ({
  storage: { get: vi.fn(), set: vi.fn() },
}));
```

### Testability by Design

Three principles that make modules naturally testable:

1. **Accept dependencies, don't create them.** Pass collaborators in, don't instantiate them inside.
2. **Return results, don't produce side effects.** A function that returns a value is trivially testable.
3. **Small surface area.** Fewer methods = fewer tests needed. Fewer params = simpler setup.

---

## Project Structure

```
src/
  components/        # Shared UI components (deep modules, small interfaces)
    ui/              # Primitives (Button, Input, Dialog — shadcn)
  features/          # Feature modules, each self-contained
    auth/
      components/    # Feature-specific components
      hooks/         # Feature-specific hooks
      utils/         # Feature-specific utilities
      types.ts       # Feature-specific types
    dashboard/
      ...
  hooks/             # Global custom hooks (useMediaQuery, useDebounce)
  stores/            # Zustand stores, one file per domain
  lib/               # API client, utilities, adapters for third-party
  types/             # Global type definitions, shared across features
```

**Rules:**
- Features never import from other features. Shared code goes in `components/`, `hooks/`, `lib/`, or `types/`.
- Each feature is a deep module: its `index.ts` exports only what other parts of the app need.
- Adapters for third-party services live in `lib/` behind a seam.

---

## Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Component | PascalCase | `UserProfile` |
| Hook | camelCase, `use` prefix | `useAuth` |
| Function / variable | camelCase | `getUserName` |
| Constant | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Type / Interface | PascalCase | `UserProfile`, `ApiResponse` |
| File (component) | PascalCase | `UserProfile.tsx` |
| File (utility) | camelCase | `formatDate.ts` |
| Directory | kebab-case | `user-profile/` |
| Boolean prop / variable | `is`/`has`/`should` prefix | `isLoading`, `hasError` |
| Event handler prop | `on` prefix | `onSubmit`, `onClick` |
| Event handler function | `handle` prefix | `handleSubmit` |

---

## Error Handling

### Component Errors

Use error boundaries to catch render errors. Place them at feature boundaries, not around every component.

```typescript
import { ErrorBoundary } from "react-error-boundary";

<ErrorBoundary fallback={<ErrorFallback />}>
  <Dashboard />
</ErrorBoundary>
```

### API Errors

- Define typed error responses. Never `catch (e) {}` silently.
- Use TanStack Query's `onError` and error states — don't swallow errors in the query function.

```typescript
interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

// Errors surface through the query's error state
const { data, error } = useQuery({
  queryKey: ["users"],
  queryFn: fetchUsers,
});

if (error) {
  // error is typed, handle it visibly
}
```

### General Rules

- Never swallow errors silently. Log, display, or re-throw.
- Use `Result` types for operations that can fail in expected ways (validation, parsing).
- Reserve `throw` for truly exceptional situations.

---

## Performance

### Memoization

- Don't memoize by default. Measure first with React DevTools Profiler.
- Use `useMemo` for expensive computations with stable inputs.
- Use `useCallback` when passing callbacks to memoized children.
- `React.memo()` on components that render often with the same props — after measuring.

### Code Splitting

```typescript
const Settings = lazy(() => import("@/features/settings"));

<Suspense fallback={<PageSkeleton />}>
  <Settings />
</Suspense>
```

### Lists

- Virtualize long lists (>100 items) with `@tanstack/react-virtual` or similar.
- Always use stable, unique `key` props. Never use array index as key for dynamic lists.

---

## Imports

- Use path aliases: `@/` maps to `src/`.
- Group imports: React → external libraries → internal modules → types → styles.
- Avoid barrel files (`index.ts` re-exports) in large directories — they break tree-shaking and slow builds. Use them only at feature boundaries as the public interface.

---

## Quick Reference: Decision Checklist

When designing a new module, ask:

- [ ] Is the interface small? Can I reduce props / parameters?
- [ ] Is the implementation hiding complexity that would otherwise spread across callers?
- [ ] Does deleting this module cause complexity to reappear in N places? (deletion test)
- [ ] Am I testing at the seam (public interface), not past it?
- [ ] Am I accepting dependencies, not creating them?
- [ ] Does it return results rather than produce side effects?
- [ ] Would a new team member understand the interface without reading the implementation?
