import type { Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Defines the contract for a class that handles a specific filter operator
 * and builds a TypeORM condition fragment for it.
 */
export interface IFilterOperatorHandler {
  /**
   * Builds a TypeOrmConditionFragment for a specific filter operator.
   * @param fieldName The fully qualified field name (e.g., "alias.field").
   * @param filter The filter object to process.
   * @param parameterManager The parameter manager to generate unique parameter names.
   * @returns A TypeOrmConditionFragment representing the SQL condition.
   */
  build(
    fieldName: string,
    filter: Filter<string, any>,
    parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment;
}
