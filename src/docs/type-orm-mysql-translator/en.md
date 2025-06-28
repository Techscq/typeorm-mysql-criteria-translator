# TypeOrmMysqlTranslator

## 1. Main Purpose

The `TypeOrmMysqlTranslator` is the central orchestrator of the library. Its main job is to take an abstract `Criteria` object you've built and convert it into a concrete TypeORM `SelectQueryBuilder` that is ready to be executed against a MySQL database.

It acts as a "director" that understands the structure of your `Criteria` and delegates the construction of each part of the query (filters, joins, ordering, etc.) to specialized helper components.

## 2. How It Works

The translator follows a clear, step-by-step process to build your query, ensuring all parts of your `Criteria` are correctly applied.

### 2.1. Delegation to Specialized Helpers

To keep the logic clean and maintainable, the translator doesn't do all the work itself. It relies on a team of helpers, each with a single responsibility:

- **`TypeOrmJoinApplier`**: The expert for `JOIN`s. It reads the relationship definitions from your schema and applies the correct `INNER` or `LEFT` join.
- **`TypeOrmConditionBuilder`**: The logic master. It builds the `WHERE` clause for the main query and the `ON` conditions for joins, correctly handling nested `AND`/`OR` groups.
- **`TypeOrmFilterFragmentBuilder`**: The operator specialist. It knows how to translate each specific `FilterOperator` (like `EQUALS`, `CONTAINS`, `JSON_CONTAINS`) into its corresponding MySQL syntax.
- **`TypeOrmParameterManager`**: The security guard. It ensures all filter values are parameterized to prevent SQL injection.
- **`QueryState` & `QueryApplier`**: These manage the state of the query as it's being built (e.g., collecting all `SELECT` and `ORDER BY` clauses) and apply them to the `QueryBuilder` at the end.

### 2.2. The Translation Process

When you call `translator.translate(criteria, qb)`, the following happens:

1.  **State Reset**: The translator prepares for a new query by resetting its internal state. This ensures that each translation is independent.
2.  **Visit the Criteria**: It begins "visiting" the `Criteria` object, starting from the root.
3.  **Apply Filters**: It processes the main `WHERE` conditions, using the `TypeOrmConditionBuilder` to correctly handle `AND`/`OR` logic with parentheses.
4.  **Apply Joins**: It iterates through each `.join()` in your `Criteria`. For each one:
    - It finds the corresponding relationship definition in your `CriteriaSchema`.
    - It passes all the necessary information (join keys, aliases) to the `TypeOrmJoinApplier`.
    - The `JoinApplier` then adds the `JOIN` and any `ON` conditions to the query.
5.  **Collect Everything Else**: As it traverses the `Criteria`, it collects all `orderBy`, `select`, `take`, `skip`, and `cursor` definitions.
6.  **Finalize the Query**: Once the entire `Criteria` has been visited, the `QueryApplier` applies the collected `SELECT` fields, `ORDER BY` clauses, and pagination (`take`/`skip` or cursor conditions) to the `QueryBuilder`.
7.  **Return**: The fully configured `SelectQueryBuilder` is returned, ready for you to execute.

## 3. Key Features and Usage Notes

### 3.1. Declarative Joins

The translator relies on the `relations` you define in your `CriteriaSchema`. This means you no longer need to specify join keys (`local_field`, `relation_field`) in your business logic. The translator handles this automatically, making your code cleaner and less error-prone.

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
    },
  ],
});

// In your business logic:
const criteria = CriteriaFactory.GetCriteria(PostSchema)
  // The translator finds the 'publisher' relation in the schema automatically.
  .join('publisher', publisherJoinCriteria);
```

### 3.2. Efficient Filtering with `withSelect: false`

A key feature is the ability to join a table for filtering purposes only, without the performance cost of selecting its data.

- **`join('publisher', joinCriteria, true)` (or omitting the last argument):** This is the default behavior. It generates an `INNER JOIN ... SELECT ...` and hydrates the `publisher` property on your results.
- **`join('publisher', joinCriteria, false)`:** This is the optimized version. It generates a simple `INNER JOIN` and uses it for the `WHERE`/`ON` clause, but does **not** select the publisher's fields. The `publisher` property on your results will be `undefined`.

This is extremely useful for queries where you need to check a condition on a related entity but don't need to return its data.

### 3.3. `OuterJoin` (Limitation)

`FULL OUTER JOIN` is not natively supported by MySQL. Emulating it is complex and often inefficient. Therefore, this translator does not support `OuterJoinCriteria` and will throw an error if one is provided. Use `LeftJoinCriteria` instead for most common use cases.
