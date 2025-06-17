import type { ObjectLiteral } from 'typeorm';
import type { TypeOrmParameterManager } from './type-orm-parameter-manager.js';
import {
  type Filter,
  FilterOperator,
  type PrimitiveFilterValue,
} from '@nulledexp/translatable-criteria';

export type TypeOrmConditionFragment = {
  queryFragment: string;
  parameters: ObjectLiteral;
};

export class TypeOrmFilterFragmentBuilder {
  constructor(private parameterManager: TypeOrmParameterManager) {}

  private handleBasicComparison(
    filter: Filter<string, any>,
    fieldName: string,
    operatorString: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    return {
      queryFragment: `${fieldName} ${operatorString} :${paramName}`,
      parameters: { [paramName]: filter.value },
    };
  }

  private handleLikeComparison(
    filter: Filter<string, any>,
    fieldName: string,
    pattern: (value: any) => string,
    not: boolean = false,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    return {
      queryFragment: `${fieldName} ${not ? 'NOT ' : ''}LIKE :${paramName}`,
      parameters: { [paramName]: pattern(filter.value) },
    };
  }

  private handleInComparison(
    filter: Filter<string, any>,
    fieldName: string,
    not: boolean = false,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    return {
      queryFragment: `${fieldName} ${not ? 'NOT ' : ''}IN (:...${paramName})`,
      parameters: { [paramName]: filter.value },
    };
  }

  private handleNullComparison(
    fieldName: string,
    not: boolean = false,
  ): TypeOrmConditionFragment {
    return {
      queryFragment: `${fieldName} IS ${not ? 'NOT ' : ''}NULL`,
      parameters: {},
    };
  }

  private handleSetContains(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();

    if (filter.operator === FilterOperator.SET_CONTAINS) {
      // Para SET_CONTAINS, el campo NO debe ser NULL Y el elemento debe encontrarse.
      return {
        queryFragment: `(${fieldName} IS NOT NULL AND FIND_IN_SET(:${paramName}, ${fieldName}) > 0)`,
        parameters: { [paramName]: filter.value },
      };
    } else {
      // FilterOperator.SET_NOT_CONTAINS
      // Para SET_NOT_CONTAINS, es verdadero si el campo ES NULL O el elemento no se encuentra.
      return {
        queryFragment: `(${fieldName} IS NULL OR FIND_IN_SET(:${paramName}, ${fieldName}) = 0)`,
        parameters: { [paramName]: filter.value },
      };
    }
  }

  private handleJsonContains(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const jsonConditions: string[] = [];
    const parameters: ObjectLiteral = {};

    const baseParamName = this.parameterManager.generateParamName();
    Object.entries(filter.value as ObjectLiteral).forEach(
      ([path, val], index) => {
        const currentParamName = `${baseParamName}_json_${index}`;
        const fullPath = path.startsWith('$') ? path : `$.${path}`;
        const extractedPath = `JSON_EXTRACT(${fieldName}, '${fullPath}')`;

        if (filter.operator === FilterOperator.JSON_NOT_CONTAINS) {
          jsonConditions.push(
            `(${extractedPath} IS NULL OR ${extractedPath} <> :${currentParamName})`,
          );
        } else {
          // JSON_CONTAINS
          jsonConditions.push(`${extractedPath} = :${currentParamName}`);
        }
        // ... (manejo de parámetros igual que antes)
        if (typeof val === 'object' && val !== null) {
          parameters[currentParamName] = JSON.stringify(val);
        } else {
          parameters[currentParamName] = val;
        }
      },
    );

    if (jsonConditions.length === 0) {
      return {
        queryFragment:
          filter.operator === FilterOperator.JSON_CONTAINS ? '1=0' : '1=1',
        parameters,
      };
    }
    return {
      queryFragment: `(${jsonConditions.join(' AND ')})`,
      parameters,
    };
  }

