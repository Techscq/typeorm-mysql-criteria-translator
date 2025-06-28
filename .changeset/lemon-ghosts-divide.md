---
'@nulledexp/typeorm-mysql-criteria-translator': major
---

### 💥 Breaking Changes

- **Alignment with Declarative Joins API**: The translator's API has been updated to support the new declarative, schema-driven join system from `@nulledexp/translatable-criteria` v2.0.0.
  - **WHAT CHANGED**: The internal logic no longer processes manual join keys. It now relies entirely on the `relations` property defined in the `CriteriaSchema`.
  - **WHY IT CHANGED**: This ensures full compatibility with the core library's simplified and more robust API, making the entire ecosystem consistent.

### ✨ New Features

- **Composite Cursor Pagination Support**: Implemented robust support for keyset pagination using composite cursors. The translator can now generate complex `WHERE` clauses that span across multiple tables (root and joined entities), enabling advanced and efficient pagination.
- **Filter-Only Join Optimization**: The translator now correctly handles the `withSelect: false` option, generating joins for filtering purposes only without adding the related entity's fields to the final `SELECT` statement. This provides a significant performance boost.
- **Expanded Filter Operator Support**: Added translation logic for the entire new suite of v2 filter operators, including:
  - **JSON/Array Operators**: `JSON_CONTAINS`, `ARRAY_CONTAINS_ANY_ELEMENT`, `ARRAY_EQUALS_STRICT`, and all their `NOT_` counterparts.
  - **Set Operators**: `SET_CONTAINS`, `SET_CONTAINS_ALL`, and their negations.

### 🛠️ Refactoring & Internal Improvements

- **Strategy Pattern for Filter Translation**: The core filter translation logic was refactored from a large switch statement to a modular Strategy pattern. Each filter operator is now handled by a dedicated class, making the translator more extensible, maintainable, and easier to test.
- **Improved State Management**: Introduced `QueryState` and `QueryApplier` classes to better separate concerns. The translator now orchestrates the process, delegating state management and final query application to these specialized components, leading to cleaner and more robust code.
- **Guaranteed SQL Precedence**: The translator now ensures the root `WHERE` clause is always wrapped in parentheses, guaranteeing correct SQL operator precedence in complex queries.

### 📚 Documentation

- **Complete Documentation Overhaul**: All documentation has been rewritten to reflect the new declarative API and advanced features, providing clear examples and up-to-date usage guides.
