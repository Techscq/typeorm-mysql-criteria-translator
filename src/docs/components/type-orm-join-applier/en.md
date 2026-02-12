# TypeOrmJoinApplier

## 1. Main Purpose

The `TypeOrmJoinApplier` is the specialized helper responsible for applying `JOIN` clauses to the query. It acts as the "join expert," taking the relationship information defined in your `CriteriaSchema` and translating it into the correct `INNER JOIN` or `LEFT JOIN` in the final SQL.

Its main goal is to make joins simple and declarative for the user, while also providing powerful options for query optimization.

## 2. How It Works

This component is responsible for several key features of the translator's join system.

### 2.1. Declarative, Schema-Based Joins & Alias Resolution

The core principle is that you **define your relationships once** in the `CriteriaSchema` and then simply refer to them by their alias. The `JoinApplier` handles the rest.

When you make a call like `.join('publisher', ...)`:

1.  The translator provides the `JoinApplier` with the `publisher` relationship details that it found in your schema.
2.  **Alias Resolution:** The `JoinApplier` checks if the requested alias is already in use in the query. If it is (e.g., in a self-join or a complex nested structure), it automatically generates a unique alias (e.g., `publisher_1`) to prevent SQL errors.
3.  The `JoinApplier` uses this information (target table, local key, relation key, unique alias) to construct the correct `JOIN` clause.
4.  It also uses the `TypeOrmConditionBuilder` to translate any filters you've defined within the join's `Criteria` into the `ON` condition of the `JOIN`.

This means your business logic stays clean and free of database-specific details and alias management headaches.

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

### 2.2. Flexible Selection Strategies (`SelectType`)

The `JoinApplier` implements a powerful optimization feature through the `SelectType` option. You can decide exactly how a `JOIN` should behave regarding data retrieval.

- **`SelectType.FULL_ENTITY` (Default):**
  - **What it does:** Generates a `... JOIN ...` and adds the joined alias to the `SELECT` clause.
  - **Result:** The related entity (`relation`) is fully loaded and hydrated in your results. Use this when you need to access the properties of the joined object.

- **`SelectType.ID_ONLY` (Optimized):**
  - **What it does:**
    - **Optimization Check:** It checks if the join can be skipped entirely. This happens ONLY if:
      1.  We are on the "Owning Side" of the relation (we hold the Foreign Key).
      2.  There are no filters on the joined entity.
      3.  There are no nested joins on the joined entity.
      4.  There is no ordering on the joined entity.
    - **If Optimized:** It simply selects the local foreign key column (e.g., `post.user_uuid`) and avoids the `JOIN` completely.
    - **If Not Optimized:** It delegates to TypeORM's `loadAllRelationIds` mechanism to fetch the IDs separately.
  - **Result:** Only the ID (or array of IDs) of the relation is loaded. This is extremely efficient when you only need the reference ID and not the full object.

- **`SelectType.NO_SELECTION` (Filtering Only):**
  - **What it does:** Generates the `... JOIN ...` but does **not** add the alias to the `SELECT` clause.
  - **Result:** The `JOIN` is used purely to filter the main entity based on conditions in the joined table. The `relation` property in your results will be `undefined` (or empty). This avoids the overhead of hydrating objects you don't intend to use.

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
  { select: SelectType.NO_SELECTION },
);

// The resulting 'posts' will be filtered correctly,
// but `post.publisher` will be undefined for each post.
const posts = await qb.getMany();
```
