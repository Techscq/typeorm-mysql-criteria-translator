import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import { FilterOperator, type Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles ARRAY_CONTAINS_ANY_ELEMENT and ARRAY_CONTAINS_ALL_ELEMENTS operators for JSON arrays.
 */
export class ArrayContainsAnyAllElementsHandler implements IFilterOperatorHandler {
  /**
   * @inheritdoc
   */
  public build(
    fieldName: string,
    filter: Filter<string, any>,
    parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment {
    const value = filter.value as Record<string, any>;
    const key = Object.keys(value)[0]!;
    const elements = value[key] as any[];
    const path = `$.${key.replace(/\./g, '.')}`;

    const logicalOperator =
      filter.operator === FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS ? 'AND' : 'OR';

    const conditions: string[] = [];
    const parameters: { [key: string]: any } = {};

    elements.forEach((element, _index) => {
      const paramName = parameterManager.generateParamName();
      conditions.push(`JSON_CONTAINS(${fieldName}, :${paramName}, '${path}')`);
      parameters[paramName] = JSON.stringify(element);
    });

    return {
      queryFragment: `(${conditions.join(` ${logicalOperator} `)})`,
      parameters,
    };
  }
}