# TypeOrmFilterFragmentBuilder

## 1. Main Purpose

The `TypeOrmFilterFragmentBuilder` is responsible for translating an individual `Filter` object (which contains a field, an operator, and a value) into its corresponding SQL condition fragment for MySQL and the associated parameters. It handles the specific logic for each supported `FilterOperator`, ensuring that the generated SQL syntax is correct and secure against SQL injection through the use of parameters.

## 2. Key Design Decisions

### 2.1. Centralization of Operator Translation Logic

- **Description:** All logic for converting a specific `FilterOperator` (e.g., `EQUALS`, `LIKE`, `SET_CONTAINS`, `JSON_CONTAINS`) into SQL resides within this class, typically in dedicated private methods (`handleBasicComparison`, `handleSetContains`, `handleJsonContains`, etc.). The public `build` method acts as a dispatcher, invoking the appropriate internal handler based on the filter's operator.
- **Justification (The "Why"):**
  - **Cohesion and Single Responsibility Principle (SRP):** Keeps operator translation logic concentrated in one place. This simplifies the `TypeOrmMysqlTranslator` class (the main consumer), as it only needs to delegate filter fragment construction without knowing the details of each operator.
  - **Maintainability:** If MySQL's syntax for an operator changes, a more efficient translation method is discovered, or a bug in an operator's translation needs fixing, the change is made in a single, well-defined place within this class.
  - **Extensibility:** Adding support for a new `FilterOperator` primarily involves:
    1.  Adding a new case to the `switch` statement in the `build` method.
    2.  Implementing a new private `handle<NewOperator>` method containing the specific translation logic.
        This minimizes impact on other parts of the system.
  - **Clarity and Readability:** Makes it easier to understand how each specific operator is translated, as the logic is encapsulated and not dispersed.

### 2.2. Interaction with `TypeOrmParameterManager`

- **Description:** The `TypeOrmFilterFragmentBuilder` constructor receives an instance of `TypeOrmParameterManager`. Whenever a parameter is needed in an SQL fragment, `parameterManager.generateParamName()` is used to obtain a unique parameter name (e.g., `:param_0`, `:param_1`).
- **Justification (The "Why"):**
  - **SQL Collision Prevention and Security:** Ensures all parameter names in the final SQL query are unique. This is crucial for avoiding SQL errors and, fundamentally, for preventing SQL injection vulnerabilities, as filter values are passed as parameters rather than being directly interpolated into the SQL string.
  - **Abstraction of Name Generation:** `TypeOrmFilterFragmentBuilder` doesn't need to worry about the strategy for generating names or the state of the parameter counter; it simply requests a unique name when needed.

### 2.3. Specific Operator Handling (Detailed "Why" Examples)

This section details the logic and reasons behind the translation of more complex operators.

#### 2.3.1. `SET_CONTAINS` and `SET_NOT_CONTAINS` Operators (for TypeORM `simple-array` fields, which map to `SET` or `VARCHAR` in MySQL)

- **MySQL Behavior for `SET` and `FIND_IN_SET`:**
  - The `SET` type in MySQL stores a string where allowed values are defined, and selected values are saved comma-separated.
  - The `FIND_IN_SET(needle, haystack)` function returns the 1-based position of the string `needle` within the string `haystack` (which is a comma-separated list of strings). It returns `0` if `needle` is not in `haystack` or if `haystack` is an empty string. It returns `NULL` if `needle` or `haystack` is `NULL`.
- **Translation of `SET_CONTAINS`:**
  - **Generated SQL Fragment:** `(${fieldName} IS NOT NULL AND FIND_IN_SET(:${paramName}, ${fieldName}) > 0)`
  - **Justification (The "Why"):**
    - `FIND_IN_SET(:${paramName}, ${fieldName}) > 0`: This is the canonical and MySQL-recommended way to check if an element is present in a `SET` type field (or a comma-separated string).
    - `${fieldName} IS NOT NULL`: This condition is **crucial** and added explicitly. If the `SET` field (or the `simple-array` column representing it) is `NULL` in the database, `FIND_IN_SET` would return `NULL`. Without this guard, `NULL > 0` would evaluate to `NULL` (or false, depending on the database context), which is not the intuitive behavior of "contains." A `NULL` field cannot "contain" any value. Therefore, for `SET_CONTAINS` to be true, the field must not be `NULL`, and the element must be found.
