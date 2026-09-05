---
name: typescript-total
description: |
  Advanced TypeScript patterns based on Matt Pocock's Total TypeScript curriculum.
  Use when writing or reviewing TypeScript code that involves generics, type manipulation,
  discriminated unions, branded types, conditional types, or runtime validation with Zod.
  适用于：TypeScript 类型系统、泛型设计、类型体操、运行时类型安全、React 类型模式。
---

# Total TypeScript — Advanced Patterns

Based on Matt Pocock's Total TypeScript curriculum. These patterns produce type-safe,
self-documenting TypeScript that catches errors at compile time rather than runtime.

## Core Philosophy

> "If you can't explain what a type does without looking at its implementation, the abstraction is wrong."

1. **Types describe intent, not just shape** — a `UserId` is not the same as a `string`
2. **Narrow early, widen never** — prefer discriminated unions over optional fields
3. **Avoid `any`, embrace `unknown`** — force callers to prove what they have
4. **Type inference is your friend** — don't annotate what TypeScript already knows
5. **`as` is a smell** — every `as` cast is a lie to the compiler; prove it instead

---

## 1. Discriminated Unions — The Right Shape for State

**Bad: optional fields create impossible states**
```typescript
// Bad — what does isError=true, data present mean?
interface Result {
  data?: User
  error?: string
  isError: boolean
}
```

**Good: discriminated union — each branch is self-contained**
```typescript
type Result<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }
  | { status: 'loading' }

// TypeScript knows exactly what's available in each branch
function render(result: Result<User>) {
  if (result.status === 'success') {
    return result.data.name    // ✅ data is guaranteed here
  }
  if (result.status === 'error') {
    return result.error.message // ✅ error is guaranteed here
  }
  return 'Loading...'
}
```

**With exhaustive checking:**
```typescript
function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`)
}

function render(result: Result<User>): string {
  switch (result.status) {
    case 'success': return result.data.name
    case 'error': return result.error.message
    case 'loading': return 'Loading...'
    default: return assertNever(result) // ✅ fails to compile if a case is missing
  }
}
```

---

## 2. Generics — Constraints and Inference

**Rule: constrain input, infer output**

```typescript
// Bad — too wide, loses information
function getFirstElement(arr: unknown[]): unknown {
  return arr[0]
}

// Good — preserves type through generic
function getFirstElement<T>(arr: T[]): T | undefined {
  return arr[0]
}

const first = getFirstElement([1, 2, 3]) // first: number | undefined ✅
```

**Constrain with `extends`:**
```typescript
// Only accept objects that have an `id` field
function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find(item => item.id === id)
}

// Use keyof to ensure the key exists on the type
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  return keys.reduce((acc, key) => ({ ...acc, [key]: obj[key] }), {} as Pick<T, K>)
}
```

**Infer return type from input:**
```typescript
// The return type matches the exact shape passed in
function withDefaults<T extends Record<string, unknown>>(
  config: T,
  defaults: Partial<T>
): T {
  return { ...defaults, ...config }
}
```

---

## 3. `as const` and Const Type Parameters

**`as const` — preserve literal types**
```typescript
// Without as const — widened to string[]
const ROLES = ['admin', 'user', 'guest']
// ROLES: string[]

// With as const — preserved as tuple of literals
const ROLES = ['admin', 'user', 'guest'] as const
// ROLES: readonly ['admin', 'user', 'guest']

type Role = typeof ROLES[number] // 'admin' | 'user' | 'guest'

function setRole(role: Role) { ... }
setRole('admin')   // ✅
setRole('hacker')  // ❌ compile error
```

**`const` type parameter (TypeScript 5.0+) — infer literals without `as const`:**
```typescript
// Caller doesn't need as const — TypeScript infers literals automatically
function createRoute<const T extends string>(path: T): { path: T } {
  return { path }
}

const route = createRoute('/users')
// route.path: '/users' (literal type, not string)
```

---

## 4. Branded Types — Nominal Typing

TypeScript's type system is structural, not nominal. Two identical shapes are interchangeable.
Branded types prevent accidentally mixing semantically different values with the same underlying type.

```typescript
// Without branding — these are both strings, easy to mix up
function sendEmail(userId: string, email: string) { ... }
sendEmail(email, userId) // ✅ compiles, 🐛 wrong order

// With branding — each type is unique
declare const brand: unique symbol

