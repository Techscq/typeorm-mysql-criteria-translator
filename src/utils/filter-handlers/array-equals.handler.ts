import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';
import type { ObjectLiteral } from 'typeorm';

/**
 * Handles ARRAY_EQUALS and ARRAY_NOT_EQUALS operators for JSON arrays.
 */
export class ArrayEqualsHandler implements IFilterOperatorHandler {
  /**
   * Constructs a new ArrayEqualsHandler.
   * @param not True if the operator is ARRAY_NOT_EQUALS, false otherwise.
   */
  constructor(private not: boolean = false) {}

  /**
   * @inheritdoc
   */
  public build(
    fieldName: string,
    filter: Filter<string, any>,
    parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment {
    const value = filter.value;
    let path: string | undefined;
    let arrayValue: any[];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const key = Object.keys(value)[0]!;
      path = `$.${key.replace(/\./g, '.')}`;
      arrayValue = (value as ObjectLiteral)[key] as any[];
    } else {
      arrayValue = value as any[];
    }

    const jsonExtract = path
      ? `JSON_EXTRACT(${fieldName}, '${path}')`
      : fieldName;

    if (arrayValue.length === 0) {
      const paramName = parameterManager.generateParamName();
      const condition = `JSON_LENGTH(${jsonExtract}) = :${paramName}`;
      const queryFragment = this.not ? `NOT (${condition})` : condition;
      return { queryFragment, parameters: { [paramName]: 0 } };
    }

    const lengthParamName = parameterManager.generateParamName();
    const conditions: string[] = [];
    const parameters: { [key: string]: any } = {
      [lengthParamName]: arrayValue.length,
    };

    const lengthCondition = `JSON_LENGTH(${jsonExtract}) ${
      this.not ? '!=' : '='
    } :${lengthParamName}`;
    conditions.push(lengthCondition);

    arrayValue.forEach((element) => {
      const elementParamName = parameterManager.generateParamName();
      const containsCondition = `JSON_CONTAINS(${jsonExtract}, :${elementParamName}, '$')`;
      conditions.push(
        this.not ? `NOT ${containsCondition}` : containsCondition,
      );
      parameters[elementParamName] = JSON.stringify(element);
    });

    const logicalOperator = this.not ? 'OR' : 'AND';
    const combinedConditions = `(${conditions.join(` ${logicalOperator} `)})`;

    const queryFragment = this.not
      ? `(${fieldName} IS NULL OR ${jsonExtract} IS NULL OR ${combinedConditions})`
      : `(${fieldName} IS NOT NULL AND ${jsonExtract} IS NOT NULL AND ${combinedConditions})`;

    return {
      queryFragment,
      parameters,
    };
  }
}