- **Translation of `SET_NOT_CONTAINS`:**
  - **Generated SQL Fragment:** `(${fieldName} IS NULL OR FIND_IN_SET(:${paramName}, ${fieldName}) = 0)`
  - **Justification (The "Why"):**
    - A field "does not contain" a specific value if either of these two conditions is met:
      1.  `${fieldName} IS NULL`: If the field is `NULL`, by definition, it does not contain the searched value (or any other).
      2.  `FIND_IN_SET(:${paramName}, ${fieldName}) = 0`: If the field is not `NULL`, but `FIND_IN_SET` returns `0`, it means the value is not in the list of elements for the field.
    - This combined logic with `OR` correctly covers all scenarios to determine that a value is not contained.

#### 2.3.2. `JSON_CONTAINS` and `JSON_NOT_CONTAINS` Operators (for objects and nested paths)

- **MySQL Behavior for JSON:** MySQL offers a set of functions to manipulate and query data in `JSON` type columns. `JSON_EXTRACT(json_doc, path)` extracts a value from a JSON document based on a path.
- **Translation of `JSON_CONTAINS` (when `filter.value` is an object):**
  - **SQL Fragment (example for `value: { "status": "active", "details.level": 5 }`):**
    `((JSON_EXTRACT(${fieldName}, '$.status') = :param_json_0) AND (JSON_EXTRACT(${fieldName}, '$.details.level') = :param_json_1))`
  - **Justification (The "Why"):**
    - **"Contains All Key-Value Pairs" Semantics:** When the filter value is an object, the intent is to check if the JSON document in the database contains _all_ keys specified in the filter object, and if the values associated with those keys match.
    - **Use of `JSON_EXTRACT` and Direct Comparison:** For each key-value pair in the filter object:
      - The JSON path is constructed (e.g., `$.status`, `$.details.level`).
      - `JSON_EXTRACT` is used to get the value at that path from the database's JSON field.
      - This extracted value is compared directly (`=`) with the value provided in the filter (which is passed as a parameter).
    - All these individual comparisons are joined with the `AND` logical operator, ensuring all conditions must be met.
    - **Value Type Handling:** If a value in the filter object is itself an object or an array, it is serialized to a JSON string (`JSON.stringify(val)`) before being passed as a parameter. This is because `JSON_EXTRACT` can return a JSON scalar (string, number, boolean, null) or a JSON fragment (object, array). Direct comparison works well for scalars. If comparing JSON fragments, MySQL often requires the right-hand operand to also be a valid JSON string representation for a semantic comparison.
- **Translation of `JSON_NOT_CONTAINS` (when `filter.value` is an object):**
  - **SQL Fragment (example for `value: { "status": "archived" }`):**
    `((JSON_EXTRACT(${fieldName}, '$.status') IS NULL OR JSON_EXTRACT(${fieldName}, '$.status') <> :param_json_0))`
    If the filter object had multiple keys, each resulting condition would be joined with `AND`.
  - **Justification (The "Why"):**
    - **"Does Not Meet Any of the Equality Conditions" Semantics:** For `JSON_NOT_CONTAINS` to be true with respect to a filter object, it is interpreted that for _each_ key-value pair in the filter, the equality condition must _not_ be met. That is, for a given key:
      1.  The key might not exist in the database's JSON document (in which case `JSON_EXTRACT` returns SQL `NULL`).
      2.  Or the key exists, but its value is different from that specified in the filter.
    - The expression `(${extractedPath} IS NULL OR ${extractedPath} <> :${paramName})` covers both scenarios for a single key. If there are multiple keys in the filter object, it's assumed that _all_ these "non-equality" conditions must be true, so they are joined with `AND`. (Note: This semantic could be debatable; an alternative would be "at least one of the keys does not match or does not exist," which would imply an `OR` between the non-equality conditions of each key. The current implementation is stricter).

