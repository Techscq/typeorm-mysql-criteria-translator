# TypeOrmParameterManager

## 1. Main Purpose

The `TypeOrmParameterManager` is a simple but essential internal helper. Its only job is to generate unique parameter names (e.g., `:param_0`, `:param_1`, ...) for the SQL query. This is a fundamental security measure to prevent SQL injection by ensuring all user-provided values are correctly parameterized.

## 2. How It Works

The manager maintains a simple internal counter. Each time a part of the query needs a new parameter, the manager provides the next name in the sequence (e.g., `param_N`) and increments its counter.

At the beginning of each new translation process (when you call `translator.translate()`), the main translator resets this counter. This ensures that every query is built with a fresh set of parameter names, preventing any conflicts.

## 3. Usage Notes

You do not interact with this component directly. It is created and used internally by the `TypeOrmMysqlTranslator` and its helpers to ensure all queries are secure.
