import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import { FilterOperator, type Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles SET_CONTAINS_ANY and SET_CONTAINS_ALL operators for MySQL's FIND_IN_SET.
 */
export class SetContainsAnyAllHandler implements IFilterOperatorHandler {
  /**
   * @inheritdoc
   */
  public build(
    fieldName: string,
    filter: Filter<string, any>,
    parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment {
    const values = filter.value as string[];
    const conditions: string[] = [];
    const parameters: { [key: string]: any } = {};
    const logicalOperator =
      filter.operator === FilterOperator.SET_CONTAINS_ALL ? 'AND' : 'OR';

    values.forEach((value, _index) => {
      const paramName = parameterManager.generateParamName();
      conditions.push(`FIND_IN_SET(:${paramName}, ${fieldName}) > 0`);
      parameters[paramName] = value;
    });

    const queryFragment = `(${fieldName} IS NOT NULL AND (${conditions.join(` ${logicalOperator} `)}))`;

    return {
      queryFragment,
      parameters,
    };
  }
}
