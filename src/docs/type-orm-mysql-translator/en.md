# TypeOrmMysqlTranslator

## 1. Main Purpose

The `TypeOrmMysqlTranslator` is the central class responsible for converting a `Criteria` object, which represents an abstract query, into a TypeORM `SelectQueryBuilder` specific to MySQL. It uses the Visitor pattern to traverse the `Criteria` structure and incrementally build the SQL query, delegating specialized tasks to helper classes to maintain cohesion and clarity.

## 2. Key Design Decisions

### 2.1. Use of the Visitor Pattern

- **Description:** The class extends `CriteriaTranslator` and implements the Visitor pattern to process the different nodes of a `Criteria` object (`RootCriteria`, `FilterGroup`, `JoinCriteria`, etc.).
- **Justification (The "Why"):**
  - **Separation of Concerns:** Allows the translation logic for each type of `Criteria` node to reside in its own `visit<NodeType>` method. This keeps the class organized and makes it easier to understand how each specific part of the query is translated.
  - **Extensibility:**
    - **New Criteria Nodes:** If new types of nodes are added to the `Criteria` in the future (e.g., a new type of `Join` or a `HAVING` clause), new `visit<NewNodeType>` methods can be added to the translator without drastically modifying existing code.
    - **New Operations:** If a new operation on `Criteria` objects were to be supported (besides SQL translation, for example, a complex validation), another `CriteriaVisitor` could be created without affecting the current translator.
  - **Maintainability:** Changes to the translation logic for a specific node type are isolated in their corresponding `visit` method, reducing the risk of introducing errors in other parts of the translation process.
  - **Alternatives Considered:** A series of nested `if/else` or `switch` statements could have been used to handle node types. However, this tends to generate larger, less cohesive classes that are harder to extend and maintain, especially as the number of node types and translation complexity grows. The Visitor pattern offers a more elegant and scalable solution.
- **Operation in this Context:**
  - The `translate` method (which internally calls `criteria.accept(this, ...)` on the `RootCriteria`) initiates the process.
  - Each `Criteria` node calls the translator's `accept` method, which in turn delegates to the appropriate `visit<NodeType>` method.
  - The TypeORM `SelectQueryBuilder` (`qb`) is passed as context through the visits, being progressively modified.
  - Other state data, such as accumulated `selects` and `orderBy` clauses, are managed as members of the `TypeOrmMysqlTranslator` class and updated during visits.

### 2.2. Internal State Management (Selects and OrderBy)

- **Description:** The class internally maintains a `Set<string>` for `this.selects` and an `Array` for `this.orderBy`.
- **Justification (The "Why"):**
  - **Centralized and Unified Accumulation:** Fields to be selected (`SELECT`) and ordering clauses (`ORDER BY`) can originate from both the `RootCriteria` and any nested `JoinCriteria`. Managing them centrally in the main translator allows for:
    - **Consistency in `SELECT`:** Ensuring that all necessary fields (explicitly selected, required by `ORDER BY`, or by `cursor`) are included in the final `SELECT` clause. Using a `Set` for `this.selects` prevents field duplication.
    - **Global Ordering:** Applying all `ORDER BY` clauses to the `QueryBuilder` once at the end of the process, respecting the `sequenceId` defined in each `Order` to ensure the correct order among different ordering directives from various parts of the `Criteria`.
  - **Reset per Translation:** These states (`this.selects`, `this.orderBy`, and the `parameterManager`) are reset at the beginning of each call to `visitRoot`. This is crucial to ensure that each translation of a `Criteria` object is independent and not affected by the states of previous translations, allowing the translator instance to be reused if necessary (though a new instance is generally created for each `Criteria` to be translated).

### 2.3. Delegation to Helper Classes

- **Description:** Much of the specific logic for building SQL fragments, managing parameters, applying joins, and structuring the query is delegated to specialized classes:
  - `TypeOrmParameterManager`: SQL parameter name management.
  - `TypeOrmFilterFragmentBuilder`: Construction of SQL fragments for each `FilterOperator`.
  - `TypeOrmQueryStructureHelper`: Application of conditions, `Brackets`, resolution of `SELECT`s, and cursor-based pagination logic.
  - `TypeOrmJoinApplier`: Application of `JOIN`s and their `ON` conditions.
