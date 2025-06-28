import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles SET_CONTAINS and SET_NOT_CONTAINS operators for MySQL's FIND_IN_SET.
 */
export class SetContainsHandler implements IFilterOperatorHandler {
  /**
   * Constructs a new SetContainsHandler.
   * @param not True if the operator is SET_NOT_CONTAINS, false otherwise.
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
    const paramName = parameterManager.generateParamName();
    const queryFragment = this.not
      ? `(${fieldName} IS NULL OR FIND_IN_SET(:${paramName}, ${fieldName}) = 0)`
      : `(${fieldName} IS NOT NULL AND FIND_IN_SET(:${paramName}, ${fieldName}) > 0)`;

    return {
      queryFragment,
      parameters: { [paramName]: filter.value },
    };
  }
}
