import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles IS NULL and IS NOT NULL operators.
 */
export class NullComparisonHandler implements IFilterOperatorHandler {
  constructor(private not: boolean = false) {}

  /**
   * @inheritdoc
   */
  public build(
    fieldName: string,
    _filter: Filter<string, any>,
    _parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment {
    return {
      queryFragment: `${fieldName} IS ${this.not ? 'NOT ' : ''}NULL`,
      parameters: {},
    };
  }
}
