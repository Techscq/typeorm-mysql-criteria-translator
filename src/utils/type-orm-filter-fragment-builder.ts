import type { ObjectLiteral } from 'typeorm';
import type { TypeOrmParameterManager } from './type-orm-parameter-manager.js';
import { type Filter, FilterOperator } from '@nulledexp/translatable-criteria';
import type { IFilterOperatorHandler } from './filter-handlers/filter-operator-handler.interface.js';
import { BasicComparisonHandler } from './filter-handlers/basic-comparison.handler.js';
import { LikeComparisonHandler } from './filter-handlers/like-comparison.handler.js';
import { InComparisonHandler } from './filter-handlers/in-comparison.handler.js';
import { NullComparisonHandler } from './filter-handlers/null-comparison.handler.js';
import { BetweenComparisonHandler } from './filter-handlers/between-comparison.handler.js';
import { RegexComparisonHandler } from './filter-handlers/regex-comparison.handler.js';
import { SetContainsHandler } from './filter-handlers/set-contains.handler.js';
import { SetContainsAnyAllHandler } from './filter-handlers/set-contains-any-all.handler.js';
import { JsonContainsHandler } from './filter-handlers/json-contains.handler.js';
import { ArrayContainsElementHandler } from './filter-handlers/array-contains-element.handler.js';
import { ArrayContainsAnyAllElementsHandler } from './filter-handlers/array-contains-any-all-elements.handler.js';
import { ArrayEqualsHandler } from './filter-handlers/array-equals.handler.js';

export type TypeOrmConditionFragment = {
  queryFragment: string;
  parameters: ObjectLiteral;
};

/**
 * Builds SQL query fragments and parameters for individual filters
 * by dispatching to specialized operator handlers.
 */
export class TypeOrmFilterFragmentBuilder {
  private readonly operatorHandlers: Map<
    FilterOperator,
    IFilterOperatorHandler
  >;

  constructor(private parameterManager: TypeOrmParameterManager) {
    this.operatorHandlers = this.initializeHandlers();
  }

  /**
   * Initializes and registers all filter operator handlers.
   * @returns A map of FilterOperators to their corresponding handlers.
   * @private
   */
  private initializeHandlers(): Map<FilterOperator, IFilterOperatorHandler> {
    const handlers = new Map<FilterOperator, IFilterOperatorHandler>();

    handlers.set(FilterOperator.EQUALS, new BasicComparisonHandler('='));
    handlers.set(FilterOperator.NOT_EQUALS, new BasicComparisonHandler('!='));
    handlers.set(FilterOperator.GREATER_THAN, new BasicComparisonHandler('>'));
    handlers.set(
      FilterOperator.GREATER_THAN_OR_EQUALS,
      new BasicComparisonHandler('>='),
    );
    handlers.set(FilterOperator.LESS_THAN, new BasicComparisonHandler('<'));
    handlers.set(
      FilterOperator.LESS_THAN_OR_EQUALS,
      new BasicComparisonHandler('<='),
    );

    handlers.set(FilterOperator.LIKE, new LikeComparisonHandler((v) => v));
    handlers.set(
      FilterOperator.NOT_LIKE,
      new LikeComparisonHandler((v) => v, true),
    );
    handlers.set(
      FilterOperator.CONTAINS,
      new LikeComparisonHandler((v) => `%${v}%`),
    );
    handlers.set(
      FilterOperator.NOT_CONTAINS,
      new LikeComparisonHandler((v) => `%${v}%`, true),
    );
    handlers.set(
      FilterOperator.STARTS_WITH,
      new LikeComparisonHandler((v) => `${v}%`),
    );
    handlers.set(
      FilterOperator.ENDS_WITH,
      new LikeComparisonHandler((v) => `%${v}`),
    );
    handlers.set(FilterOperator.ILIKE, new LikeComparisonHandler((v) => v));
    handlers.set(
      FilterOperator.NOT_ILIKE,
      new LikeComparisonHandler((v) => v, true),
    );

    handlers.set(FilterOperator.IN, new InComparisonHandler());
    handlers.set(FilterOperator.NOT_IN, new InComparisonHandler(true));

    handlers.set(FilterOperator.IS_NULL, new NullComparisonHandler());
    handlers.set(FilterOperator.IS_NOT_NULL, new NullComparisonHandler(true));

    handlers.set(FilterOperator.BETWEEN, new BetweenComparisonHandler());
    handlers.set(
      FilterOperator.NOT_BETWEEN,
      new BetweenComparisonHandler(true),
    );

    handlers.set(FilterOperator.MATCHES_REGEX, new RegexComparisonHandler());

    handlers.set(FilterOperator.SET_CONTAINS, new SetContainsHandler());
    handlers.set(FilterOperator.SET_NOT_CONTAINS, new SetContainsHandler(true));
    handlers.set(
      FilterOperator.SET_CONTAINS_ANY,
      new SetContainsAnyAllHandler(),
    );
    handlers.set(
      FilterOperator.SET_CONTAINS_ALL,
      new SetContainsAnyAllHandler(),
    );

    handlers.set(FilterOperator.JSON_CONTAINS, new JsonContainsHandler());
    handlers.set(
      FilterOperator.JSON_NOT_CONTAINS,
      new JsonContainsHandler(true),
    );

    handlers.set(
      FilterOperator.ARRAY_CONTAINS_ELEMENT,
      new ArrayContainsElementHandler(),
    );
    handlers.set(
      FilterOperator.ARRAY_CONTAINS_ANY_ELEMENT,
      new ArrayContainsAnyAllElementsHandler(),
    );
    handlers.set(
      FilterOperator.ARRAY_CONTAINS_ALL_ELEMENTS,
      new ArrayContainsAnyAllElementsHandler(),
    );
    handlers.set(FilterOperator.ARRAY_EQUALS, new ArrayEqualsHandler());

    return handlers;
  }

  /**
   * Builds a TypeORM condition fragment for a given filter by dispatching
   * to the appropriate registered handler.
   * @param filter The filter object to translate.
   * @param currentAlias The alias of the current entity being queried.
   * @returns A TypeOrmConditionFragment.
   * @throws Error if a handler for the filter operator is not registered.
   */
  public build(
    filter: Filter<string, FilterOperator>,
    currentAlias: string,
  ): TypeOrmConditionFragment {
    const fieldName = `${currentAlias}.${String(filter.field)}`;
    const handler = this.operatorHandlers.get(filter.operator);

    if (!handler) {
      const _exhaustiveCheck: unknown = filter.operator;
      throw new Error(`Unsupported filter operator: ${_exhaustiveCheck}`);
    }

    return handler.build(fieldName, filter, this.parameterManager);
  }
}
