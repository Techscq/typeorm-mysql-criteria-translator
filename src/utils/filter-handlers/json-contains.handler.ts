import { Filter, FilterOperator } from '@nulledexp/translatable-criteria';
import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

export class JsonContainsHandler implements IFilterOperatorHandler {
  public build(
    fieldName: string,
    filter: Filter<
      string,
      FilterOperator.JSON_CONTAINS | FilterOperator.JSON_NOT_CONTAINS
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
    const isNotContains = filter.operator === FilterOperator.JSON_NOT_CONTAINS;
    const logicalOperator = isNotContains ? ' OR ' : ' AND ';

    for (const path in filter.value) {
      const paramName = parameterManager.generateParamName();
      const jsonValue = (filter.value as Record<string, any>)[path];

      let condition = `JSON_CONTAINS(${fieldName}, :${paramName}, '$.${path}')`;
      if (isNotContains) {
        condition = `NOT ${condition}`;
      }

      conditions.push(condition);
      parameters[paramName] = JSON.stringify(jsonValue);
    }

    if (conditions.length === 0) {
      return {
        queryFragment: '1=1',
        parameters: {},
      };
    }

    return {
      queryFragment: conditions.join(logicalOperator),
      parameters,
    };
  }
}
