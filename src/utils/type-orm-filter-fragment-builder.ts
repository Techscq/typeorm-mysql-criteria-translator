import type { ObjectLiteral } from 'typeorm';
import type { TypeOrmParameterManager } from './type-orm-parameter-manager.js';
import {
  type Filter,
  FilterOperator,
  type PrimitiveFilterValue,
} from '@nulledexp/translatable-criteria';

export type TypeOrmConditionFragment = {
  queryFragment: string;
  parameters: ObjectLiteral;
};

/**
 * Builds SQL query fragments and parameters for individual filters
 * to be used with TypeORM in a MySQL context.
 */
export class TypeOrmFilterFragmentBuilder {
  constructor(private parameterManager: TypeOrmParameterManager) {}

  /**
   * Constructs a full JSON path, ensuring it starts with '$.'.
   * Example: 'details.info' becomes '$.details.info'.
   * @param path The raw path string.
   * @returns The fully qualified JSON path.
   * @private
   */
  private getJsonFullPath(path: string): string {
    return path.startsWith('$') ? path : `$.${path}`;
  }

  /**
   * Extracts elements and an optional JSON path from a filter value
   * intended for JSON array operations.
   *
   * Example 1 (value is an object with path):
   *   filterValue = { "tags": ["tech", "news"] }
   *   returns { elements: ["tech", "news"], fullJsonPath: "$.tags" }
   *
   * Example 2 (value is a direct array for a top-level array field):
   *   filterValue = ["tech", "news"] (e.g., for a field 'direct_tags' that is a JSON array)
   *   returns { elements: ["tech", "news"], fullJsonPath: undefined }
   *
   * @param filterValue The value from the filter.
   * @returns An object containing the elements array and an optional fullJsonPath.
   * @private
   */
  private extractArrayElementsAndPath(filterValue: any): {
    elements: Array<Exclude<PrimitiveFilterValue, null | undefined>>;
    fullJsonPath?: string;
  } {
    let elements: Array<Exclude<PrimitiveFilterValue, null | undefined>>;
    let fullJsonPath: string | undefined;

    if (
      typeof filterValue === 'object' &&
      filterValue !== null &&
      !Array.isArray(filterValue)
    ) {
      const pathValueMap = filterValue as {
        [key: string]: Array<Exclude<PrimitiveFilterValue, null | undefined>>;
      };
      const jsonPathKey = Object.keys(pathValueMap)[0];

      if (jsonPathKey === undefined) {
        elements = [];
      } else {
        elements = pathValueMap[jsonPathKey]!;
        fullJsonPath = this.getJsonFullPath(jsonPathKey);
      }
    } else {
      elements = filterValue as Array<
        Exclude<PrimitiveFilterValue, null | undefined>
      >;
    }
    return { elements, fullJsonPath };
  }

