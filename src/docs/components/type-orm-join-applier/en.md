# TypeOrmJoinApplier

## 1. Main Purpose

The `TypeOrmJoinApplier` is the specialized helper responsible for applying `JOIN` clauses to the query. It acts as the "join expert," taking the relationship information defined in your `CriteriaSchema` and translating it into the correct `INNER JOIN` or `LEFT JOIN` in the final SQL.

Its main goal is to make joins simple and declarative for the user, while also providing powerful options for query optimization.

## 2. How It Works

This component is responsible for two key features of the translator's join system.

### 2.1. Declarative, Schema-Based Joins

The core principle is that you **define your relationships once** in the `CriteriaSchema` and then simply refer to them by their alias. The `JoinApplier` handles the rest.

When you make a call like `.join('publisher', ...)`:

1.  The translator provides the `JoinApplier` with the `publisher` relationship details that it found in your schema.
2.  The `JoinApplier` uses this information (target table, local key, relation key, etc.) to construct the correct `JOIN` clause.
3.  It also uses the `TypeOrmConditionBuilder` to translate any filters you've defined within the join's `Criteria` into the `ON` condition of the `JOIN`.

This means your business logic stays clean and free of database-specific details.

```typescript
// 1. You define the relation in the schema:
export const PostSchema = GetTypedCriteriaSchema({
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

// 2. You use it with a simple alias in your code:
const criteria = CriteriaFactory.GetCriteria(PostSchema).join(
  'publisher',
  publisherJoinCriteria,
);
```

### 2.2. Efficient Filtering with `withSelect: false`

The `JoinApplier` also implements a powerful optimization feature. You can decide whether a `JOIN` should be used to fetch data or only to filter the results.

- **`join('relation', joinCriteria, true)` (Default):**

  - **What it does:** Generates a `... JOIN ... SELECT ...`.
  - **Result:** The related entity (`relation`) is loaded and included in your results. Use this when you need the data from the joined table.

- **`join('relation', joinCriteria, false)` (Optimized):**
  - **What it does:** Generates a simple `... JOIN ...`.
  - **Result:** The `JOIN` is used to filter the main entity, but its fields are **not** selected. The `relation` property in your results will be `undefined`. This is highly efficient when you only need to check a condition on a related entity.

```typescript
// Example: Find all posts published by users named 'admin', but DON'T load the publisher object.

const publisherFilter = CriteriaFactory.GetInnerJoinCriteria(UserSchema).where({
  field: 'username',
  operator: FilterOperator.EQUALS,
  value: 'admin',
});

const criteria = CriteriaFactory.GetCriteria(PostSchema).join(
  'publisher',
  publisherFilter,
  false,
); // withSelect: false

// The resulting 'posts' will be filtered correctly,
// but `post.publisher` will be undefined for each post.
const posts = await qb.getMany();
```