  private handleArrayContainsElement(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    if (typeof filter.value === 'object' && filter.value !== null) {
      const pathValueMap = filter.value as {
        [key: string]: PrimitiveFilterValue;
      };
      const jsonPathKey = Object.keys(pathValueMap)[0]!;
      const elementToContain = pathValueMap[jsonPathKey];
      const fullJsonPath = jsonPathKey.startsWith('$')
        ? jsonPathKey
        : `$.${jsonPathKey}`;
      return {
        queryFragment: `JSON_CONTAINS(${fieldName}, :${paramName}, '${fullJsonPath}')`,
        parameters: { [paramName]: JSON.stringify(elementToContain) },
      };
    }
    return {
      queryFragment: `JSON_CONTAINS(${fieldName}, :${paramName})`,
      parameters: { [paramName]: JSON.stringify(filter.value) },
    };
  }

  private handleArrayContainsMultipleElements(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    const logicalJoin =
      filter.operator === FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS
        ? ' AND '
        : ' OR ';
    const emptyReturn =
      filter.operator === FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS
        ? '1=1'
        : '1=0';
    const paramPrefix =
      filter.operator === FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS
        ? 'all'
        : 'any';
    const parameters: ObjectLiteral = {};
    let elementsToContain: Array<
      Exclude<PrimitiveFilterValue, null | undefined>
    >;
    let fullJsonPath: string | undefined;

    if (
      typeof filter.value === 'object' &&
      filter.value !== null &&
      !Array.isArray(filter.value)
    ) {
      const pathValueMap = filter.value as {
        [key: string]: Array<Exclude<PrimitiveFilterValue, null | undefined>>;
      };
      const jsonPathKey = Object.keys(pathValueMap)[0]!;
      elementsToContain = pathValueMap[jsonPathKey]!;
      fullJsonPath = jsonPathKey.startsWith('$')
        ? jsonPathKey
        : `$.${jsonPathKey}`;
    } else {
      elementsToContain = filter.value as Array<
        Exclude<PrimitiveFilterValue, null | undefined>
      >;
    }

    if (!elementsToContain || elementsToContain.length === 0) {
      return { queryFragment: emptyReturn, parameters };
    }

    const conditions: string[] = [];
    elementsToContain.forEach((element, index) => {
      const currentParamName = `${paramName}_${paramPrefix}_${index}`;
      conditions.push(
        `JSON_CONTAINS(${fieldName}, :${currentParamName}${fullJsonPath ? `, '${fullJsonPath}'` : ''})`,
      );
      parameters[currentParamName] = JSON.stringify(element);
    });

    return {
      queryFragment: `(${conditions.join(logicalJoin)})`,
      parameters,
    };
  }

  private handleArrayEquals(
    filter: Filter<string, any>,
    fieldName: string,
  ): TypeOrmConditionFragment {
    const paramName = this.parameterManager.generateParamName();
    const conditions: string[] = [];
    const parameters: ObjectLiteral = {};
    let elementsToCompare: Array<
      Exclude<PrimitiveFilterValue, null | undefined>
    >;
    let fullJsonPath: string | undefined;

    if (
      typeof filter.value === 'object' &&
      filter.value !== null &&
      !Array.isArray(filter.value)
    ) {
      const pathValueMap = filter.value as {
        [key: string]: Array<Exclude<PrimitiveFilterValue, null | undefined>>;
      };
      const jsonPathKey = Object.keys(pathValueMap)[0]!;
      elementsToCompare = pathValueMap[jsonPathKey]!;
      fullJsonPath = jsonPathKey.startsWith('$')
        ? jsonPathKey
        : `$.${jsonPathKey}`;
    } else {
      elementsToCompare = filter.value as Array<
        Exclude<PrimitiveFilterValue, null | undefined>
      >;
    }

    if (!elementsToCompare || elementsToCompare.length === 0) {
      const lengthCheckParam = `${paramName}_len`;
      const queryFragment = `JSON_LENGTH(${fullJsonPath ? `JSON_EXTRACT(${fieldName}, '${fullJsonPath}')` : fieldName}) = :${lengthCheckParam}`;
      parameters[lengthCheckParam] = 0;
      return { queryFragment, parameters };
    }

    const lengthParamName = `${paramName}_len`;
    conditions.push(
      `JSON_LENGTH(${fullJsonPath ? `JSON_EXTRACT(${fieldName}, '${fullJsonPath}')` : fieldName}) = :${lengthParamName}`,
    );
    parameters[lengthParamName] = elementsToCompare.length;

    elementsToCompare.forEach((element, index) => {
      const currentParamName = `${paramName}_eq_el_${index}`;
      conditions.push(
        `JSON_CONTAINS(${fullJsonPath ? `JSON_EXTRACT(${fieldName}, '${fullJsonPath}')` : fieldName}, :${currentParamName}, '$')`,
      );
      parameters[currentParamName] = JSON.stringify(element);
    });

    return {
      queryFragment: `(${conditions.join(' AND ')})`,
      parameters,
    };
  }

