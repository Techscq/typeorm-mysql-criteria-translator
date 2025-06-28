import {
  type CriteriaSchema,
  type Cursor,
  FilterOperator,
  type FilterPrimitive,
  type ICriteriaBase,
  type Order,
  type FieldOfSchema,
} from '@nulledexp/translatable-criteria';

/**
 * Manages and holds the mutable state of a query being built.
 * This includes collected selects, order-by clauses, and cursor information.
 */
export class QueryState {
  private _selects: Set<string> = new Set<string>([]);
  private _orderBy: Array<[string, Order<any>]> = [];
  private _queryHasWhereClauses: boolean = false;
  private _collectedCursors: Array<
    [
      string,
      Cursor<string, FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN>,
    ]
  > = [];
  private _cursorWasApplied: boolean = false;

  /**
   * Resets all internal state properties to their initial values.
   */
  public reset(): void {
    this._selects.clear();
    this._orderBy = [];
    this._queryHasWhereClauses = false;
    this._collectedCursors = [];
    this._cursorWasApplied = false;
  }

  /**
   * Collects cursor information from a criteria.
   * @param alias The alias of the entity the cursor belongs to.
   * @param cursor The cursor object.
   */
  public collectCursor(
    alias: string,
    cursor:
      | Cursor<string, FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN>
      | undefined,
  ): void {
    if (cursor) {
      this._collectedCursors.push([alias, cursor]);
    }
  }

  /**
   * Processes and validates all collected cursors, combining their filters.
   * Throws an error if cursor parts are inconsistent or too many fields are combined.
   * @returns An array of combined filter primitives for the cursor.
   */
  public processAndValidateCursors(): FilterPrimitive<
    string,
    FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN
  >[] {
    if (
      this._collectedCursors.length === 0 ||
      this._collectedCursors[0] === undefined
    ) {
      return [];
    }

    this._collectedCursors.sort((a, b) => a[1].sequenceId - b[1].sequenceId);

    const commonDirection = this._collectedCursors[0][1].order;
    const commonOperator = this._collectedCursors[0][1].operator;

    const combinedFilters: FilterPrimitive<
      string,
      FilterOperator.GREATER_THAN | FilterOperator.LESS_THAN
    >[] = [];

    for (const [alias, cursor] of this._collectedCursors) {
      if (cursor.order !== commonDirection) {
        throw new Error(
          'All parts of a composite cursor must have the same order direction.',
        );
      }
      if (cursor.operator !== commonOperator) {
        throw new Error(
          'All parts of a composite cursor must have the same operator.',
        );
      }

      for (const filter of cursor.filters) {
        combinedFilters.push({
          operator: filter.operator,
          field: `${alias}.${filter.field}`,
          value: filter.value,
        });
      }
    }

    if (combinedFilters.length > 2) {
      throw new Error(
        'A combined cursor cannot have more than two fields in total.',
      );
    }

    return combinedFilters;
  }

  /**
   * Resolves and adds select fields from a criteria, including those from orders and cursors.
   * @param alias The alias of the entity.
   * @param criteria The criteria object.
   */
  public resolveSelects<TCriteriaSchema extends CriteriaSchema>(
    alias: string,
    criteria: ICriteriaBase<TCriteriaSchema>,
  ): void {
    criteria.orders.forEach((order) =>
      this._selects.add(`${alias}.${String(order.field)}`),
    );
    if (criteria.cursor) {
      criteria.cursor.filters.forEach((filter) => {
        this._selects.add(`${alias}.${String(filter.field)}`);
      });
    }
    criteria.select.forEach((field) =>
      this._selects.add(`${alias}.${String(field)}`),
    );
  }

  /**
   * Records order-by clauses from a criteria.
   * @param orders The order-by clauses.
   * @param alias The alias of the entity.
   */
  public recordOrderBy<TCriteriaSchema extends CriteriaSchema>(
    orders: ReadonlyArray<Order<FieldOfSchema<TCriteriaSchema>>>,
    alias: string,
  ): void {
    orders.forEach((order) => {
      this._orderBy.push([alias, order]);
    });
  }

  /**
   * Sorts the collected order-by clauses by their sequence ID.
   */
  public sortOrderByWithSequentialId(): void {
    this._orderBy.sort((a, b) => a[1].sequenceId - b[1].sequenceId);
  }

  /**
   * Adds a field to the list of selects.
   * @param select The field to add.
   */
  public addFieldToSelection(select: string): void {
    this._selects.add(select);
  }

  /**
   * Clears an ambiguous select field.
   * @param select The field to clear.
   */
  public clearAmbiguousSelect(select: string): void {
    this._selects.delete(select);
  }

  /**
   * Gets the current set of select fields.
   * @returns A Set of select fields.
   */
  public getSelects(): Set<string> {
    return this._selects;
  }

  /**
   * Gets the collected order-by clauses.
   * @returns An array of order-by clauses.
   */
  public getOrderBy(): Array<[string, Order<any>]> {
    return this._orderBy;
  }

  /**
   * Checks if the query already has WHERE clauses.
   * @returns True if the query has WHERE clauses, false otherwise.
   */
  public hasWhereClauses(): boolean {
    return this._queryHasWhereClauses;
  }

  /**
   * Sets whether the query has WHERE clauses.
   * @param hasClauses True if the query has WHERE clauses, false otherwise.
   */
  public setQueryHasWhereClauses(hasClauses: boolean): void {
    this._queryHasWhereClauses = hasClauses;
  }

  /**
   * Checks if the cursor has already been applied.
   * @returns True if the cursor has been applied, false otherwise.
   */
  public cursorWasApplied(): boolean {
    return this._cursorWasApplied;
  }

  /**
   * Sets whether the cursor has been applied.
   * @param applied True if the cursor has been applied, false otherwise.
   */
  public setCursorWasApplied(applied: boolean): void {
    this._cursorWasApplied = applied;
  }
}
