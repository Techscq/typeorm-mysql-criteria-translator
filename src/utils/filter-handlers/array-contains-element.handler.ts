import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import { FilterOperator, type Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';
import type { ObjectLiteral } from 'typeorm';

/**
 * Handles ARRAY_CONTAINS_ELEMENT and ARRAY_NOT_CONTAINS_ELEMENT operators for JSON arrays.
 */
export class ArrayContainsElementHandler implements IFilterOperatorHandler {
  /**
   * @inheritdoc
   */
  public build(
    fieldName: string,
    filter: Filter<
      string,
      | FilterOperator.ARRAY_CONTAINS_ELEMENT
      | FilterOperator.ARRAY_NOT_CONTAINS_ELEMENT
    >,
    parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment {
    const value = filter.value;
    let path: string | undefined;
    let elementValue: any;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const key = Object.keys(value)[0]!;
      path = `$.${key.replace(/\./g, '.')}`;
      elementValue = (value as ObjectLiteral)[key];
    } else {
      elementValue = value;
    }

    const paramName = parameterManager.generateParamName();
    const jsonValue = JSON.stringify(elementValue);

    const isNotContains =
      filter.operator === FilterOperator.ARRAY_NOT_CONTAINS_ELEMENT;

    const condition = path
      ? `JSON_CONTAINS(${fieldName}, :${paramName}, '${path}')`
      : `JSON_CONTAINS(${fieldName}, :${paramName})`;

    const queryFragment = isNotContains ? `${condition} = 0` : condition;

    return {
      queryFragment,
      parameters: { [paramName]: jsonValue },
    };
  }
}