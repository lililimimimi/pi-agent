# Workflow Standards

Standards for git workflow, development practices, and code review. Follow these unless the project's own docs override.

---

## 1. Git Workflow

### Conventional Commits

Format: `<type>(<scope>): <description>`

| Type       | When                                      | Example                                        |
|------------|-------------------------------------------|-------------------------------------------------|
| `feat`     | New feature                               | `feat(auth): add OAuth2 login flow`             |
| `fix`      | Bug fix                                   | `fix(api): handle null response from /users`    |
| `docs`     | Documentation only                        | `docs(readme): add setup instructions`          |
| `style`    | Formatting, whitespace, no logic change   | `style(lint): fix trailing commas`              |
| `refactor` | Code change, no new feature or fix        | `refactor(db): extract query builder`           |
| `test`     | Adding or correcting tests                | `test(auth): add login failure cases`           |
| `chore`    | Build, tooling, deps, no production code  | `chore(deps): bump axios to 1.6.0`             |
| `ci`       | CI/CD config and scripts                  | `ci(github): add coverage threshold check`      |
| `perf`     | Performance improvement                   | `perf(query): add index on user_email`          |

Rules:
- Subject line ≤ 72 characters, imperative mood, no trailing period.
- Body (optional): explain **why**, not what. Wrap at 80 characters.
- Breaking changes: add `!` after type/scope and `BREAKING CHANGE:` footer.
  ```
  feat(api)!: remove deprecated /v1/users endpoint

  BREAKING CHANGE: /v1/users removed. Use /v2/users instead.
  ```

### Branch Naming

```
feature/{ticket-id}-short-description
fix/{ticket-id}-short-description
chore/{ticket-id}-short-description
hotfix/{ticket-id}-short-description
```

Examples: `feature/AUTH-42-oauth-login`, `fix/API-99-null-response`, `hotfix/PROD-7-payment-crash`.

No ticket? Use a slug: `feature/add-dark-mode`.

### Protected Branches

| Branch    | Purpose        | Rules                                                    |
|-----------|----------------|----------------------------------------------------------|
| `main`    | Production     | PR only. CI green + ≥1 approval. No direct pushes.      |
| `develop` | Integration    | PR preferred. CI green. Feature branches merge here.     |

### PR Rules

1. **Reference the ticket** in PR title or description.
2. **CI must pass**: lint + type check + tests with ≥80% coverage.
3. **Squash merge** into target branch. Single clean commit.
4. **Delete branch** after merge.
5. **Keep PRs < 400 lines changed.** Split larger work into stacked PRs.
6. **Self-review before requesting review.** Read your own diff first.

---

## 2. Development Principles

### TDD: Red → Green Loop

Work in vertical slices. One test, one implementation, repeat.

```
1. Write one failing test        (Red)
2. Write minimal code to pass    (Green)
3. Commit                        (tests passing)
4. Refactor if needed            (tests still passing)
5. Commit refactor separately
6. Repeat from 1
7. Push + PR
```

**Test at seams, not internals.** A seam is a public boundary where behavior is observable: function signatures, API endpoints, module exports. Don't test private methods or internal state.

Anti-patterns:
- **Implementation-coupled tests**: testing HOW not WHAT. If refactoring breaks tests without changing behavior, tests are coupled.
- **Tautological tests**: test recomputes the same logic as production code. Expected values must come from an independent source of truth (spec, manual calculation, known fixture).
- **Horizontal slicing**: writing all tests first, then all implementation. Write one test → one implementation → next test.

### YAGNI

Build only what the current spec requires.

- One adapter → no interface needed. It's a hypothetical seam.
- Two adapters → extract the interface. Now it's a real seam.
- Abstraction for a need the spec doesn't have → delete it. That's Speculative Generality.

Ask: "Does the spec require this variation?" No → don't build the abstraction.

### Deep Modules

Design modules with small interfaces that hide significant complexity.

- **Leverage**: ratio of capability to interface surface. Maximize it.
- **Locality**: keep related decisions together. If changing one thing requires touching five files, the module boundaries are wrong.
- **Information hiding**: implementation details stay behind the interface. Callers don't need to know.

Shallow modules (tiny implementation behind a big interface) are a smell. They push complexity to the caller.

### Other Principles

- **DRY**: Duplication is acceptable until you see the pattern. Extract on the third occurrence, not the second.
- **KISS**: Simplest solution that meets requirements. Complexity must justify itself.
- **Single Responsibility**: A module has one reason to change. If describing what it does requires "and," consider splitting.

---

## 3. Code Review

### Two-Axis Review

Every review evaluates along two axes:

1. **Standards**: Does the code follow this repo's coding standards? Check for documented conventions (naming, file structure, error handling patterns, test patterns). Repo standards override general smell baselines.
2. **Spec**: Does the code match what the originating issue or spec asked for? Is every requirement addressed? Is anything built that wasn't asked for?

### Severity Prefixes

