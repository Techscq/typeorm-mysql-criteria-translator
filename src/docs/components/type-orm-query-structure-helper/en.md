# TypeOrmQueryStructureHelper

## 1. Main Purpose

The `TypeOrmQueryStructureHelper` is a helper class that encapsulates the logic for manipulating the structure of a TypeORM `SelectQueryBuilder`. Its primary responsibilities include:

- Resolving and applying `SELECT` clauses, ensuring all necessary fields (explicit, for ordering, or for cursor) are included.
- Building and applying conditions for cursor-based pagination.
- Processing filter groups (`FilterGroup`) for the main `WHERE` clause, correctly applying TypeORM `Brackets` and logical connectors (`AND`/`OR`) directly to the `QueryBuilder`.
- **Generating an SQL condition string and its parameters from a `FilterGroup`, for use in contexts like `JOIN ON` clauses.**
- Applying individual filter conditions to the `QueryBuilder`.

It acts as an assistant to `TypeOrmMysqlTranslator` and `TypeOrmJoinApplier`, centralizing common query modification and construction logic.

## 2. Key Design Decisions

### 2.1. Centralized `SELECT`s Resolution

- **Description:** The `resolveSelects` method takes an `ICriteriaBase` (which can be a `RootCriteria` or a `JoinCriteria`) and a `Set<string>` (representing the global set of fields to be selected for the entire query).
- **Justification (The "Why"):**
  - **Avoiding Redundant Selections and Ensuring Necessary Fields:**
    - If `criteria.select` is empty (indicating "select all" for that entity/alias), no specific fields are added to the global `Set` at this point. The logic in `TypeOrmJoinApplier` (using `innerJoinAndSelect` or `leftJoinAndSelect`) and the final application of `qb.select(Array.from(this.selects.values()))` in `TypeOrmMysqlTranslator` will handle selecting all fields of the entity or the fields explicitly added to the global `Set`.
    - If `criteria.select` has specific fields, this method ensures that, in addition to those explicit fields, the following are also included in the global `Set`:
      1.  **`ORDER BY` Fields:** Fields used in the `orderBy` clauses of the current `criteria`. This is vital because many databases (including MySQL under certain conditions or to avoid ambiguity) require fields being ordered by to be present in the `SELECT` list.
      2.  **`cursor` Fields:** Fields used in the `cursor` definition of the current `criteria`. Similar to `ORDER BY`, these fields must be available for cursor-based pagination logic to work correctly.
  - **Global vs. Local Management:** By passing the global `Set` (`this.selects` from the main translator), it ensures that all selection needs from all parts of the `Criteria` (root and joins) are consolidated in one place before applying the final `SELECT` to the query.
  - **Optimization in `many_to_one` (handled by `TypeOrmJoinApplier`):** Although `resolveSelects` adds fields, `TypeOrmJoinApplier` has subsequent logic to _remove_ the foreign key from the "parent" side of a `many-to-one` relationship from the global `selects` `Set` if the "child" entity (the "one" side) is already being selected. This avoids redundancy (e.g., not selecting `post.user_uuid` if `user.uuid` is already being selected via a join to `user`). `resolveSelects` is not responsible for this removal, but for the initial addition.

### 2.2. Construction of Cursor-Based Pagination Conditions (`buildCursorCondition`)

- **Description:** This method takes a `Cursor` object and the current entity's alias to generate the SQL fragment and necessary parameters for cursor-based pagination. It supports cursors with one or two fields.
- **Justification (The "Why"):**
  - **Encapsulation of Complex Logic:** Keyset pagination (cursor-based) is more complex than simple `OFFSET/LIMIT`. The generated `WHERE` condition depends on the number of cursor fields and the ordering direction.
    - **Single-field cursor:** `(field1 > :value1)` or `(field1 < :value1)`
    - **Two-field cursor:** `((field1 > :value1) OR (field1 = :value1 AND field2 > :value2))` or its equivalent for `LESS_THAN`.
  - **Operator Handling:** The method translates the `FilterOperator.GREATER_THAN` or `FilterOperator.LESS_THAN` from the cursor into the corresponding SQL operator (`>` or `<`).
  - **Parameter Generation:** It uses `TypeOrmParameterManager` to generate unique parameter names for cursor values, maintaining security and consistency.
  - **Reusability:** Centralizes this logic so `TypeOrmMysqlTranslator` can simply request it.
  - **Current Limitation:** The current implementation explicitly supports cursors of one or two fields. Extending it to more fields would require generalizing the tuple comparison construction logic. The decision to limit it to two fields is based on it being a common use case and keeping the implementation relatively simple. For more than two fields, the complexity of the nested `OR` clause increases significantly.

