# TypeOrmConditionBuilder

## 1. Main Purpose

The `TypeOrmConditionBuilder` is a specialized helper that acts as the "logic master" for query conditions. Its primary role is to translate the filter structures from your `Criteria` object into valid SQL conditions for MySQL.

It has two main responsibilities:

1.  Building the main `WHERE` clause for your root query.
2.  Building the `ON` conditions for your `JOIN` clauses.

It ensures that all logical groupings (`AND`/`OR`) are correctly handled with parentheses to maintain the integrity of your query logic.

## 2. How It Works

### 2.1. Building `WHERE` and `ON` clauses

The core of this component is its ability to process a `FilterGroup`. It recursively walks through the filters and any nested groups.

- **For individual filters (`Filter`)**: It delegates the task to the `TypeOrmFilterFragmentBuilder`, which knows the specific MySQL syntax for each operator (`EQUALS`, `CONTAINS`, etc.).
- **For nested groups (`FilterGroup`)**: It uses TypeORM's `Brackets` functionality. This is crucial because it wraps the nested conditions in parentheses `()`, ensuring that the `AND`/`OR` logic works as expected. For example, it correctly translates `(A AND B) OR C` instead of the incorrect `A AND B OR C`.

### 2.2. Building Cursor Pagination Conditions

This component also contains the complex logic for keyset (cursor-based) pagination. It generates the necessary `WHERE` clause to fetch the next page of results based on the values from the last item of the previous page.

For example, for a cursor ordered by `created_at` and `uuid`, it generates a condition like:

```mysql
(
  (posts.created_at > :cursor_created_at) OR
  (posts.created_at = :cursor_created_at AND posts.uuid > :cursor_uuid)
)
```

This is significantly more complex than simple `OFFSET` pagination and is fully encapsulated within this helper.

## 3. Usage Notes

- You don't typically interact with this component directly. The main `TypeOrmMysqlTranslator` uses it internally to apply the `WHERE` clause.
- The `TypeOrmJoinApplier` also uses it to generate the `ON` conditions for each `JOIN`.
- The logic is consistent for both `WHERE` and `ON` clauses, meaning you can use the same rich filtering capabilities in your joins as you do in your main query.
