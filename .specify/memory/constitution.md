# Project Constitution
Data intake and collection tool for utilities, municipalities, and their customers.

## 1. Source of Truth

Specifications are the single source of truth.

If code and spec diverge:
1. Update the spec first.
2. Regenerate or modify code to match the spec.
3. Do not patch code without corresponding spec updates.

---

## 2. Spec Before Code

No implementation work begins without:
- spec.md (what + why)
- plan.md (architecture + tradeoffs)
- tasks.md (small executable tasks)

All generated code must map to a specific task.

---

## 3. Controlled Code Generation

All files are generated via Codex unless:
- The change is <5 lines and mechanical
- The spec explicitly allows manual edit

Manual edits must be documented in the related task.

---

## 4. Simplicity Bias

Prefer:
- Static over dynamic
- Boring over clever
- Fewer dependencies over many
- Explicit structure over magic

If a feature can be solved with markdown and layout composition, do not introduce runtime logic.

---

## 5. Definition of Done

A task is complete only when:
- Code compiles / builds successfully
- Page renders correctly
- Accessibility basics are satisfied
- Performance is not degraded
- Relevant documentation is updated
- Test coverage is >75%

---

## 6. Architectural Stability

Do not refactor across boundaries unless:
- Required by the spec
- A new spec explicitly authorizes the refactor

Avoid opportunistic improvements.

---

## 7. Transparency

All feature work must:
- Reference its feature ID
- Update tasks.md as tasks are completed
- Summarize changes and affected files

---

## 8. Publishing Discipline

Content is structured and versionable.
No ad-hoc content outside the defined information architecture.

---

## 9. Long-Term Intent

This site is:
- a multi-tenant offline app 
- Customizable for every aspect
- Routed to a set of microservices that power the backend

Engineering rigor is part of the product.

## Testing Strategy

- Vitest for unit testing
- React Testing Library for component testing
- Tests colocated with source files
- All tests must pass in CI before deployment

CI must fail on test failure.