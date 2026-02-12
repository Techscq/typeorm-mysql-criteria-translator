import { type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import type { TypeOrmConditionBuilder } from './type-orm-condition-builder.js';
import {
  type CriteriaSchema,
  type InnerJoinCriteria,
  type LeftJoinCriteria,
  type PivotJoin,
  type SimpleJoin,
  SelectType,
} from '@nulledexp/translatable-criteria';
import { QueryState } from './query-state.js';

/**
 * Applies join logic to a TypeORM SelectQueryBuilder.
 * Handles ON conditions and field selection based on JoinOptions.
 */
export class TypeOrmJoinApplier<T extends ObjectLiteral> {
  constructor(
    private _conditionBuilder: TypeOrmConditionBuilder,
    private _queryState: QueryState,
  ) {}

  /**
   * Applies INNER or LEFT join logic to the query builder.
   * Constructs the ON clause and handles field selection.
   *
   * @param qb The TypeORM SelectQueryBuilder.
   * @param joinType 'inner' or 'left'.
   * @param criteria The join criteria.
   * @param parameters Join parameters (aliases, mappings, options).
   * @returns Object with the actual alias used for the join.
   */
  public applyJoinLogic(
    qb: SelectQueryBuilder<T>,
    joinType: 'inner' | 'left',
    criteria: InnerJoinCriteria<any> | LeftJoinCriteria<any>,
    parameters:
      | PivotJoin<CriteriaSchema, CriteriaSchema>
      | SimpleJoin<CriteriaSchema, CriteriaSchema>,
  ): { usedAlias: string } {
    if (this.canOptimizeJoin(criteria, parameters)) {
      this.applyOptimizedSelection(
        parameters as SimpleJoin<CriteriaSchema, CriteriaSchema>,
      );
      return { usedAlias: parameters.relation_alias };
    }

    const joinAlias = this.resolveUniqueAlias(qb, parameters.relation_alias);
    const targetTableNameOrRelationProperty = `${parameters.parent_alias}.${parameters.relation_alias}`;

    const { onConditionClause, onConditionParams } = this.buildOnCondition(
      criteria,
      joinAlias,
    );

    const joinMethod = joinType === 'inner' ? qb.innerJoin : qb.leftJoin;

    joinMethod.call(
      qb,
      targetTableNameOrRelationProperty,
      joinAlias,
      onConditionClause,
      onConditionParams,
    );

    this.handleSelection(criteria, parameters, joinAlias);

    return { usedAlias: joinAlias };
  }

  /**
   * Checks if the JOIN can be skipped for optimization.
   * Possible for SimpleJoins on the Owning Side when only ID is needed and no filters/child joins exist.
   */
  private canOptimizeJoin(
    criteria: InnerJoinCriteria<any> | LeftJoinCriteria<any>,
    parameters:
      | PivotJoin<CriteriaSchema, CriteriaSchema>
      | SimpleJoin<CriteriaSchema, CriteriaSchema>,
  ): boolean {
    if (parameters.relation_type === 'many_to_many') {
      return false;
    }

    const simpleParams = parameters as SimpleJoin<
      CriteriaSchema,
      CriteriaSchema
    >;
    const selectType =
      simpleParams.join_options?.select ?? SelectType.FULL_ENTITY;

    if (selectType !== SelectType.ID_ONLY) {
      return false;
    }

    if (criteria.rootFilterGroup.items.length > 0) {
      return false;
    }

    if (criteria.joins.length > 0) {
      return false;
    }

    if (criteria.orders.length > 0) {
      return false;
    }

    return simpleParams.local_field !== simpleParams.parent_identifier;
  }

  /**
   * Resolves a unique alias to avoid collisions in TypeORM.
   */
  private resolveUniqueAlias(
    qb: SelectQueryBuilder<T>,
    baseAlias: string,
  ): string {
    if (!qb.expressionMap.aliases.some((a) => a.name === baseAlias)) {
      return baseAlias;
    }

    let counter = 1;
    let uniqueAlias = `${baseAlias}_${counter}`;
    while (qb.expressionMap.aliases.some((a) => a.name === uniqueAlias)) {
      counter++;
      uniqueAlias = `${baseAlias}_${counter}`;
    }
    return uniqueAlias;
  }

  /**
   * Builds the ON condition clause and parameters.
   */
  private buildOnCondition(
    criteria: InnerJoinCriteria<any> | LeftJoinCriteria<any>,
    joinAlias: string,
  ): { onConditionClause?: string; onConditionParams: ObjectLiteral } {
    if (criteria.rootFilterGroup.items.length === 0) {
      return { onConditionClause: undefined, onConditionParams: {} };
    }

    const onConditionResult =
      this._conditionBuilder.buildConditionStringFromGroup(
        criteria.rootFilterGroup,
        joinAlias,
      );

    if (onConditionResult) {
      return {
        onConditionClause: onConditionResult.conditionString,
        onConditionParams: onConditionResult.parameters,
      };
    }

    return { onConditionClause: undefined, onConditionParams: {} };
  }

  /**
   * Handles field selection, cursor collection, and ordering metadata.
   */
  private handleSelection(
    criteria: InnerJoinCriteria<any> | LeftJoinCriteria<any>,
    parameters:
      | PivotJoin<CriteriaSchema, CriteriaSchema>
      | SimpleJoin<CriteriaSchema, CriteriaSchema>,
    joinAlias: string,
  ): void {
    const selectType =
      parameters.join_options?.select ?? SelectType.FULL_ENTITY;

    switch (selectType) {
      case SelectType.FULL_ENTITY:
        this.applyFullEntitySelection(criteria, parameters, joinAlias);
        break;

      case SelectType.ID_ONLY:
        // Handled by Translator via loadAllRelationIds
        break;

      case SelectType.NO_SELECTION:
        // Join used for filtering only
        break;
    }

    this._queryState.collectCursor(joinAlias, criteria.cursor);
    this._queryState.recordOrderBy(criteria.orders, joinAlias);
  }

  /**
   * Applies logic for FULL_ENTITY selection.
   */
  private applyFullEntitySelection(
    criteria: InnerJoinCriteria<any> | LeftJoinCriteria<any>,
    parameters:
      | PivotJoin<CriteriaSchema, CriteriaSchema>
      | SimpleJoin<CriteriaSchema, CriteriaSchema>,
    joinAlias: string,
  ): void {
    if (criteria.select.length === 0)
      this._queryState.addFieldToSelection(joinAlias);
    this._queryState.resolveSelects(joinAlias, criteria);

    this._queryState.addFieldToSelection(
      `${joinAlias}.${criteria.identifierField}`,
    );
    this._queryState.addFieldToSelection(
      `${parameters.parent_alias}.${parameters.parent_identifier}`,
    );
  }

  /**
   * Applies selection for the optimized case (Owning Side, ID_ONLY).
   * Selects the local Foreign Key column instead of joining.
   */
  private applyOptimizedSelection(
    parameters: SimpleJoin<CriteriaSchema, CriteriaSchema>,
  ): void {
    this._queryState.addFieldToSelection(
      `${parameters.parent_alias}.${parameters.local_field}`,
    );
  }
}
