import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';

/**
 * Handles JSON_CONTAINS and JSON_NOT_CONTAINS operators.
 */
export class JsonContainsHandler implements IFilterOperatorHandler {
  /**
   * Constructs a new JsonContainsHandler.
   * @param not True if the operator is JSON_NOT_CONTAINS, false otherwise.
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
    const path = key.includes('.') ? `$.${key.replace(/\./g, '.')}` : `$.${key}`;
    const paramName = parameterManager.generateParamName();

    const jsonExtract = `JSON_EXTRACT(${fieldName}, '${path}')`;

    const queryFragment = this.not
      ? `(${jsonExtract} IS NULL OR ${jsonExtract} <> :${paramName})`
      : `${jsonExtract} = :${paramName}`;

    return {
      queryFragment,
      parameters: { [paramName]: value[key] },
    };
  }
}