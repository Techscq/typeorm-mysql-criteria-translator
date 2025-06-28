import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import { FilterOperator, type Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles SET_CONTAINS_ANY, SET_CONTAINS_ALL and their NOT counterparts
 * for MySQL's FIND_IN_SET.
 */
export class SetContainsAnyAllHandler implements IFilterOperatorHandler {
  /**
   * Constructs a new SetContainsAnyAllHandler.
   * @param not True if the operator is a NOT operator, false otherwise.
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
    const values = filter.value as string[];
    if (values.length === 0) {
      return { queryFragment: '1=1', parameters: {} };
    }

    const conditions: string[] = [];
    const parameters: { [key: string]: any } = {};

    const isAllOperator =
      filter.operator === FilterOperator.SET_CONTAINS_ALL ||
      filter.operator === FilterOperator.SET_NOT_CONTAINS_ALL;

    const logicalOperator = isAllOperator
      ? this.not
        ? 'OR'
        : 'AND'
      : this.not
        ? 'AND'
        : 'OR';

    values.forEach((value) => {
      const paramName = parameterManager.generateParamName();
      const condition = `FIND_IN_SET(:${paramName}, ${fieldName})`;
      conditions.push(this.not ? `${condition} = 0` : `${condition} > 0`);
      parameters[paramName] = value;
    });

    const combinedConditions = `(${conditions.join(` ${logicalOperator} `)})`;

    const queryFragment = this.not
      ? `(${fieldName} IS NULL OR ${combinedConditions})`
      : `(${fieldName} IS NOT NULL AND ${combinedConditions})`;

    return {
      queryFragment,
      parameters,
    };
  }
}
