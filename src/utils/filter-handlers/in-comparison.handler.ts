import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles IN and NOT IN operators.
 */
export class InComparisonHandler implements IFilterOperatorHandler {
  constructor(private not: boolean = false) {}

  /**
   * @inheritdoc
   */
  public build(
    fieldName: string,
    filter: Filter<string, any>,
    parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment {
    const paramName = parameterManager.generateParamName();
    return {
      queryFragment: `${fieldName} ${this.not ? 'NOT ' : ''}IN (:...${paramName})`,
      parameters: { [paramName]: filter.value },
    };
  }
}
