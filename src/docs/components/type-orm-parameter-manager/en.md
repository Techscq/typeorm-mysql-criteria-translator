# TypeOrmParameterManager

## 1. Main Purpose

The `TypeOrmParameterManager` is a simple yet crucial class solely responsible for generating unique parameter names (e.g., `:param_0`, `:param_1`, ...) to be used in the SQL queries constructed by the translator. This prevents parameter name collisions and is fundamental for the correct parameterization of queries, which in turn is essential for security (preventing SQL injection).

## 2. Key Design Decisions

### 2.1. Dedicated Class for Parameter Management

- **Description:** Instead of passing a simple numeric counter through different classes and methods, a dedicated class was chosen.
- **Justification (The "Why"):**
  - **Encapsulation and Clarity:** Encapsulates the name generation logic and counter state in one place. This makes the code using the parameter manager cleaner, as it simply requests a new parameter name without worrying about implementation details.
  - **Controlled Reset:** The class provides a `reset()` method. This is a vital function called by `TypeOrmMysqlTranslator` at the beginning of each complete translation of a `Criteria` object (`visitRoot`). This ensures that each translation starts with a parameter counter from zero, preventing parameter names from a previous translation from interfering with a new one, especially if the same translator instance were reused (though a new instance per `Criteria` is common practice).
  - **Maintainability and Extensibility (Potential):** Although name generation is currently a simple increment, if more complex logic for generating parameter names were needed in the future (e.g., with specific prefixes or different strategies), changes would be isolated within this class without affecting its consumers.

### 2.2. Simplicity of the Counter

- **Description:** Uses a simple numeric counter (`paramCounter`) that is incremented with each call to `generateParamName()`.
- **Justification (The "Why"):**
  - **Sufficiency:** For the purpose of generating unique names within the scope of a single generated SQL query, a simple incremental counter is sufficient and efficient. TypeORM and the database driver handle mapping these names to actual values.
  - **Performance:** Introduces no unnecessary overhead.

## 3. General Flow of Operation

1.  **Instantiation:** An instance of `TypeOrmParameterManager` is created by `TypeOrmMysqlTranslator` in its constructor. This same instance is passed to other helpers that also need to generate parameters (like `TypeOrmFilterFragmentBuilder` and `TypeOrmQueryStructureHelper`).
2.  **Reset (`reset()`):**
    - At the beginning of each call to `TypeOrmMysqlTranslator.visitRoot()`, `this.parameterManager.reset()` is invoked.
    - This resets the internal `paramCounter` to `0`.
3.  **Name Generation (`generateParamName()`):**
    - When a component (e.g., `TypeOrmFilterFragmentBuilder` when building a filter fragment) needs a parameter name, it calls `parameterManager.generateParamName()`.
    - This method returns a string like `param_N` (where N is the current value of `paramCounter`) and then increments `paramCounter`.

## 4. Implementation Considerations

- **Instance Scope:** It's important that the same instance of `TypeOrmParameterManager` is shared among all components involved in translating a single `Criteria` to ensure global uniqueness of parameters within that query. The `TypeOrmMysqlTranslator` handles this by creating and injecting the instance.
- **No Persistence Across Translations:** The reset in `visitRoot` means that parameter names are not persistent or unique across different calls to `translator.translate()`. This is intentional and correct, as each `translate` call generates an independent query.