#### 2.3.3. JSON Array Operators (`ARRAY_CONTAINS_ELEMENT`, `ARRAY_CONTAINS_ALL_ELEMENTS`, `ARRAY_CONTAINS_ANY_ELEMENT`, `ARRAY_EQUALS`)

- **MySQL Behavior for JSON Arrays:** The `JSON_CONTAINS(json_doc, candidate_value, [path_to_array])` function is fundamental. It checks if `candidate_value` (which must be a JSON scalar or a serialized JSON array/object) is present as an element within the JSON array located in `json_doc` (or at `path_to_array` within `json_doc`). `JSON_LENGTH(json_doc, [path_to_array])` returns the number of elements in a JSON array.
- **Translation of `ARRAY_CONTAINS_ELEMENT`:**
  - **SQL Fragment (example for `value: 'tag1'` in a `tags` field that is a JSON array):**
    `JSON_CONTAINS(${fieldName}, :${paramName})` (if `fieldName` is directly the array)
    or `JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.pathToTagsArray'), :${paramName}, '$')` (if the array is at a nested path).
    The parameter value `:paramName` will be `JSON.stringify('tag1')`.
  - **Justification (The "Why"):**
    - Direct use of MySQL's `JSON_CONTAINS` function, which is designed for this operation. The value to search for is serialized to JSON to ensure correct type comparison within the MySQL function.
    - If the filter specifies a path (`filter.value` is an object like `{ "tags": "tag1" }`), `JSON_EXTRACT` is used to isolate the nested array before applying `JSON_CONTAINS` to it. The third argument `'$'` in `JSON_CONTAINS` indicates searching for the element at any level of the candidate array (which is appropriate if the candidate is the array itself).
- **Translation of `ARRAY_CONTAINS_ALL_ELEMENTS`:**
  - **SQL Fragment (example for `value: ['tag1', 'tag2']` in `$.tags`):**
    `((JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_all_0, '$')) AND (JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_all_1, '$')))`
  - **Justification (The "Why"):**
    - For a JSON array to contain _all_ specified elements, the presence of each individual element must be verified.
    - A `JSON_CONTAINS` condition is generated for each element in the filter's array.
    - These individual conditions are joined with the `AND` logical operator.
- **Translation of `ARRAY_CONTAINS_ANY_ELEMENT`:**
  - **SQL Fragment (example for `value: ['tag1', 'tag2']` in `$.tags`):**
    `((JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_any_0, '$')) OR (JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_any_1, '$')))`
  - **Justification (The "Why"):**
    - For a JSON array to contain _any_ of the specified elements, at least one of them must be present.
    - A `JSON_CONTAINS` condition is generated for each element in the filter's array.
    - These individual conditions are joined with the `OR` logical operator.
- **Translation of `ARRAY_EQUALS`:**
  - **SQL Fragment (example for `value: ['tag1', 'tag2']` in `$.tags`):**
    `((JSON_LENGTH(JSON_EXTRACT(${fieldName}, '$.tags')) = :param_len) AND (JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_eq_el_0, '$')) AND (JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_eq_el_1, '$')))`
  - **Justification (The "Why"):**
    - **Simulation of Set Equality (not necessarily order):** For two JSON arrays to be considered "equal" in the context of this operator, a logic is implemented that checks two conditions:
      1.  **Same Length:** The JSON array in the database must have the same number of elements as the array provided in the filter. This is checked with `JSON_LENGTH(...) = :param_len`.
      2.  **Same Elements (Implicit Mutual Containment):** Every element from the filter's array must be present in the database's JSON array. This is checked by generating a `JSON_CONTAINS` condition for each element of the filter and joining them with `AND`.
    - **Behavior and Limitations:**
      - This implementation ensures that both arrays have the same elements and the same number of them. **It does not guarantee the same order of elements.** If order is critical, this translation is not sufficient and would require much more complex comparison logic (possibly at the application level or with stored functions in MySQL if performance is crucial).
      - For most use cases where "the arrays have the same items, regardless of order" is sought, this approach is practical and efficient.
    - **Empty Array Handling:** If the filter array is empty (`[]`), the condition simplifies to `JSON_LENGTH(...) = 0`, which is correct.

