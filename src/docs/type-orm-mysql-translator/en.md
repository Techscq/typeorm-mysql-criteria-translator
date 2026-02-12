# TypeOrmMysqlTranslator

## 1. Main Purpose

The `TypeOrmMysqlTranslator` is the central orchestrator of the library. Its main job is to take an abstract `Criteria` object you've built and convert it into a concrete TypeORM `SelectQueryBuilder` that is ready to be executed against a MySQL database.

It acts as a "director" that understands the structure of your `Criteria` and delegates the construction of each part of the query (filters, joins, ordering, etc.) to specialized helper components.

## 2. How It Works

The translator follows a clear, step-by-step process to build your query, ensuring all parts of your `Criteria` are correctly applied.

### 2.1. Delegation to Specialized Helpers

To keep the logic clean and maintainable, the translator doesn't do all the work itself. It relies on a team of helpers, each with a single responsibility:

- **`TypeOrmJoinApplier`**: The expert for `JOIN`s. It reads the relationship definitions from your schema, applies the correct `INNER` or `LEFT` join, and resolves alias collisions.
- **`TypeOrmConditionBuilder`**: The logic master. It builds the `WHERE` clause for the main query and the `ON` conditions for joins, correctly handling nested `AND`/`OR` groups.
- **`TypeOrmFilterFragmentBuilder`**: The operator specialist. It knows how to translate each specific `FilterOperator` (like `EQUALS`, `CONTAINS`, `JSON_CONTAINS`) into its corresponding MySQL syntax.
- **`TypeOrmParameterManager`**: The security guard. It ensures all filter values are parameterized to prevent SQL injection.
- **`QueryState` & `QueryApplier`**: These manage the state of the query as it's being built (e.g., collecting all `SELECT` and `ORDER BY` clauses) and apply them to the `QueryBuilder` at the end.

### 2.2. The Translation Process

When you call `translator.translate(criteria, qb)`, the following happens:

1.  **State Reset**: The translator prepares for a new query by resetting its internal state.
2.  **Initial Collection**: It collects root-level `select`, `orderBy`, `take`, and `skip` definitions. `take` and `skip` are applied directly to the `QueryBuilder` at this stage.
3.  **Visit the Criteria**: It begins "visiting" the `Criteria` object, starting from the root.
4.  **Apply Root Filters**: It processes the main `WHERE` conditions, using the `TypeOrmConditionBuilder`.
5.  **Apply Joins Recursively**: It iterates through each `.join()` in your `Criteria`. For each one:
    - It passes the relationship details to the `TypeOrmJoinApplier`.
    - The `JoinApplier` adds the `JOIN` and resolves any potential alias collisions, returning the unique alias it used (e.g., `publisher_1`).
    - The translator then recursively calls the translation process for any nested joins, passing down the unique alias to ensure correct parent-child linking.
6.  **Finalize the Query**: Once the entire `Criteria` has been visited, the `QueryApplier` is called to:
    - Apply cursor-based pagination conditions (`applyCursors`).
    - Apply all collected `ORDER BY` clauses (`applyOrderBy`).
    - Apply all collected `SELECT` fields (`applySelects`).
7.  **Return**: The fully configured `SelectQueryBuilder` is returned, ready for you to execute.

## 3. Key Features and Usage Notes

### 3.1. Declarative Joins & Alias Management

The translator relies on the `relations` you define in your `CriteriaSchema`. This makes your code cleaner and less error-prone. It also automatically handles alias collisions in complex, multi-level joins, so you don't have to worry about TypeORM throwing "alias already in use" errors.

```typescript
// In your Schema:
const PostSchema = GetTypedCriteriaSchema({
  // ...
  relations: [
    {
      relation_alias: 'publisher',
      relation_type: 'many_to_one',
      target_source_name: 'user',
      local_field: 'user_uuid',
      relation_field: 'uuid',
      // Optional: Define default selection behavior for this relation
      default_options: {
        select: SelectType.FULL_ENTITY,
      },
    },
  ],
});

// In your business logic:
const criteria = CriteriaFactory.GetCriteria(PostSchema)
  // The translator finds the 'publisher' relation in the schema automatically.
  .join('publisher', publisherJoinCriteria);
```

### 3.2. Flexible Selection Strategies (`SelectType`)

A key feature is the ability to control exactly what data is fetched when joining tables. This can be configured globally in the schema (via `default_options`) or overridden per query.

- **`SelectType.FULL_ENTITY` (Default):** Generates an `INNER JOIN ... SELECT ...` and hydrates the full entity on your results.
- **`SelectType.ID_ONLY`:** Optimizes the query by only loading the relation's ID (Foreign Key). If possible (Owning Side, no filters, no ordering, no nested joins), it avoids the join entirely. Otherwise, it uses TypeORM's `loadAllRelationIds`.
- **`SelectType.NO_SELECTION`:** Generates a simple `INNER JOIN` for filtering purposes but does **not** select the joined entity's fields. The property on your results will be `undefined`.

This is extremely useful for optimizing performance, especially when you only need to check a condition on a related entity or just need its ID.

### 3.3. `OuterJoin` (Limitation)

`FULL OUTER JOIN` is not natively supported by MySQL. Emulating it is complex and often inefficient. Therefore, this translator does not support `OuterJoinCriteria` and will throw an error if one is provided. Use `LeftJoinCriteria` instead for most common use cases.