### 2.3. Processing Filter Groups for `WHERE` (`processGroupItems` and `applyConditionToQueryBuilder`)

- **Description:**
  - `processGroupItems`: Iterates over the items of a `FilterGroup`. For individual filters, it delegates fragment construction to `TypeOrmFilterFragmentBuilder` and then uses `applyConditionToQueryBuilder` to add it to the `QueryBuilder`. For nested groups, it creates a new TypeORM `Brackets` and recursively calls the translator's `visitAndGroup` or `visitOrGroup` method (passed as `visitor`).
  - `applyConditionToQueryBuilder`: Adds a condition (either a string fragment or a `Brackets`) to the `QueryBuilder` using `qb.where()`, `qb.andWhere()`, or `qb.orWhere()` depending on whether it's the first condition in the current bracket and the group's logical connector.
- **Justification (The "Why"):**
  - **Correct Application of `Brackets` and `AND`/`OR` Logic:**
    - Using TypeORM `Brackets` (`new Brackets((subQb) => { ... })`) is essential for grouping conditions and ensuring the correct precedence of `AND` and `OR` operators in the generated SQL query. For example, to translate `(A AND B) OR C`, the `(A AND B)` must be enclosed in parentheses.
    - `processGroupItems` handles the logic of whether a condition should be joined with `AND` or `OR` based on the `logicalOperator` of the `FilterGroup` being processed.
    - Recursion via the `visitor` for nested groups ensures that the hierarchical structure of the `Criteria` is correctly reflected in the SQL query with nested parentheses.
  - **Decoupling:** `TypeOrmMysqlTranslator` doesn't need to worry about the details of how conditions are added (`where` vs. `andWhere` vs. `orWhere`) or how `Brackets` are handled; it simply delegates this task.
  - **Reusability:** This group processing logic is used for both the `rootFilterGroup` of the `RootCriteria` and the `rootFilterGroup` of `JoinCriteria` (which form part of the join's `ON` condition).

### 2.4. Building Condition Strings from Filter Groups (`buildConditionStringFromGroup`)

- **Description:** The `buildConditionStringFromGroup` method takes a `FilterGroup` and an alias, and returns an object with a `conditionString` (the SQL fragment) and its `parameters`. It's designed to generate conditions that can be used in contexts where they are not directly applied to a main `QueryBuilder`, such as `JOIN ON` clauses.
- **Justification (The "Why"):**
  - **Reusability for `ON` Conditions:** This function was introduced to centralize the logic of converting a `FilterGroup` to an SQL string, allowing `TypeOrmJoinApplier` to use it for constructing `JOIN ON` conditions.
  - **Consistency and DRY:** Ensures that the processing of `FilterGroup` structure (handling individual `Filter`s, nested `FilterGroup`s, `AND`/`OR` operators, and parentheses) is consistent, whether for applying to a `QueryBuilder` (via `processGroupItems`) or for generating a string (via `buildConditionStringFromGroup`).
  - **Encapsulation:** Keeps the logic for building condition strings within the helper responsible for query structure, rather than having it duplicated or simplified in `TypeOrmJoinApplier`.
  - **Internal Recursion Handling:** Unlike `processGroupItems` which uses the `visitor` pattern for recursion into subgroups (by calling the translator's `visitAndGroup`/`visitOrGroup`), `buildConditionStringFromGroup` handles recursion for subgroups internally to build the string autonomously.

## 3. General Flow of Operation (Key Methods)

### `resolveSelects`

1.  Checks if `criteria.select` (explicitly selected fields for the current alias) has elements.
2.  If so (explicit selection):
    - Adds each field from `criteria.orders` to the global `selectsSet` (qualified with `criteria.alias`).
    - If `criteria.cursor` exists, adds each field from `criteria.cursor.filters` to the global `selectsSet`.
    - Adds each field from `criteria.select` to the global `selectsSet`.
3.  If `criteria.select` is empty, no explicit fields are added to `selectsSet` from this method for this alias (it assumes "select all" for this alias, which is handled globally or by the `...AndSelect` of joins).

### `buildCursorCondition`

1.  Gets the primitive filters from the `cursor`.
2.  Takes the first filter to determine the operator (`>` or `<`) and the first field/value.
3.  Generates a parameter name for the first value and constructs the initial SQL fragment: `(field1 > :param1)`.
4.  If there's a second filter in the cursor:
    - Generates a parameter name for the second value.
    - Modifies the SQL fragment to include tuple logic: `((field1 > :param1) OR (field1 = :param1 AND field2 > :param2))`.
5.  Returns the `queryFragment` and the `parameters` object.

### `processGroupItems` (for `WHERE` clauses)

1.  Iterates over each `item` in `items` (filters or subgroups).
2.  Determines if it's the first item in the current bracket.
3.  If `item` is a `Filter`:
    - Calls `filterFragmentBuilder.build()` to get the SQL fragment and parameters.
    - Calls `applyConditionToQueryBuilder()` to add it to the `qb`.
4.  If `item` is a `FilterGroup` (nested):
    - Creates a `new Brackets((subQb) => { ... })`.
    - Inside the `Brackets` callback, calls the `visitAndGroup` or `visitOrGroup` method of the `visitor` (which is the `TypeOrmMysqlTranslator` instance), passing the `subQb`. This enables recursion.
    - Calls `applyConditionToQueryBuilder()` to add the nested `Brackets` to the current `qb`.

### `applyConditionToQueryBuilder`

1.  If `isFirstInThisBracket` is `true`, uses `qb.where(conditionOrBracket, parameters)`.
2.  Else, if `logicalConnector` is `AND`, uses `qb.andWhere(conditionOrBracket, parameters)`.
3.  Else, if `logicalConnector` is `OR`, uses `qb.orWhere(conditionOrBracket, parameters)`.

### `buildConditionStringFromGroup` (for `ON` clauses or other string contexts)

1.  If the filter group is empty, returns `undefined`.
2.  Initializes an array for condition strings and an object for all parameters.
3.  Defines an internal recursive function (`processItemRecursive`):
    - If the item is a `Filter`:
      - Calls `this.filterFragmentBuilder.build()` to get the SQL fragment and parameters.
      - Adds the parameters to the `allParams` object.
      - Returns the `queryFragment`.
    - If the item is a `FilterGroup` (nested):
      - Recursively calls `processItemRecursive` for each item in the subgroup.
      - Joins the resulting sub-conditions with the subgroup's logical operator (`AND` or `OR`) and wraps them in parentheses.
      - Returns the subgroup string.
4.  Iterates over the main group's items, calling `processItemRecursive` for each and collecting the resulting conditions.
5.  If no conditions were generated, returns `undefined`.
6.  Joins the main conditions with the main group's logical operator.
7.  Returns an object with the final `conditionString` and the consolidated `allParams` object.

## 4. Implementation Considerations

- **Dependency on `visitor` in `processGroupItems`:** The `processGroupItems` method needs a reference to the main translator's `visitAndGroup` and `visitOrGroup` methods to handle recursion for nested groups. This is achieved by passing the translator itself (`this` from `TypeOrmMysqlTranslator`) as the `visitor` parameter.
- **`QueryBuilder` Handling in `Brackets`:** TypeORM provides a new `QueryBuilder` (or a proxy) within the `Brackets` callback. Conditions added to this `subQb` are correctly enclosed in parentheses in the main query.
- **Parameter Security:** Delegation to `TypeOrmFilterFragmentBuilder` and consistent use of `TypeOrmParameterManager` are fundamental to ensuring all filter values are treated as parameters, preventing SQL injection.
- **Recursion in `buildConditionStringFromGroup`:** This method handles recursion for nested groups internally, unlike `processGroupItems` which relies on the visitor pattern. This makes it more autonomous for the specific task of generating a condition string.