- **Justification (The "Why"):**
  - **Single Responsibility Principle (SRP):** Each helper class focuses on a specific task. This makes the main `TypeOrmMysqlTranslator` more cohesive, focusing on orchestrating the visit process and the general application of `Criteria` parts, rather than housing all low-level logic.
  - **Logic Reusability:** Certain logics are common to different parts of the process. For example, building filter fragments (`TypeOrmFilterFragmentBuilder`) is necessary for both the main `WHERE` clause and the `ON` conditions of `JOIN`s. Helpers allow this logic to be reused without duplication.
  - **Isolated Testability:** Each helper can be tested unitarily and in isolation, significantly simplifying the creation and maintenance of tests and increasing confidence in the correctness of each component.
  - **Readability and Maintainability:** Reduces the amount of code and cyclomatic complexity within the `TypeOrmMysqlTranslator` class, making it easier to understand, modify, and maintain.
  - **Encapsulation of Specific Complexity:**
    - **Filter Operator Translation (`TypeOrmFilterFragmentBuilder`):** Translating each `FilterOperator` (e.g., `EQUALS`, `LIKE`, `SET_CONTAINS`, `JSON_CONTAINS`) into its specific MySQL SQL syntax, including handling `NULL`s or functions like `FIND_IN_SET`, is a specialized task. Delegating it allows `TypeOrmMysqlTranslator` not to need to know these intimate MySQL details. For example, translating `SET_CONTAINS` to `(field IS NOT NULL AND FIND_IN_SET(?, field) > 0)` and `SET_NOT_CONTAINS` to `(field IS NULL OR FIND_IN_SET(?, field) = 0)` encapsulates the logic to correctly handle `NULL`s in MySQL `SET` type fields.
    - **Cursor Pagination Logic (`TypeOrmQueryStructureHelper`):** Cursor-based pagination is more complex than simple `OFFSET/LIMIT`, as it requires building a `WHERE` clause that compares multiple fields (e.g., `(field1 > :value1) OR (field1 = :value1 AND field2 > :value2)`). This logic, including correct parameter generation and handling cursor direction (ASC/DESC), is encapsulated in `TypeOrmQueryStructureHelper`.

## 3. General Flow of Operation

1.  **Start (`visitRoot`):**
    - **State Reset:** `parameterManager`, `this.selects`, and `this.orderBy` are reset to ensure a clean translation.
    - **Initial `SELECT`s Resolution:** `queryStructureHelper.resolveSelects(criteria, this.selects)` is invoked.
      - **Why:** This delegation ensures that if the `RootCriteria` has specific field selections (`criteria.select`), fields necessary for `ORDER BY` clauses and for the `cursor` (if defined) are also automatically included in `this.selects`. This is vital because databases require fields used in `ORDER BY` to be present in the selection (especially if `DISTINCT` were used or for predictable behavior).
2.  **Processing `rootFilterGroup`:**
    - If filters exist in the `RootCriteria`, they are wrapped in a TypeORM `Brackets`.
      - **Why:** This ensures the correct precedence of logical operators (`AND`/`OR`) within the main `WHERE` clause, avoiding ambiguities.
    - The `rootFilterGroup` calls its `accept(this, criteria.alias, bracketQb)` method, which in turn invokes `visitAndGroup` or `visitOrGroup` on the translator.
3.  **Processing `visitAndGroup` / `visitOrGroup`:**
    - They delegate to `queryStructureHelper.processGroupItems` to iterate over the group's items (individual filters or nested groups).
    - For each `Filter`:
      - `visitFilter(filter, currentAlias)` is called, which in turn delegates to `filterFragmentBuilder.build(filter, currentAlias)`.
        - **Why `filterFragmentBuilder.build`:** This is the key piece for translating individual operators. `TypeOrmFilterFragmentBuilder` contains the specific logic to convert each `FilterOperator` (e.g., `EQUALS`, `LIKE`, `SET_CONTAINS`, `JSON_CONTAINS`) into its corresponding MySQL SQL fragment and associated parameters. For example, for `SET_CONTAINS`, it generates `(field_name IS NOT NULL AND FIND_IN_SET(:param, field_name) > 0)`. This encapsulation is crucial for maintainability and for supporting MySQL's diverse operators.
      - The resulting fragment and parameters are applied to the `QueryBuilder` using `queryStructureHelper.applyConditionToQueryBuilder`.
    - For nested `FilterGroup`s, a new `Brackets` is created, and the corresponding `visit` method of the nested group is called recursively, maintaining the logical structure.
4.  **Applying the Cursor:**
    - If a `cursor` exists in the `RootCriteria`:
      - The cursor condition is built by delegating to `queryStructureHelper.buildCursorCondition(criteria.cursor, criteria.alias)`.
        - **Why `queryStructureHelper.buildCursorCondition`:** The logic to generate a cursor condition (e.g., `(field1 > :val1) OR (field1 = :val1 AND field2 > :val2)`) is complex and depends on the number of cursor fields and the direction (ASC/DESC). This delegation encapsulates that complexity.
      - This condition is added to the `QueryBuilder` (with `AND` if there was already a main `WHERE` clause, within a new `Brackets` to isolate it).
      - The cursor's implicit `ORDER BY` clauses are added directly to the `QueryBuilder`.
        - **Why:** The cursor's `ORDER BY` clauses must be applied immediately and with the same direction as the cursor for pagination to work correctly. These take precedence over other explicitly defined `ORDER BY` clauses if a cursor is present.