  /**
   * Handles basic comparison operators like =, !=, >, <, >=, <=.
   * Example: `filter = { field: 'age', operator: FilterOperator.GREATER_THAN, value: 18 }`
   * Generates: `users.age > :param_0` with parameters `{ param_0: 18 }`.
   * @param filter The filter object.
   * @param fieldName The fully qualified field name (e.g., "alias.field").
   * @param operatorString The SQL operator string (e.g., "=", ">").
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleBasicComparison(
    filter: Filter<string, any>,
    fieldName: string,
    operatorString: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    return {
      queryFragment: `${fieldName} ${operatorString} :${paramName}`,
      parameters: { [paramName]: filter.value },
    };
  }

  /**
   * Handles LIKE based comparison operators (LIKE, CONTAINS, STARTS_WITH, ENDS_WITH)
   * and their NOT counterparts.
   * Example: `filter = { field: 'name', operator: FilterOperator.CONTAINS, value: 'John' }`
   * Generates: `users.name LIKE :param_0` with parameters `{ param_0: '%John%' }`.
   * @param filter The filter object.
   * @param fieldName The fully qualified field name.
   * @param pattern A function to format the filter value into a LIKE pattern (e.g., adding '%').
   * @param not A boolean indicating if it's a NOT LIKE operation.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleLikeComparison(
    filter: Filter<string, any>,
    fieldName: string,
    pattern: (value: any) => string,
    not: boolean = false,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    return {
      queryFragment: `${fieldName} ${not ? 'NOT ' : ''}LIKE :${paramName}`,
      parameters: { [paramName]: pattern(filter.value) },
    };
  }

  /**
   * Handles IN and NOT_IN operators.
   * Example: `filter = { field: 'status', operator: FilterOperator.IN, value: ['active', 'pending'] }`
   * Generates: `users.status IN (:...param_0)` with parameters `{ param_0: ['active', 'pending'] }`.
   * @param filter The filter object, expecting filter.value to be an array.
   * @param fieldName The fully qualified field name.
   * @param not A boolean indicating if it's a NOT IN operation.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleInComparison(
    filter: Filter<string, any>,
    fieldName: string,
    not: boolean = false,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    return {
      queryFragment: `${fieldName} ${not ? 'NOT ' : ''}IN (:...${paramName})`,
      parameters: { [paramName]: filter.value },
    };
  }

  /**
   * Handles IS_NULL and IS_NOT_NULL operators.
   * Example: `filter = { field: 'description', operator: FilterOperator.IS_NULL, value: null }`
   * Generates: `posts.description IS NULL`.
   * @param fieldName The fully qualified field name.
   * @param not A boolean indicating if it's an IS_NOT_NULL operation.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleNullComparison(
    fieldName: string,
    not: boolean = false,
  ): TypeOrmConditionFragment {
    return {
      queryFragment: `${fieldName} IS ${not ? 'NOT ' : ''}NULL`,
      parameters: {},
    };
  }

  /**
   * Handles SET_CONTAINS and SET_NOT_CONTAINS operators for comma-separated string fields.
   * Uses MySQL's FIND_IN_SET function.
   * Example (SET_CONTAINS): `filter = { field: 'categories', operator: FilterOperator.SET_CONTAINS, value: 'tech' }`
   * Generates: `(posts.categories IS NOT NULL AND FIND_IN_SET(:param_0, posts.categories) > 0)`
   * with parameters `{ param_0: 'tech' }`.
   * @param filter The filter object.
   * @param fieldName The fully qualified field name.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleSetContains(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();

    if (filter.operator === FilterOperator.SET_CONTAINS) {
      return {
        queryFragment: `(${fieldName} IS NOT NULL AND FIND_IN_SET(:${paramName}, ${fieldName}) > 0)`,
        parameters: { [paramName]: filter.value },
      };
    } else {
      return {
        queryFragment: `(${fieldName} IS NULL OR FIND_IN_SET(:${paramName}, ${fieldName}) = 0)`,
        parameters: { [paramName]: filter.value },
      };
    }
  }

  /**
   * Handles JSON_CONTAINS and JSON_NOT_CONTAINS operators for object values.
   * Iterates over key-value pairs in filter.value to build conditions
   * using JSON_EXTRACT.
   * Example (JSON_CONTAINS): `filter = { field: 'metadata', operator: FilterOperator.JSON_CONTAINS, value: { 'author.name': 'John' } }`
   * Generates: `(JSON_EXTRACT(posts.metadata, '$.author.name') = :param_0_json_0)`
   * with parameters `{ param_0_json_0: 'John' }`.
   * @param filter The filter object, expecting filter.value to be an object.
   * @param fieldName The fully qualified field name of the JSON column.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleJsonContains(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const jsonConditions: string[] = [];
    const parameters: ObjectLiteral = {};

    const baseParamName = this.parameterManager.generateParamName();
    Object.entries(filter.value as ObjectLiteral).forEach(
      ([path, val], index) => {
        const currentParamName = `${baseParamName}_json_${index}`;
        const fullPath = this.getJsonFullPath(path);
        const extractedPath = `JSON_EXTRACT(${fieldName}, '${fullPath}')`;

        if (filter.operator === FilterOperator.JSON_NOT_CONTAINS) {
          jsonConditions.push(
            `(${extractedPath} IS NULL OR ${extractedPath} <> :${currentParamName})`,
          );
        } else {
          jsonConditions.push(`${extractedPath} = :${currentParamName}`);
        }
        if (typeof val === 'object' && val !== null) {
          parameters[currentParamName] = JSON.stringify(val);
        } else {
          parameters[currentParamName] = val;
        }
      },
    );

    if (jsonConditions.length === 0) {
      return {
        queryFragment:
          filter.operator === FilterOperator.JSON_CONTAINS ? '1=0' : '1=1',
        parameters,
      };
    }
    return {
      queryFragment: `(${jsonConditions.join(' AND ')})`,
      parameters,
    };
  }

  /**
   * Handles ARRAY_CONTAINS_ELEMENT operator for JSON array fields.
   * Uses MySQL's JSON_CONTAINS function.
   * Supports direct array value or an object specifying a path to an array.
   * Example (path specified): `filter = { field: 'data', operator: FilterOperator.ARRAY_CONTAINS_ELEMENT, value: { 'tags': 'urgent' } }`
   * Generates: `JSON_CONTAINS(events.data, :param_0, '$.tags')` with parameters `{ param_0: '"urgent"' }`.
   * Example (direct value): `filter = { field: 'direct_tags', operator: FilterOperator.ARRAY_CONTAINS_ELEMENT, value: 'important' }`
   * Generates: `JSON_CONTAINS(events.direct_tags, :param_0)` with parameters `{ param_0: '"important"' }`.
   * @param filter The filter object.
   * @param fieldName The fully qualified field name of the JSON column.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleArrayContainsElement(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    if (
      typeof filter.value === 'object' &&
      filter.value !== null &&
      !Array.isArray(filter.value)
    ) {
      const pathValueMap = filter.value as {
        [key: string]: PrimitiveFilterValue;
      };
      const jsonPathKey = Object.keys(pathValueMap)[0]!;
      const elementToContain = pathValueMap[jsonPathKey];
      const fullJsonPath = this.getJsonFullPath(jsonPathKey);
      return {
        queryFragment: `JSON_CONTAINS(${fieldName}, :${paramName}, '${fullJsonPath}')`,
        parameters: { [paramName]: JSON.stringify(elementToContain) },
      };
    }
    return {
      queryFragment: `JSON_CONTAINS(${fieldName}, :${paramName})`,
      parameters: { [paramName]: JSON.stringify(filter.value) },
    };
  }

  /**
   * Handles ARRAY_CONTAINS_ALL_ELEMENTS and ARRAY_CONTAINS_ANY_ELEMENT operators.
   * Generates multiple JSON_CONTAINS checks combined with AND or OR.
   * Supports direct array value or an object specifying a path to an array.
   * Example (ARRAY_CONTAINS_ALL_ELEMENTS with path):
   *   `filter = { field: 'data', operator: FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS, value: { 'tags': ['urgent', 'new'] } }`
   * Generates: `(JSON_CONTAINS(events.data, :param_0_all_0, '$.tags') AND JSON_CONTAINS(events.data, :param_0_all_1, '$.tags'))`
   * with parameters `{ param_0_all_0: '"urgent"', param_0_all_1: '"new"' }`.
   * @param filter The filter object.
   * @param fieldName The fully qualified field name of the JSON column.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleArrayContainsMultipleElements(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    const logicalJoin =
      filter.operator === FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS
        ? ' AND '
        : ' OR ';
    const emptyReturn =
      filter.operator === FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS
        ? '1=1'
        : '1=0';
    const paramPrefix =
      filter.operator === FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS
        ? 'all'
        : 'any';
    const parameters: ObjectLiteral = {};

    const { elements: elementsToContain, fullJsonPath } =
      this.extractArrayElementsAndPath(filter.value);

    if (!Array.isArray(elementsToContain) || elementsToContain.length === 0) {
      return { queryFragment: emptyReturn, parameters };
    }

    const conditions: string[] = [];
    elementsToContain.forEach((element, index) => {
      const currentParamName = `${paramName}_${paramPrefix}_${index}`;
      const targetJsonExpression = fullJsonPath ? fieldName : fieldName;
      const pathArgForJsonContains = fullJsonPath ? `, '${fullJsonPath}'` : '';

      conditions.push(
        `JSON_CONTAINS(${targetJsonExpression}, :${currentParamName}${pathArgForJsonContains})`,
      );
      parameters[currentParamName] = JSON.stringify(element);
    });

    return {
      queryFragment: `(${conditions.join(logicalJoin)})`,
      parameters,
    };
  }

  /**
   * Handles ARRAY_EQUALS operator for JSON array fields.
   * Checks for same length and that all elements from the filter array
   * are contained in the database array (order not guaranteed).
   * Uses JSON_LENGTH and multiple JSON_CONTAINS.
   * Supports direct array value or an object specifying a path to an array.
   * Example (ARRAY_EQUALS with path):
   *   `filter = { field: 'data', operator: FilterOperator.ARRAY_EQUALS, value: { 'tags': ['urgent', 'new'] } }`
   * Generates: `(JSON_LENGTH(JSON_EXTRACT(events.data, '$.tags')) = :param_0_len AND JSON_CONTAINS(JSON_EXTRACT(events.data, '$.tags'), :param_0_eq_el_0, '$') AND JSON_CONTAINS(JSON_EXTRACT(events.data, '$.tags'), :param_0_eq_el_1, '$'))`
   * with parameters `{ param_0_len: 2, param_0_eq_el_0: '"urgent"', param_0_eq_el_1: '"new"' }`.
   * @param filter The filter object.
   * @param fieldName The fully qualified field name of the JSON column.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleArrayEquals(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    const conditions: string[] = [];
    const parameters: ObjectLiteral = {};

    const { elements: elementsToCompare, fullJsonPath } =
      this.extractArrayElementsAndPath(filter.value);

    const targetJsonExpression = fullJsonPath
      ? `JSON_EXTRACT(${fieldName}, '${fullJsonPath}')`
      : fieldName;

    if (!Array.isArray(elementsToCompare) || elementsToCompare.length === 0) {
      const lengthCheckParam = `${paramName}_len`;
      const queryFragment = `JSON_LENGTH(${targetJsonExpression}) = :${lengthCheckParam}`;
      parameters[lengthCheckParam] = 0;
      return { queryFragment, parameters };
    }

    const lengthParamName = `${paramName}_len`;
    conditions.push(
      `JSON_LENGTH(${targetJsonExpression}) = :${lengthParamName}`,
    );
    parameters[lengthParamName] = elementsToCompare.length;

    elementsToCompare.forEach((element, index) => {
      const currentParamName = `${paramName}_eq_el_${index}`;
      conditions.push(
        `JSON_CONTAINS(${targetJsonExpression}, :${currentParamName}, '$')`,
      );
      parameters[currentParamName] = JSON.stringify(element);
    });

    return {
      queryFragment: `(${conditions.join(' AND ')})`,
      parameters,
    };
  }

  /**
   * Handles filter operators SET_CONTAINS_ANY and SET_CONTAINS_ALL for comma-separated string fields.
   * Generates a MySQL query fragment using FIND_IN_SET for each value,
   * combined with OR or AND respectively. Assumes the field stores comma-separated values.
   * Example (SET_CONTAINS_ANY): `filter = { field: 'roles', operator: FilterOperator.SET_CONTAINS_ANY, value: ['admin', 'editor'] }`
   * Generates: `(users.roles IS NOT NULL AND (FIND_IN_SET(:param_0, users.roles) > 0 OR FIND_IN_SET(:param_1, users.roles) > 0))`
   * with parameters `{ param_0: 'admin', param_1: 'editor' }`.
   * @param filter The filter object.
   * @param fieldName The fully qualified field name (e.g., "alias.field").
   * @returns A TypeOrmConditionFragment with the query and parameters.
   * @private
   */
  private handleSetContainsAnyOrAll(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const values = filter.value as Array<
      Exclude<PrimitiveFilterValue, null | undefined>
    >;
    if (!Array.isArray(values) || values.length === 0) {
      return {
        queryFragment:
          filter.operator === FilterOperator.SET_CONTAINS_ANY ? '1=0' : '1=1',
        parameters: {},
      };
    }

    const conditions: string[] = [];
    const parameters: ObjectLiteral = {};
    values.forEach((value) => {
      const paramName = this.parameterManager.generateParamName();
      conditions.push(`FIND_IN_SET(:${paramName}, ${fieldName}) > 0`);
      parameters[paramName] = value;
    });

    const logicalOperator =
      filter.operator === FilterOperator.SET_CONTAINS_ALL ? ' AND ' : ' OR ';
    return {
      queryFragment: `(${fieldName} IS NOT NULL AND (${conditions.join(
        logicalOperator,
      )}))`,
      parameters,
    };
  }

