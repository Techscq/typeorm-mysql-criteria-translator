# @nulledexp/typeorm-mysql-criteria-translator

[![npm version](https://img.shields.io/npm/v/@nulledexp/typeorm-mysql-criteria-translator.svg)](https://www.npmjs.com/package/@nulledexp/typeorm-mysql-criteria-translator)
[![CI](https://github.com/Techscq/translatable-criteria/actions/workflows/ci.yml/badge.svg)](https://github.com/Techscq/typeorm-mysql-criteria-translator/actions/workflows/ci.yml)

This package provides a translator to convert `Criteria` objects from the `@nulledexp/translatable-criteria` package into TypeORM `SelectQueryBuilder` queries, specifically for MySQL databases.

It allows defining complex query logics abstractly and reusably, and then applying them to your TypeORM entities.

## Key Features

- **Complete Criteria Translation:** Converts filters, logical groups (AND/OR), ordering, pagination (offset and cursor), and field selection.
- **Advanced Join Handling:**
  - Supports `INNER JOIN` and `LEFT JOIN`.
  - Allows complex `ON` conditions within joins, including logical groups.
  - Handles simple (direct) joins and joins through pivot tables (many-to-many).
  - Field selection and ordering in joined entities.
- **Supported Filter Operators:**
  - Comparison: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `GREATER_THAN_OR_EQUALS`, `LESS_THAN_OR_EQUALS`.
  - Text: `LIKE`, `NOT_LIKE`, `CONTAINS`, `NOT_CONTAINS`, `STARTS_WITH`, `ENDS_WITH`.
  - Collections: `IN`, `NOT_IN`.
  - Nulls: `IS_NULL`, `IS_NOT_NULL`.
  - MySQL SET: `SET_CONTAINS`, `SET_NOT_CONTAINS`.
  - JSON: `JSON_CONTAINS`, `JSON_NOT_CONTAINS` (for objects and nested paths).
  - JSON Arrays: `ARRAY_CONTAINS_ELEMENT`, `ARRAY_CONTAINS_ALL_ELEMENTS`, `ARRAY_CONTAINS_ANY_ELEMENT`, `ARRAY_EQUALS`.
- **Parameter Management:** Automatic and safe generation of parameter names to avoid collisions.
- **TypeORM Integration:** Produces a `SelectQueryBuilder` that can be further modified or executed directly.

## Installation

```bash
npm install @nulledexp/typeorm-mysql-criteria-translator @nulledexp/translatable-criteria typeorm mysql2
```

```bash
yarn add @nulledexp/typeorm-mysql-criteria-translator @nulledexp/translatable-criteria typeorm mysql2
```

Ensure you have `typeorm` and `mysql2` (or your preferred MySQL driver compatible with TypeORM) as dependencies in your project.

## Basic Usage

```typescript
import { DataSource, SelectQueryBuilder } from 'typeorm';
import {
  CriteriaFactory,
  FilterOperator,
  OrderDirection,
} from '@nulledexp/translatable-criteria';
import { TypeOrmMysqlTranslator } from '@nulledexp/typeorm-mysql-criteria-translator';

// --- Replace with your definitions ---
import { UserEntity } from '[PATH_TO_YOUR_USER_ENTITY]'; // Your TypeORM entity
import { UserSchema as CriteriaUserSchema } from '[PATH_TO_YOUR_USER_CRITERIA_SCHEMA]'; // Your CriteriaSchema
// --- End of replacements ---

async function main() {
  // 1. Configure your TypeORM DataSource
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    username: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'secret',
    database: process.env.MYSQL_DATABASE_NAME || 'test_db',
    entities: [UserEntity /*, ...other entities */],
    synchronize: true, // For development only!
  });

  await dataSource.initialize();
  console.log('DataSource initialized.');

  // 2. Create an instance of the translator
  const translator = new TypeOrmMysqlTranslator<UserEntity>();

  // 3. Define your Criteria
  const userAlias = CriteriaUserSchema.alias[0]; // e.g., 'user'
  const criteria = CriteriaFactory.GetCriteria(CriteriaUserSchema, userAlias)
    .where({
      field: 'email',
      operator: FilterOperator.ENDS_WITH,
      value: '@example.com',
    })
    .andWhere({
      field: 'username',
      operator: FilterOperator.NOT_CONTAINS,
      value: 'spam',
    })
    .orderBy('created_at', OrderDirection.DESC)
    .setTake(10)
    .setSkip(0);

  // 4. Get a TypeORM QueryBuilder for your root entity
  const qb = dataSource.getRepository(UserEntity).createQueryBuilder(userAlias);

  // 5. Translate the Criteria to the QueryBuilder
  translator.translate(criteria, qb);

  // 6. Execute the query or get the SQL
  console.log('Generated SQL:', qb.getSql());
  console.log('Parameters:', qb.getParameters());

  const users = await qb.getMany();
  console.log(
    `Users found (${users.length}):`,
    users.map((u) => u.username),
  );

  await dataSource.destroy();
  console.log('DataSource destroyed.');
}

main().catch(console.error);
```

**Content for Placeholders in the Usage Example:**

- `[PATH_TO_YOUR_USER_ENTITY]`: Should be the relative path to the file where you define your TypeORM `UserEntity`. For example: `./entities/user.entity.js`.
- `[PATH_TO_YOUR_USER_CRITERIA_SCHEMA]`: Should be the relative path to the file where you define your `UserSchema` using `GetTypedCriteriaSchema` from `@nulledexp/translatable-criteria`. For example: `./schemas/user.schema.js`.

## How It Works Internally

The [`TypeOrmMysqlTranslator`](./src/docs/type-orm-mysql-translator/en.md) uses the Visitor pattern
to traverse the structure
of the
`Criteria` object. As it visits each node (filters, groups, joins, etc.), it constructs the TypeORM `SelectQueryBuilder` query.

The key components are:

- **[`TypeOrmMysqlTranslator`](./src/docs/type-orm-mysql-translator/en.md) (`type-orm.mysql.
translator.ts`)**: The main class that implements the `CriteriaTranslator` interface and
  orchestrates the translation process.
- **[`TypeOrmParameterManager`](./src/docs/components/type-orm-parameter-manager/en.md)(`utils/type-orm-parameter-manager.ts`)**: Manages
  the
  creation
  of unique parameter names (e.g., `:param_0`, `:param_1`) for SQL queries, avoiding collisions.
- **[`TypeOrmFilterFragmentBuilder`](./src/docs/components/type-orm-filter-fragment-builder/en.md)
  (`utils/type-orm-filter-fragment-builder.ts`)**:
  Responsible for building SQL fragments (`WHERE field = :param`) and parameter objects for each individual `Filter`, handling the specific logic for each `FilterOperator`.
- **[`TypeOrmQueryStructureHelper`](./src/docs/components/type-orm-query-structure-helper/en.md)
  (`utils/type-orm-query-structure-helper.ts`)**:
  Helps apply
  conditions (`WHERE`, `AND WHERE`, `OR WHERE`) to the `QueryBuilder`, processes nested filter groups using TypeORM `Brackets`, resolves field selections (`SELECT ...`), builds logic for cursor-based pagination, and generates condition strings for contexts like `JOIN ON` clauses.
- **[`TypeOrmJoinApplier`](./src/docs/components/type-orm-join-applier/en.md)
  (`utils/type-orm-join-applier.ts`)**:
  Specifically handles
  applying
  `JOIN`s (`INNER JOIN`, `LEFT JOIN`) to the `QueryBuilder`. It constructs `ON` conditions by delegating to `TypeOrmQueryStructureHelper` (which in turn uses `TypeOrmFilterFragmentBuilder` for individual filter parts) and manages field selection and ordering from joined entities.

## Tests

The package includes an exhaustive set of integration tests to ensure the correct translation of various scenarios.

To run the tests:

1.  **Set up your environment:**

- Create a `.env` file in the project root (you can copy `.env.example` if it exists) with your database credentials. Example:

```dockerfile
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=mysecretpassword
MYSQL_DATABASE_NAME=test_db
```

- Ensure you have a running MySQL server. You can use Docker:

```bash
npm run docker
```

2.  **Install dependencies:**

```bash
npm install
```

3.  **Run the tests:**

- For integration tests (require the database):

```bash
npm run test
```

- For interactive development with Vitest:

```bash
npm run dev
```

Integration tests use fake entities and data (see `src/test/utils/fake-entities.ts` and `src/test/utils/entities/`) to simulate real scenarios and validate data hydration and the correctness of the generated SQL.

## Useful Scripts

- `npm run build`: Compiles TypeScript code to JavaScript in the `dist/` folder.
- `npm run format`: Formats the code using Prettier.
- `npm run check-format`: Checks if the code is formatted correctly.
- `npm run check-circular`: Detects circular dependencies using Madge.
- `npm run ci`: Runs a series of checks (format, circulars, tests) ideal for Continuous Integration.
- `npm run local-release`: (For maintainers) Versions the package using Changesets and publishes it to npm.

## Contributions

Contributions are welcome! If you wish to contribute:

1.  Open an "Issue" to discuss the change you propose or the bug you found.
2.  "Fork" the repository.
3.  Create a new branch for your changes.
4.  Ensure that the tests pass (`npm run ci`).
5.  Submit a "Pull Request" detailing your changes.

## License

This project is under the MIT License. See the LICENSE file for more details.
