import type { IFilterOperatorHandler } from './filter-operator-handler.interface.js';
import type { TypeOrmConditionFragment } from '../type-orm-filter-fragment-builder.js';
import type { Filter } from '@nulledexp/translatable-criteria';
import type { TypeOrmParameterManager } from '../type-orm-parameter-manager.js';
import type { ObjectLiteral } from 'typeorm';

/**
 * Handles ARRAY_EQUALS operator for JSON arrays.
 */
export class ArrayEqualsHandler implements IFilterOperatorHandler {
  /**
   * @inheritdoc
   */
  public build(
    fieldName: string,
    filter: Filter<string, any>,
    parameterManager: TypeOrmParameterManager,
  ): TypeOrmConditionFragment {
    const value = filter.value;
    let path: string | undefined;
    let arrayValue: any[];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const key = Object.keys(value)[0]!;
      path = `$.${key.replace(/\./g, '.')}`;
      arrayValue = (value as ObjectLiteral)[key] as any[];
    } else {
      arrayValue = value as any[];
    }

    const lengthParamName = parameterManager.generateParamName();
    const conditions: string[] = [];
    const parameters: { [key: string]: any } = {
      [lengthParamName]: arrayValue.length,
    };

    const jsonExtract = path ? `JSON_EXTRACT(${fieldName}, '${path}')` : fieldName;

    conditions.push(`JSON_LENGTH(${jsonExtract}) = :${lengthParamName}`);

    arrayValue.forEach((element, _index) => {
      const elementParamName = parameterManager.generateParamName();
      conditions.push(`JSON_CONTAINS(${jsonExtract}, :${elementParamName}, '$')`);
      parameters[elementParamName] = JSON.stringify(element);
    });

    return {
      queryFragment: `(${conditions.join(' AND ')})`,
      parameters,
    };
  }
}