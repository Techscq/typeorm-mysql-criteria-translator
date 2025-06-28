# @nulledexp/typeorm-mysql-criteria-translator

[![npm version](https://img.shields.io/npm/v/@nulledexp/typeorm-mysql-criteria-translator.svg)](https://www.npmjs.com/package/@nulledexp/typeorm-mysql-criteria-translator)
[![CI](https://github.com/Techscq/translatable-criteria/actions/workflows/ci.yml/badge.svg)](https://github.com/Techscq/typeorm-mysql-criteria-translator/actions/workflows/ci.yml)

This package provides a translator to convert `Criteria` objects from the `@nulledexp/translatable-criteria` package into TypeORM `SelectQueryBuilder` queries, specifically for MySQL databases.

It allows you to define complex query logic abstractly and reusably, and then apply it to your TypeORM entities.

## Key Features

- **Declarative, Schema-Based Joins:** Define your entity relationships once in the `CriteriaSchema`. The translator handles the rest, making your queries cleaner, safer, and more reusable.
- **Efficient Filtering-Only Joins:** Use `withSelect: false` on your joins to filter by a related entity without the performance overhead of selecting and hydrating its data.
- **Complete Criteria Translation:** Converts filters, logical groups (AND/OR), ordering, pagination (offset and cursor), and field selection into efficient SQL.
- **Rich Filter Operator Support:** Includes a wide range of operators for text, numbers, collections, `NULL`s, and advanced `JSON` and `SET` types in MySQL.
- **Seamless TypeORM Integration:** Produces a standard TypeORM `SelectQueryBuilder` that you can execute directly or modify further.

## Installation

```shell
npm install @nulledexp/typeorm-mysql-criteria-translator @nulledexp/translatable-criteria typeorm mysql2
```

Ensure you have `typeorm` and `mysql2` (or your preferred MySQL driver compatible with TypeORM) as dependencies in your project.

## Basic Usage

Let's find all posts from active users whose username starts with 'user\_', and also load their publisher information.

**1. Define your Schemas with Relations**

First, define your `CriteriaSchema` for your entities, specifying their fields and, most importantly, their `relations`.

```typescript
import { GetTypedCriteriaSchema } from '@nulledexp/translatable-criteria';

export const UserSchema = GetTypedCriteriaSchema({
  source_name: 'user',
  alias: 'users',
  identifier_field: 'uuid',
  fields: ['uuid', 'email', 'username', 'isActive', 'created_at'],
  relations: [],
});
```

```typescript
import { GetTypedCriteriaSchema } from '@nulledexp/translatable-criteria';

export const PostSchema = GetTypedCriteriaSchema({
  source_name: 'post',
  alias: 'posts',
  identifier_field: 'uuid',
  fields: ['uuid', 'title', 'body', 'user_uuid', 'created_at'],
  relations: [
    {
      relation_alias: 'publisher',
      relation_type: 'many_to_one',
      target_source_name: 'user',
      local_field: 'user_uuid', // Foreign key in the 'post' table
      relation_field: 'uuid', // Primary key in the 'user' table
    },
  ],
});
```

**2. Build your Criteria**

Now, build your `Criteria` object. Notice how the `.join()` call is clean and declarative—it only needs the `relation_alias` you defined in the schema.

```typescript
import {
  CriteriaFactory,
  FilterOperator,
  OrderDirection,
} from '@nulledexp/translatable-criteria';
import { PostSchema } from './schemas/post.schema';
import { UserSchema } from './schemas/user.schema';

// Criteria for the 'publisher' join: find active users starting with 'user_'
const publisherJoinCriteria = CriteriaFactory.GetInnerJoinCriteria(UserSchema)
  .where({
    field: 'isActive',
    operator: FilterOperator.EQUALS,
    value: true,
  })
  .andWhere({
    field: 'username',
    operator: FilterOperator.STARTS_WITH,
    value: 'user_',
  });

// Root criteria: find posts, join with our publisher criteria, and order them
const criteria = CriteriaFactory.GetCriteria(PostSchema)
  .join('publisher', publisherJoinCriteria) // Simple, declarative join!
  .orderBy('created_at', OrderDirection.DESC)
  .setTake(20);
```

**3. Translate and Execute**

Finally, create the translator, get a TypeORM `QueryBuilder`, and translate the `Criteria`.

```typescript
import { TypeOrmMysqlTranslator } from '@nulledexp/typeorm-mysql-criteria-translator';
import { PostEntity } from './entities/post.entity'; // Your TypeORM entity
import { dataSource } from './data-source'; // Your TypeORM DataSource

// Create an instance of the translator
const translator = new TypeOrmMysqlTranslator<PostEntity>();

// Get a QueryBuilder for your root entity
const qb = dataSource
  .getRepository(PostEntity)
  .createQueryBuilder(PostSchema.alias);

// Translate the Criteria into the QueryBuilder
translator.translate(criteria, qb);

// Execute the query or inspect the SQL
console.log('Generated SQL:', qb.getSql());
const posts = await qb.getMany();

console.log(`Found ${posts.length} posts.`);
posts.forEach((post) => {
  console.log(`- ${post.title} (Publisher: ${post.publisher.username})`);
});
```

## How It Works

This translator uses the **Visitor pattern** to walk through your `Criteria` object. It intelligently delegates the task of building each part of the SQL query to specialized, single-responsibility components.

- **`TypeOrmMysqlTranslator`**: The main orchestrator. It traverses the `Criteria` and coordinates the other components.
- **`TypeOrmJoinApplier`**: The expert for `JOIN`s. It reads the relation definitions from your schema and applies the correct `INNER` or `LEFT` join, including support for `withSelect: false`.
- **`TypeOrmConditionBuilder`**: The logic master. It builds the `WHERE` clause for the main query and the `ON` conditions for joins, correctly handling nested `AND`/`OR` groups with parentheses (`Brackets`).
- **`TypeOrmFilterFragmentBuilder`**: The operator specialist. It knows how to translate each specific `FilterOperator` (like `EQUALS`, `CONTAINS`, `JSON_CONTAINS`) into its corresponding MySQL syntax.
- **`TypeOrmParameterManager`**: The security guard. It ensures all values are parameterized, preventing SQL injection.

## Limitations

### Ordering with NULLS FIRST / NULLS LAST

Due to limitations in MySQL's SQL dialect and the internal behavior of TypeORM's query builder, this translator does not support ordering with `NULLS FIRST` or `NULLS LAST`. Any `orderBy` clauses specifying nulls ordering will be ignored, and the database's default null sorting behavior will apply.

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

```shell
npm run docker
```

2.  **Install dependencies:**

```shell
npm install
```

3.  **Run the tests:**

```shell
# For integration tests (require the database)
npm run test

# For interactive development with Vitest
npm run dev
```

Integration tests use fake entities and data (see `src/test/utils/fake-entities.ts` and `src/test/utils/entities/`) to simulate real scenarios and validate data hydration and the correctness of the generated SQL.

## Contributions

Contributions are welcome! If you wish to contribute:

1.  Open an "Issue" to discuss the change you propose or the bug you found.
2.  "Fork" the repository.
3.  Create a new branch for your changes.
4.  Ensure that the tests pass (`npm run ci`).
5.  Submit a "Pull Request" detailing your changes.

## License

This project is under the MIT License. See the LICENSE file for more details.