type Brand<T, B> = T & { readonly [brand]: B }

type UserId = Brand<string, 'UserId'>
type Email = Brand<string, 'Email'>

function createUserId(id: string): UserId {
  return id as UserId // Only cast at the boundary where you validate
}

function createEmail(email: string): Email {
  if (!email.includes('@')) throw new Error('Invalid email')
  return email as Email
}

function sendEmail(userId: UserId, email: Email) { ... }

const uid = createUserId('user_123')
const email = createEmail('alice@example.com')

sendEmail(uid, email)   // ✅
sendEmail(email, uid)   // ❌ compile error — argument types are incompatible
```

---

## 5. Conditional Types and `infer`

**Extract type from a generic:**
```typescript
// Extract the resolved type from a Promise
type Awaited<T> = T extends Promise<infer R> ? R : T

type A = Awaited<Promise<string>>    // string
type B = Awaited<Promise<number[]>>  // number[]
type C = Awaited<string>             // string (not a Promise, falls through)
```

**Extract function parameter and return types:**
```typescript
type FirstArg<T extends (...args: any[]) => any> =
  T extends (first: infer F, ...rest: any[]) => any ? F : never

type R = FirstArg<(name: string, age: number) => void> // string

// Extract element type from an array
type ArrayElement<T> = T extends (infer E)[] ? E : never
type E = ArrayElement<User[]>  // User
```

**Distributive conditional types:**
```typescript
// Conditional types distribute over union members automatically
type ToArray<T> = T extends unknown ? T[] : never

type A = ToArray<string | number>
// string[] | number[]  (not (string | number)[] — it distributes!)
```

---

## 6. Mapped Types

**Transform every key of an object:**
```typescript
// Make all fields required and non-nullable
type Required<T> = { [K in keyof T]-?: NonNullable<T[K]> }

// Make all methods async
type Asyncify<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<R>
    : T[K]
}

// Remap keys
type Getters<T> = {
  [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K]
}

type User = { name: string; age: number }
type UserGetters = Getters<User>
// { getName: () => string; getAge: () => number }
```

---

## 7. Template Literal Types

```typescript
// Build event name types programmatically
type EventName<T extends string> = `on${Capitalize<T>}`

type MouseEvents = EventName<'click' | 'hover' | 'focus'>
// 'onClick' | 'onHover' | 'onFocus'

// CSS property builder
type CSSUnit = 'px' | 'em' | 'rem' | '%'
type CSSValue = `${number}${CSSUnit}`

const valid: CSSValue = '16px'   // ✅
const invalid: CSSValue = '16vw' // ❌ 'vw' not in CSSUnit

// Route type safety
type Route = '/users' | '/users/:id' | '/posts'
type WithBase<T extends string> = `/api/v1${T}`
type ApiRoute = WithBase<Route>
// '/api/v1/users' | '/api/v1/users/:id' | '/api/v1/posts'
```

---

## 8. The `satisfies` Operator (TypeScript 4.9+)

**Problem:** Type annotation widens the type. `as` is unsafe.
**Solution:** `satisfies` — validates against a type without widening.

```typescript
type Config = Record<string, string | number>

// Bad — annotating widens; you lose the literal types
const config: Config = {
  port: 3000,
  host: 'localhost',
}
config.port      // string | number — too wide!

// Bad — as is unsafe, no type checking
const config = {
  port: 3000,
  host: 'localhost',
} as Config

// Good — satisfies validates the shape but preserves literal types
const config = {
  port: 3000,
  host: 'localhost',
} satisfies Config

config.port   // number ✅ (TypeScript remembers it's specifically a number)
config.host   // string ✅
```

---

## 9. Type Predicates and Assertion Functions

**Type predicates — narrow in conditions:**
```typescript
function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value
  )
}

function processInput(input: unknown) {
  if (isUser(input)) {
    console.log(input.name) // ✅ TypeScript knows this is User
  }
}
```

**Assertion functions — throw if wrong:**
```typescript
function assertIsString(val: unknown): asserts val is string {
  if (typeof val !== 'string') {
    throw new Error(`Expected string, got ${typeof val}`)
  }
}

const value: unknown = 'hello'
assertIsString(value)
console.log(value.toUpperCase()) // ✅ TypeScript narrows after assertion
```

---

## 10. Runtime Validation with Zod

TypeScript types vanish at runtime. Zod bridges the gap — validate external data and
infer the TypeScript type from the schema automatically.

```typescript
import { z } from 'zod'