  /**
   * Handles filter operators BETWEEN and NOT_BETWEEN.
   * Generates a MySQL query fragment using the BETWEEN operator.
   * Example (BETWEEN): `filter = { field: 'price', operator: FilterOperator.BETWEEN, value: [10, 20] }`
   * Generates: `products.price BETWEEN :param_0 AND :param_1`
   * with parameters `{ param_0: 10, param_1: 20 }`.
   * @param filter The filter object, expecting filter.value to be a two-element array [min, max].
   * @param fieldName The fully qualified field name.
   * @param not A boolean indicating if it's a NOT BETWEEN operation.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleBetween(
    filter: Filter<string, any>,
    fieldName: string,
    not: boolean = false,
  ): TypeOrmConditionFragment {
    const values = filter.value as [
      Exclude<PrimitiveFilterValue, null | undefined>,
      Exclude<PrimitiveFilterValue, null | undefined>,
    ];
    if (
      !Array.isArray(values) ||
      values.length !== 2 ||
      values[0] === null ||
      values[0] === undefined ||
      values[1] === null ||
      values[1] === undefined
    ) {
      return { queryFragment: '1=0', parameters: {} };
    }
    const paramMin = this.parameterManager.generateParamName();
    const paramMax = this.parameterManager.generateParamName();
    return {
      queryFragment: `${fieldName} ${
        not ? 'NOT ' : ''
      }BETWEEN :${paramMin} AND :${paramMax}`,
      parameters: {
        [paramMin]: values[0],
        [paramMax]: values[1],
      },
    };
  }

  /**
   * Handles the MATCHES_REGEX filter operator.
   * Generates a MySQL query fragment using the REGEXP operator.
   * Example: `filter = { field: 'name', operator: FilterOperator.MATCHES_REGEX, value: '^user[0-9]+$' }`
   * Generates: `users.name REGEXP :param_0`
   * with parameters `{ param_0: '^user[0-9]+$' }`.
   * Note: MySQL uses REGEXP or RLIKE.
   * @param filter The filter object.
   * @param fieldName The fully qualified field name.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleMatchesRegex(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    return {
      queryFragment: `${fieldName} REGEXP :${paramName}`,
      parameters: { [paramName]: filter.value },
    };
  }

  /**
   * Handles ILIKE and NOT_ILIKE filter operators.
   * For MySQL, this typically translates to LIKE and NOT LIKE, as LIKE is
   * often case-insensitive by default depending on collation.
   * Example (ILIKE): `filter = { field: 'title', operator: FilterOperator.ILIKE, value: '%pattern%' }`
   * Generates: `posts.title LIKE :param_0`
   * with parameters `{ param_0: '%pattern%' }`.
   * Note: The filter value should already include '%' wildcards if needed for CONTAINS-like behavior.
   * @param filter The filter object.
   * @param fieldName The fully qualified field name.
   * @param not A boolean indicating if it's a NOT ILIKE operation.
   * @returns A TypeOrmConditionFragment.
   * @private
   */
  private handleILike(
    filter: Filter<string, any>,
    fieldName: string,
    not: boolean = false,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    return {
      queryFragment: `${fieldName} ${not ? 'NOT ' : ''}LIKE :${paramName}`,
      parameters: { [paramName]: filter.value },
    };
  }

