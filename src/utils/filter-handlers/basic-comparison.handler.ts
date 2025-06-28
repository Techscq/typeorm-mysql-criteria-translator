import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles basic comparison operators like =, !=, >, <, >=, <=.
 */
export class BasicComparisonHandler implements IFilterOperatorHandler {
  constructor(private operatorString: string) {}

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
      queryFragment: `${fieldName} ${this.operatorString} :${paramName}`,
      parameters: { [paramName]: filter.value },
    };
  }
}
