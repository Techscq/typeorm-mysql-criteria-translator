# TypeOrmJoinApplier

## 1. Main Purpose

The `TypeOrmJoinApplier` is a specialized helper class for applying `JOIN` clauses (`INNER JOIN`, `LEFT JOIN`) to a TypeORM `SelectQueryBuilder`. Its responsibilities include:

- Determining the type of `JOIN` to apply.
- Constructing the relation property or table name for the `JOIN`.
- Generating the `ON` condition for the `JOIN`, which can include complex filters and logical groups, by delegating this task to `TypeOrmQueryStructureHelper`.
- Invoking the appropriate `JOIN` method on the `QueryBuilder` (e.g., `innerJoinAndSelect`, `leftJoinAndSelect`).
- Managing the addition of selected fields and `ORDER BY` clauses from the `JoinCriteria` to the translator's global state.
- Applying specific optimizations, such as excluding redundant foreign keys in certain types of joins.

## 2. Key Design Decisions

### 2.1. Encapsulation of `JOIN` Logic

- **Description:** All logic for processing a `JoinCriteria` and applying it to the `QueryBuilder` is concentrated in the `applyJoinLogic` method of this class.
- **Justification (The "Why"):**
  - **Complexity of `JOIN`s:** `JOIN` logic can be intricate. Isolating this complexity in a dedicated class keeps the `TypeOrmMysqlTranslator` cleaner and focused on the overall Visitor orchestration.
  - **SRP and Cohesion:** Allows `TypeOrmJoinApplier` to focus solely on `JOIN` aspects.
  - **Testability:** Allows for more isolated testing of the join application logic.

### 2.2. Construction of `ON` Conditions via `TypeOrmQueryStructureHelper`

- **Description:** To construct the `ON` condition string and its parameters from the `JoinCriteria`'s `rootFilterGroup`, `TypeOrmJoinApplier` now delegates this task to the `buildConditionStringFromGroup` method of `TypeOrmQueryStructureHelper`.
- **Justification (The "Why"):**
  - **Consistency and Code Reusability (DRY):** `TypeOrmQueryStructureHelper.buildConditionStringFromGroup` (and the internal logic it uses, similar to `processGroupItems`) already contains robust logic for converting a `FilterGroup` structure into an SQL condition, including handling individual `Filter`s, nested `FilterGroup`s, and the correct application of `AND`/`OR` logic with parentheses. Reusing this logic avoids duplicate implementations and ensures `ON` conditions are processed with the same robustness as main `WHERE` clauses.
  - **Increased Robustness for Complex `ON` Conditions:** By centralizing `FilterGroup` processing in `TypeOrmQueryStructureHelper`, any future improvements or fixes to that logic automatically benefit both `WHERE` clauses and `JOIN` `ON` conditions.
  - **Simplified Maintainability:** Having a single, well-tested way to process `FilterGroup`s reduces the codebase to maintain and test.
  - **Flexibility in `ON`:** Allows `JOIN` `ON` conditions to be as expressive as `WHERE` clauses, supporting complex filters and nested logical groups.

### 2.3. Use of TypeORM's `...AndSelect` Methods

- **Description:** To apply joins, methods like `qb.innerJoinAndSelect()` or `qb.leftJoinAndSelect()` are used.
- **Justification (The "Why"):**
  - **Automatic Entity Hydration:** These TypeORM methods not only add the `JOIN` clause to the SQL but also handle selecting _all_ fields from the joined entity and correctly hydrating the relationship in the resulting entity.
  - **Subsequent Fine-Grained Management:** Although `...AndSelect` selects everything by default for the joined entity, `TypeOrmJoinApplier` then calls `queryStructureHelper.resolveSelects(criteria, selects)` with the `JoinCriteria`. If this `JoinCriteria` has a `setSelect()` with specific fields, those fields will be added to the translator's global `this.selects` `Set`. The final `SELECT` clause of the global query will be built from this `Set`, allowing for a more granular final selection.

### 2.4. Foreign Key Selection Optimization in `many-to-one`

- **Description:** After applying the `JOIN` and resolving the `SELECT`s from the `JoinCriteria`, if the relationship is of type `many_to_one` (from the perspective of the join's parent entity), the foreign key on the "parent" side is explicitly removed from the global `selects` `Set`.
- **Justification (The "Why"):**
  - **Avoid Data Redundancy:** When joining to the "one" side of a `many-to-one` relationship, the primary key information of that "one" entity is already available. Selecting the foreign key on the "many" entity as well would be redundant.
  - **Cleaner Result:** Can lead to a cleaner result object.

### 2.5. Accumulation of `ORDER BY` from the Join

- **Description:** `orderBy` clauses defined within a `JoinCriteria` are added to the `TypeOrmMysqlTranslator`'s global `this.orderBy` list.
- **Justification (The "Why"):**
  - **Consistent Global Ordering:** Allows the final query ordering to depend on fields from both the root entity and any of the joined entities.
  - **Respect for `sequenceId`:** By accumulating all `ORDER BY` clauses in a centralized list and then sorting them by `sequenceId` before application, it ensures the user has control over precedence.

## 3. General Flow of Operation (`applyJoinLogic`)

1.  **Get Alias and Relation Name:** The `joinAlias` and `targetTableNameOrRelationProperty` are determined.
2.  **Construct `ON` Condition:**
    - If the `JoinCriteria` has filters in its `rootFilterGroup`, `this.queryStructureHelper.buildConditionStringFromGroup(...)` is invoked to generate the `onConditionClause` and `onConditionParams`.
3.  **Apply Base `JOIN`:**
    - The base TypeORM method (`qb.innerJoinAndSelect` or `qb.leftJoinAndSelect`) is selected.
    - This method is called with the relation, join alias, and the `ON` condition (if it exists).
4.  **Resolve `SELECT`s from Join:**
    - `queryStructureHelper.resolveSelects(criteria, selects)` is called.
5.  **FK Optimization in `many-to-one`:**
    - If applicable, the parent's foreign key is removed from the global `selects` `Set`.
6.  **Accumulate `ORDER BY` from Join:**
    - `Order`s from the `JoinCriteria` are added to the global `orderBy` list.
7.  The modified `SelectQueryBuilder` is returned.

## 4. Implementation Considerations

- **Handling Pivot Tables (Many-to-Many):** TypeORM handles the creation of `JOIN`s through the pivot table internally. `ON` conditions specified in the `JoinCriteria` would apply to the `JOIN` between the pivot table and the final joined entity.
- **Aliases in `ON` Conditions:** It's crucial that `buildConditionStringFromGroup` uses the correct `joinAlias` when constructing filter fragments for the `ON` condition.