// Define schema once — types flow from it
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'user', 'guest']),
  createdAt: z.coerce.date(),
})

// Infer TypeScript type from schema — no duplication
type User = z.infer<typeof UserSchema>

// Validate API response at the boundary
async function fetchUser(id: string): Promise<User> {
  const raw = await fetch(`/api/users/${id}`).then(r => r.json())
  return UserSchema.parse(raw) // Throws ZodError if invalid — safe TypeScript after this
}

// Safe parse — returns result object instead of throwing
const result = UserSchema.safeParse(raw)
if (result.success) {
  console.log(result.data.name) // ✅ User type guaranteed
} else {
  console.error(result.error.flatten()) // ZodError with field-level details
}
```

**Zod for environment variables:**
```typescript
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(8000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const env = EnvSchema.parse(process.env)
// env.PORT is number, not string | undefined ✅
```

---

## 11. TypeScript + React Patterns

**Generic components:**
```typescript
// Select component that works with any option type
interface SelectProps<T> {
  options: T[]
  value: T
  onChange: (value: T) => void
  getLabel: (option: T) => string
  getKey: (option: T) => string
}

function Select<T>({ options, value, onChange, getLabel, getKey }: SelectProps<T>) {
  return (
    <select value={getKey(value)} onChange={e => {
      const selected = options.find(o => getKey(o) === e.target.value)!
      onChange(selected)
    }}>
      {options.map(opt => (
        <option key={getKey(opt)} value={getKey(opt)}>
          {getLabel(opt)}
        </option>
      ))}
    </select>
  )
}
```

**Typed event handlers:**
```typescript
// Prefer the specific event type over React.SyntheticEvent
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setValue(e.target.value)
}

const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  // ...
}
```

**`ComponentProps` — extend native elements safely:**
```typescript
import { ComponentProps } from 'react'

// Extend button with additional props — keeps all native button props
interface ButtonProps extends ComponentProps<'button'> {
  variant?: 'primary' | 'secondary' | 'danger'
  isLoading?: boolean
}

function Button({ variant = 'primary', isLoading, children, ...rest }: ButtonProps) {
  return (
    <button {...rest} disabled={isLoading || rest.disabled}>
      {isLoading ? 'Loading...' : children}
    </button>
  )
}
```

**`forwardRef` with types:**
```typescript
import { forwardRef, ComponentProps } from 'react'

interface InputProps extends ComponentProps<'input'> {
  label: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, ...props }, ref) => (
    <div>
      <label>{label}</label>
      <input ref={ref} {...props} />
      {error && <span className="error">{error}</span>}
    </div>
  )
)
Input.displayName = 'Input'
```

---

## 12. Common Anti-Patterns to Avoid

| Anti-pattern | Problem | Fix |
|---|---|---|
| `any` | Disables type checking | Use `unknown` + narrowing |
| `as SomeType` | Lies to compiler | Prove it with a type guard |
| Optional fields for state variants | Creates impossible states | Discriminated union |
| Huge union `string \| number \| boolean \| ...` | Uninformative | Define a named type |
| `// @ts-ignore` | Silences real errors | Fix the underlying type issue |
| Annotating what TypeScript infers | Noise | Remove redundant annotations |
| `object` type | Too wide | Use `Record<string, unknown>` |
| `Function` type | Loses signature | `(...args: unknown[]) => unknown` |

---

## Quick Reference

```typescript
// Exclude a member from a union
type WithoutLoading = Exclude<Result, { status: 'loading' }>

// Extract a member from a union
type Success = Extract<Result, { status: 'success' }>

// Make all fields optional
type PartialUser = Partial<User>

// Make all fields required
type RequiredUser = Required<User>

// Pick specific fields
type UserPreview = Pick<User, 'id' | 'name'>

// Omit specific fields
type UserWithoutPassword = Omit<User, 'passwordHash'>

// Make all fields readonly
type ImmutableUser = Readonly<User>

// Return type of a function
type Handler = (req: Request) => Response
type HandlerReturn = ReturnType<Handler>  // Response

// Parameters of a function
type HandlerParams = Parameters<Handler>  // [Request]

// Instance type of a class
type UserInstance = InstanceType<typeof UserClass>
```
