import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles BETWEEN and NOT BETWEEN operators.
 */
export class BetweenComparisonHandler implements IFilterOperatorHandler {
  /**
   * Constructs a new BetweenComparisonHandler.
   * @param not True if the operator is NOT BETWEEN, false otherwise.
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
    const [value1, value2] = filter.value as [any, any];
    const paramName1 = parameterManager.generateParamName();
    const paramName2 = parameterManager.generateParamName();

    return {
      queryFragment: `${fieldName} ${this.not ? 'NOT ' : ''}BETWEEN :${paramName1} AND :${paramName2}`,
      parameters: { [paramName1]: value1, [paramName2]: value2 },
    };
  }
}