### 2.4. Return of `TypeOrmConditionFragment`

- **Description:** The public `build` method returns an object of type `TypeOrmConditionFragment`, which has the form `{ queryFragment: string, parameters: ObjectLiteral }`.
- **Justification (The "Why"):**
  - **Clear Separation of Query and Parameters:** Allows the consumer (primarily `TypeOrmQueryStructureHelper` within `TypeOrmMysqlTranslator`) to receive both the SQL fragment and the necessary parameter object desacoupled.
  - **Integration with TypeORM:** TypeORM expects conditions and their parameters to be provided this way (`queryBuilder.where("field = :name", { name: "value" })`) to correctly handle query parameterization, which is essential for security (preventing SQL injection) and efficiency (reuse of query plans by the DB).

## 3. General Flow of Operation of the `build` Method

1.  The full field name is obtained, qualified with the current alias (e.g., `users.email`).
2.  A `switch` block based on `filter.operator` directs execution to the appropriate private `handle<OperatorType>` method.
3.  Each `handle<OperatorType>` method:
    - Constructs the `queryFragment` string specific to that operator and MySQL syntax.
    - If the operator requires values (most do, except `IS_NULL` / `IS_NOT_NULL`), it requests one or more unique parameter names from the `parameterManager`.
    - Prepares the parameter values as needed (e.g., adding `%` wildcards for `LIKE`, `CONTAINS`, `STARTS_WITH`, `ENDS_WITH` operators; serializing to JSON for `JSON_` and `ARRAY_` operators).
    - Populates the `parameters` object with the generated parameter names and their prepared values.
4.  The resulting `TypeOrmConditionFragment` object is returned.

## 4. Implementation Considerations and Limitations

- **MySQL Version:** The availability and exact behavior of some functions (especially JSON functions) can vary between MySQL versions. The current implementation targets common functionalities available in relatively modern versions (MySQL 5.7+ for most JSON functions, with improvements and more functions in MySQL 8.0+). It's important to test against the target MySQL version.
- **Performance of JSON and SET/simple-array Queries:** Queries filtering by `JSON` or `SET` type fields (or `simple-array` mapping to string types) can have performance implications if the columns are not adequately indexed. MySQL 8.0+ offers better indexing capabilities for JSON data (e.g., indexes on JSON arrays or on virtual fields generated from JSON paths). The translator focuses on the functional correctness of the translation; performance optimization at the database schema level (defining appropriate indexes) is the responsibility of the developer using the library.
- **Complexity of `ARRAY_EQUALS`:** As detailed earlier, the implementation of `ARRAY_EQUALS` checks for length equality and the presence of all elements but does not guarantee order. If strict ordered array equality is required, a different solution would be needed.
- **Handling of `NULL` in Comparisons:** Most comparison operators (`=`, `<>`, `>`, etc.) when compared with `NULL` in SQL produce a `NULL` result (which in a boolean context is treated as false). The `IS_NULL` and `IS_NOT_NULL` operators are specifically designed to check for nullity. The logic for `SET_CONTAINS` and `SET_NOT_CONTAINS` explicitly includes `IS NULL` / `IS NOT NULL` checks for intuitive behavior. For other operators, standard SQL behavior with `NULL`s applies.
