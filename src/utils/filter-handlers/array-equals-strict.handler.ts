import { Filter, FilterOperator } from '@nulledexp/translatable-criteria';
import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles ARRAY_EQUALS_STRICT and ARRAY_NOT_EQUALS_STRICT operators.
 */
export class ArrayEqualsStrictHandler implements IFilterOperatorHandler {
  /**
   * Constructs a new ArrayEqualsStrictHandler.
   * @param not True if the operator is a NOT operator, false otherwise.
   */
  constructor(private not: boolean = false) {}

  public build(
    fieldName: string,
    filter: Filter<
      string,
      | FilterOperator.ARRAY_EQUALS_STRICT
      | FilterOperator.ARRAY_NOT_EQUALS_STRICT
    >,
    parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment {
    const paramName = parameterManager.generateParamName();
    let comparisonPart: string;
    let parameters: Record<string, any>;

    if (Array.isArray(filter.value)) {
      comparisonPart = `${fieldName} <=> CAST(:${paramName} AS JSON)`;
      parameters = { [paramName]: JSON.stringify(filter.value) };
    } else if (typeof filter.value === 'object' && filter.value !== null) {
      const path = Object.keys(filter.value)[0];
      const arrayValue = Object.values(filter.value)[0];

      if (path && Array.isArray(arrayValue)) {
        comparisonPart = `JSON_EXTRACT(${fieldName}, '$.${path}') <=> CAST(:${paramName} AS JSON)`;
        parameters = { [paramName]: JSON.stringify(arrayValue) };
      } else {
        return { queryFragment: '1=0', parameters: {} };
      }
    } else {
      return { queryFragment: '1=0', parameters: {} };
    }

    const queryFragment = this.not
      ? `(NOT ${comparisonPart})`
      : `(${comparisonPart} AND ${fieldName} IS NOT NULL)`;

    return {
      queryFragment,
      parameters,
    };
  }
}
