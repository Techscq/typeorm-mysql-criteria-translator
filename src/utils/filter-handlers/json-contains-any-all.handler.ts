import { Filter, FilterOperator } from '@nulledexp/translatable-criteria';
import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles JSON_CONTAINS_ANY, JSON_CONTAINS_ALL and their NOT counterparts.
 */
export class JsonContainsAnyAllHandler implements IFilterOperatorHandler {
  /**
   * Constructs a new JsonContainsAnyAllHandler.
   * @param not True if the operator is a NOT operator, false otherwise.
   */
  constructor(private not: boolean = false) {}

  /**
   * @inheritdoc
   */
  public build(
    fieldName: string,
    filter: Filter<
      string,
      | FilterOperator.JSON_CONTAINS_ANY
      | FilterOperator.JSON_CONTAINS_ALL
      | FilterOperator.JSON_NOT_CONTAINS_ANY
      | FilterOperator.JSON_NOT_CONTAINS_ALL
    >,
    parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment {
    if (typeof filter.value !== 'object' || filter.value === null) {
      return { queryFragment: '1=0', parameters: {} };
    }

    const pathConditions: string[] = [];
    const parameters: Record<string, any> = {};

    const isAllOperator =
      filter.operator === FilterOperator.JSON_CONTAINS_ALL ||
      filter.operator === FilterOperator.JSON_NOT_CONTAINS_ALL;

    const logicalOperatorForValues = isAllOperator
      ? this.not
        ? 'OR'
        : 'AND'
      : this.not
        ? 'AND'
        : 'OR';

    const logicalOperatorForPaths = this.not ? 'OR' : 'AND';

    for (const path in filter.value) {
      const valuesToSearch = (filter.value as Record<string, any>)[path];

      if (!Array.isArray(valuesToSearch) || valuesToSearch.length === 0) {
        continue;
      }

      const singlePathValueConditions = valuesToSearch.map((value) => {
        const paramName = parameterManager.generateParamName();
        parameters[paramName] = JSON.stringify(value);
        const condition = `JSON_CONTAINS(${fieldName}, :${paramName}, '$.${path}')`;
        return this.not ? `NOT ${condition}` : condition;
      });

      if (singlePathValueConditions.length > 1) {
        pathConditions.push(
          `(${singlePathValueConditions.join(` ${logicalOperatorForValues} `)})`,
        );
      } else {
        pathConditions.push(singlePathValueConditions[0]!);
      }
    }

    if (pathConditions.length === 0) {
      return { queryFragment: '1=1', parameters: {} };
    }

    const combinedConditions = pathConditions.join(
      ` ${logicalOperatorForPaths} `,
    );

    const queryFragment = this.not
      ? `(${fieldName} IS NULL OR ${combinedConditions})`
      : `(${fieldName} IS NOT NULL AND ${combinedConditions})`;

    return {
      queryFragment,
      parameters,
    };
  }
}