5.  **Accumulating `ORDER BY` from `RootCriteria`:**
    - Explicit `orderBy` clauses from the `RootCriteria` are added to the `this.orderBy` list for later global processing.
6.  **Applying `TAKE` and `SKIP`:**
    - They are applied to the `QueryBuilder` if defined. `SKIP` is only applied if no `cursor` is defined, as cursor-based pagination and `SKIP`-based pagination are mutually exclusive.
7.  **Processing `JOIN`s:**
    - Iterates over the `joins` defined in the `RootCriteria`.
    - Each `JoinCriteria` calls its `accept(this, joinDetail.parameters, qb)` method, which invokes the corresponding `visit<JoinType>Join` method on the translator (e.g., `visitInnerJoin`, `visitLeftJoin`).
    - These methods delegate the main join application logic to `joinApplier.applyJoinLogic(...)`.
      - **Why `joinApplier.applyJoinLogic`:** Applying `JOIN`s involves constructing the relation (`parent_alias.relationProperty`), the join alias, and the `ON` condition. The `ON` condition can be complex and contain its own filters and logical groups, so `joinApplier` reuses `filterFragmentBuilder` and `queryStructureHelper` to build it.
      - `joinApplier` applies the `JOIN` to the `QueryBuilder` (using TypeORM's `innerJoinAndSelect` or `leftJoinAndSelect`).
        - **Why `...AndSelect`:** `...AndSelect` is used so TypeORM automatically selects all fields from the joined entity and hydrates them correctly. Fine-grained management of which specific fields are selected is handled via `this.selects`.
      - `joinApplier` (via `queryStructureHelper.resolveSelects`) adds the selected fields from the `JoinCriteria` to `this.selects`.
      - `joinApplier` also handles the optimization of not selecting the foreign key on the "many" side of a `many-to-one` relationship if the "one" entity is already being selected, to avoid redundancy.
      - `ORDER BY` clauses defined in the `JoinCriteria` are added to the global `this.orderBy` list.
    - Nested joins within each `JoinCriteria` (a join on another already joined entity) are processed recursively.
8.  **Finalization:**
    - **Global `ORDER BY` Sorting:** All `ORDER BY` clauses accumulated in `this.orderBy` (from `RootCriteria` and all `JoinCriteria`) are sorted by their `sequenceId`.
      - **Why:** This allows the user to define a global application order for ordering clauses, regardless of where they were defined in the `Criteria` structure.
    - **Applying Final `ORDER BY`s:** The sorted `ORDER BY` clauses are applied to the `QueryBuilder`, only if a cursor was not used (as the cursor imposes its own ordering).
    - **Applying Final `SELECT`:** The final `SELECT` clause is applied to the `QueryBuilder` using all unique fields accumulated in `this.selects`.
      - **Why at the end:** Applying the `SELECT` once at the end, after processing all joins and resolving all field dependencies (from `ORDER BY` or `cursor`), ensures that all necessary fields, and only those, are selected efficiently.
    - The modified `SelectQueryBuilder` is returned.

## 4. Key Implementation Points / Considerations

- **Alias Handling (`currentAlias`):** It is crucial to pass and use the correct `currentAlias` in each `visit` method and when interacting with helpers. This ensures that fields in SQL fragments refer to the correct table/entity, especially in queries with multiple joins where the same field name might exist in different entities.
- **`ParameterManager` Reset:** It is reset in `visitRoot` so that each complete translation of a `Criteria` starts with a clean parameter counter (e.g., `:param_0`, `:param_1`, ...). This prevents parameter name collisions if more than one `Criteria` is translated with the same translator instance (although the common and recommended practice is to create a new translator instance for each `Criteria` to be translated).
- **`OuterJoin` (Limitation):** The visit method for `OuterJoinCriteria` throws an error.
  - **Why:** `FULL OUTER JOIN` is not directly supported by MySQL in the same way as in other DBMSs (like PostgreSQL or Oracle). Implementing a generic emulation of `FULL OUTER JOIN` in MySQL (usually via `UNION` of `LEFT JOIN` and `RIGHT JOIN` with anti-join conditions) is outside the current scope of this translator due to its complexity and potential impact on performance and the structure of the query generated by TypeORM. Direct and efficient translation of common capabilities is prioritized.
- **Impact of `...AndSelect` in Joins:** The use of `innerJoinAndSelect` and `leftJoinAndSelect` by `TypeOrmJoinApplier` simplifies the hydration of related entities by TypeORM. However, it implies that by default, all fields from the joined entity are selected. If a more granular selection of fields from joined entities is required, the `Criteria` must specify it via `JoinCriteria.setSelect()`, and the translator will reflect this in the final `SELECT` clause.