  public build(
    filter: Filter<string, FilterOperator>,
    currentAlias: string,
  ): TypeOrmConditionFragment {
    const fieldName = `${currentAlias}.${String(filter.field)}`;

    switch (filter.operator) {
      case FilterOperator.EQUALS:
        return this.handleBasicComparison(filter, fieldName, '=');
      case FilterOperator.NOT_EQUALS:
        return this.handleBasicComparison(filter, fieldName, '!=');
      case FilterOperator.GREATER_THAN:
        return this.handleBasicComparison(filter, fieldName, '>');
      case FilterOperator.GREATER_THAN_OR_EQUALS:
        return this.handleBasicComparison(filter, fieldName, '>=');
      case FilterOperator.LESS_THAN:
        return this.handleBasicComparison(filter, fieldName, '<');
      case FilterOperator.LESS_THAN_OR_EQUALS:
        return this.handleBasicComparison(filter, fieldName, '<=');
      case FilterOperator.LIKE:
        return this.handleLikeComparison(filter, fieldName, (v) => v);
      case FilterOperator.NOT_LIKE:
        return this.handleLikeComparison(filter, fieldName, (v) => v, true);
      case FilterOperator.CONTAINS:
        return this.handleLikeComparison(filter, fieldName, (v) => `%${v}%`);
      case FilterOperator.NOT_CONTAINS:
        return this.handleLikeComparison(
          filter,
          fieldName,
          (v) => `%${v}%`,
          true,
        );
      case FilterOperator.STARTS_WITH:
        return this.handleLikeComparison(filter, fieldName, (v) => `${v}%`);
      case FilterOperator.ENDS_WITH:
        return this.handleLikeComparison(filter, fieldName, (v) => `%${v}`);
      case FilterOperator.IN:
        return this.handleInComparison(filter, fieldName);
      case FilterOperator.NOT_IN:
        return this.handleInComparison(filter, fieldName, true);
      case FilterOperator.IS_NULL:
        return this.handleNullComparison(fieldName);
      case FilterOperator.IS_NOT_NULL:
        return this.handleNullComparison(fieldName, true);
      case FilterOperator.SET_CONTAINS:
      case FilterOperator.SET_NOT_CONTAINS:
        return this.handleSetContains(filter, fieldName);
      case FilterOperator.JSON_CONTAINS:
      case FilterOperator.JSON_NOT_CONTAINS:
        return this.handleJsonContains(filter, fieldName);
      case FilterOperator.ARRAY_CONTAINS_ELEMENT:
        return this.handleArrayContainsElement(filter, fieldName);
      case FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS:
      case FilterOperator.ARRAY_CONTAINS_ANY_ELEMENT:
        return this.handleArrayContainsMultipleElements(filter, fieldName);
      case FilterOperator.ARRAY_EQUALS:
        return this.handleArrayEquals(filter, fieldName);
      default:
        const _exhaustiveCheck: never = filter.operator;
        throw new Error(`Unsupported filter operator: ${_exhaustiveCheck}`);
    }
  }
}