| Prefix          | Meaning                                         | Action Required        |
|-----------------|--------------------------------------------------|------------------------|
| 🔴 `BLOCKER`   | Broken logic, security hole, data loss risk      | Must fix before merge  |
| 🟠 `MUST FIX`  | Significant issue, not critical                  | Must fix before merge  |
| 🟡 `SUGGESTION`| Better approach exists, current works             | Author decides         |
| 🟢 `NIT`       | Style, naming, minor preference                  | Optional               |
| 💬 `QUESTION`  | Need clarification on intent or approach          | Author must respond    |
| 👍 `PRAISE`    | Good pattern, clever solution, clean code         | —                      |

**Every review must include at least one 👍 PRAISE.** Find something genuinely good and call it out.

### Review Checklist

- **Correctness**: Does it do what it claims? Edge cases handled? Error paths covered?
- **Security**: Input validation? Auth checks? No secrets in code? SQL injection / XSS risks?
- **Performance**: Unnecessary loops? N+1 queries? Missing indexes? Large allocations?
- **Maintainability**: Clear naming? Reasonable complexity? Would a new dev understand this?
- **Testing**: Meaningful tests? Coverage adequate? Tests at seams, not internals?
- **Standards Compliance**: Matches repo conventions? Consistent with existing patterns?

### Fowler Smell Baseline

Flag these unless the repo's standards explicitly permit them:

| Smell                      | Signal                                                    |
|----------------------------|-----------------------------------------------------------|
| Mysterious Name            | Variable/function name doesn't reveal intent              |
| Duplicated Code            | Same logic in multiple places (rule of three applies)     |
| Long Function              | Function doing too many things, hard to name              |
| Long Parameter List        | >3 params → consider object/config                        |
| Feature Envy               | Method uses another class's data more than its own        |
| Data Clumps                | Same group of fields always appear together → extract     |
| Primitive Obsession        | Using strings/ints where a domain type belongs            |
| Speculative Generality     | Abstraction for future need that doesn't exist yet        |
| Divergent Change           | One module changes for multiple unrelated reasons         |
| Shotgun Surgery            | One change requires edits across many modules             |

### Good Feedback

- **Actionable**: says what to change, not just that something is wrong.
- **Specific**: points to the line and the problem, with a suggested fix or pattern.
- **Kind**: critique the code, not the person. "This could be simplified" not "Why did you do this?"

Bad: "This is confusing."
Good: `🟡 SUGGESTION: Extract the date parsing into a `parseISODate()` helper—the inline regex is hard to scan.`

### Reviewer Responsibilities

- Respond to review requests within **4 hours** during working hours.
- Pull the branch and run locally if the change is non-trivial.
- Don't rubber-stamp. If you approved, you share ownership of the code.

### Author Responsibilities

- Keep PRs < 400 lines. If larger, split or explain why.
- Self-review the diff before requesting review.
- Respond to every comment: resolve, discuss, or explain.
- Don't merge with unresolved 🔴 BLOCKER or 🟠 MUST FIX comments.

---

## 4. Commit Flow

Standard development cycle:

```
1. Pick task from backlog
2. Create branch: feature/{ticket}-description
3. Write one failing test                          (Red)
4. Write minimal implementation to pass            (Green)
5. git add -A && git commit -m "feat(scope): ..."  (tests passing)
6. Refactor if code smells                         (tests still passing)
7. git commit -m "refactor(scope): ..."            (separate commit)
8. Repeat 3-7 for next slice
9. Push branch, open PR
10. Address review feedback
11. Squash merge, delete branch
```

Commit discipline:
- Each commit has passing tests. Never commit broken tests.
- Separate feature commits from refactor commits. Reviewers can see what changed behavior vs. what restructured.
- Atomic commits: one logical change per commit. Don't mix a bugfix with a feature.

---

## 5. Release Strategy

### Semantic Versioning

`MAJOR.MINOR.PATCH`

| Component | Bump When                                           | Example         |
|-----------|-----------------------------------------------------|-----------------|
| MAJOR     | Breaking change to public API or behavior           | 1.0.0 → 2.0.0  |
| MINOR     | New feature, backward-compatible                    | 1.0.0 → 1.1.0  |
| PATCH     | Bug fix, backward-compatible                        | 1.0.0 → 1.0.1  |

Pre-release: `1.0.0-rc.1`, `1.0.0-beta.2`. Build metadata: `1.0.0+build.42`.

### Release Flow

```
1. All features merged to develop, CI green
2. Create release branch: release/v1.2.0
3. Final testing, version bump, changelog update
4. PR to main, get approval
5. Merge to main, tag: v1.2.0
6. Merge main back to develop
7. Delete release branch
```

### Hotfix Flow

For production emergencies only:

```
1. Branch from main: hotfix/PROD-{id}-description
2. Fix + test (still do Red → Green)
3. PR to main (expedited review, ≥1 approval)
4. Merge to main, tag: v1.2.1 (patch bump)
5. Cherry-pick or merge to develop immediately
6. Delete hotfix branch
```

Hotfixes skip the release branch process but never skip tests or review.