  /**
   * Builds a TypeORM condition fragment (SQL query part and parameters)
   * for a given filter.
   * This method dispatches to specific private handlers based on the filter's operator.
   * @param filter The filter object to translate.
   * @param currentAlias The alias of the current entity being queried.
   * @returns A TypeOrmConditionFragment.
   * @public
   * @throws Error if an unsupported filter operator is encountered.
   */
  public build(
    filter: Filter<string, FilterOperator>,
    currentAlias: string,
  ): TypeOrmConditionFragment {
    const fieldName = `${currentAlias}.${String(filter.field)}`;

    switch (filter.operator) {
      case FilterOperator.EQUALS:
        return this.handleBasicComparison(filter, fieldName, '=');
      case FilterOperator.NOT_EQUALS:
        return this.handleBasicComparison(filter, fieldName, '!=');
      case FilterOperator.GREATER_THAN:
        return this.handleBasicComparison(filter, fieldName, '>');
      case FilterOperator.GREATER_THAN_OR_EQUALS:
        return this.handleBasicComparison(filter, fieldName, '>=');
      case FilterOperator.LESS_THAN:
        return this.handleBasicComparison(filter, fieldName, '<');
      case FilterOperator.LESS_THAN_OR_EQUALS:
        return this.handleBasicComparison(filter, fieldName, '<=');
      case FilterOperator.LIKE:
        return this.handleLikeComparison(filter, fieldName, (v) => v);
      case FilterOperator.NOT_LIKE:
        return this.handleLikeComparison(filter, fieldName, (v) => v, true);
      case FilterOperator.CONTAINS:
        return this.handleLikeComparison(filter, fieldName, (v) => `%${v}%`);
      case FilterOperator.NOT_CONTAINS:
        return this.handleLikeComparison(
          filter,
          fieldName,
          (v) => `%${v}%`,
          true,
        );
      case FilterOperator.STARTS_WITH:
        return this.handleLikeComparison(filter, fieldName, (v) => `${v}%`);
      case FilterOperator.ENDS_WITH:
        return this.handleLikeComparison(filter, fieldName, (v) => `%${v}`);
      case FilterOperator.IN:
        return this.handleInComparison(filter, fieldName);
      case FilterOperator.NOT_IN:
        return this.handleInComparison(filter, fieldName, true);
      case FilterOperator.IS_NULL:
        return this.handleNullComparison(fieldName);
      case FilterOperator.IS_NOT_NULL:
        return this.handleNullComparison(fieldName, true);
      case FilterOperator.SET_CONTAINS:
      case FilterOperator.SET_NOT_CONTAINS:
        return this.handleSetContains(filter, fieldName);
      case FilterOperator.SET_CONTAINS_ANY:
      case FilterOperator.SET_CONTAINS_ALL:
        return this.handleSetContainsAnyOrAll(filter, fieldName);
      case FilterOperator.BETWEEN:
        return this.handleBetween(filter, fieldName);
      case FilterOperator.NOT_BETWEEN:
        return this.handleBetween(filter, fieldName, true);
      case FilterOperator.MATCHES_REGEX:
        return this.handleMatchesRegex(filter, fieldName);
      case FilterOperator.ILIKE:
        return this.handleILike(filter, fieldName);
      case FilterOperator.NOT_ILIKE:
        return this.handleILike(filter, fieldName, true);
      case FilterOperator.JSON_CONTAINS:
      case FilterOperator.JSON_NOT_CONTAINS:
        return this.handleJsonContains(filter, fieldName);
      case FilterOperator.ARRAY_CONTAINS_ELEMENT:
        return this.handleArrayContainsElement(filter, fieldName);
      case FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS:
      case FilterOperator.ARRAY_CONTAINS_ANY_ELEMENT:
        return this.handleArrayContainsMultipleElements(filter, fieldName);
      case FilterOperator.ARRAY_EQUALS:
        return this.handleArrayEquals(filter, fieldName);
      default:
        const _exhaustiveCheck: never = filter.operator;
        throw new Error(`Unsupported filter operator: ${_exhaustiveCheck}`);
    }
  }
}
