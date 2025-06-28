import { Filter, FilterOperator } from '@nulledexp/translatable-criteria';
import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

export class JsonPathValueEqualsHandler implements IFilterOperatorHandler {
  public build(
    fieldName: string,
    filter: Filter<
      string,
      | FilterOperator.JSON_PATH_VALUE_EQUALS
      | FilterOperator.JSON_PATH_VALUE_NOT_EQUALS
    >,
    parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment {
    if (typeof filter.value !== 'object' || filter.value === null) {
      return {
        queryFragment: '1=0',
        parameters: {},
      };
    }

    const conditions: string[] = [];
    const parameters: Record<string, any> = {};
    const op =
      filter.operator === FilterOperator.JSON_PATH_VALUE_EQUALS ? '=' : '!=';

    for (const path in filter.value) {
      const paramName = parameterManager.generateParamName();
      const jsonValue = (filter.value as Record<string, any>)[path];

      const condition = `JSON_EXTRACT(${fieldName}, '$.${path}') ${op} :${paramName}`;

      conditions.push(condition);
      parameters[paramName] = jsonValue;
    }

    if (conditions.length === 0) {
      return {
        queryFragment: '1=1',
        parameters: {},
      };
    }

    return {
      queryFragment: conditions.join(' AND '),
      parameters,
    };
  }
}
