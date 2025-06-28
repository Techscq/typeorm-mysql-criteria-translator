import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import { FilterOperator, type Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles ARRAY_CONTAINS_ANY_ELEMENT, ARRAY_CONTAINS_ALL_ELEMENTS and their NOT counterparts.
 */
export class ArrayContainsAnyAllElementsHandler
  implements IFilterOperatorHandler
{
  /**
   * Constructs a new ArrayContainsAnyAllElementsHandler.
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
    const value = filter.value as Record<string, any>;
    const key = Object.keys(value)[0]!;
    const elements = value[key] as any[];
    const path = `$.${key.replace(/\./g, '.')}`;

    if (elements.length === 0) {
      return { queryFragment: '1=1', parameters: {} };
    }

    // De Morgan's laws: Flip logical operator on negation
    const isAllOperator =
      filter.operator === FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS ||
      filter.operator === FilterOperator.ARRAY_NOT_CONTAINS_ALL_ELEMENTS;

    const logicalOperator = isAllOperator
      ? this.not
        ? 'OR'
        : 'AND'
      : this.not
        ? 'AND'
        : 'OR';

    const conditions: string[] = [];
    const parameters: { [key: string]: any } = {};

    elements.forEach((element) => {
      const paramName = parameterManager.generateParamName();
      const condition = `JSON_CONTAINS(${fieldName}, :${paramName}, '${path}')`;
      conditions.push(this.not ? `NOT ${condition}` : condition);
      parameters[paramName] = JSON.stringify(element);
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