export class TypeOrmParameterManager {
  private paramCounter = 0;

  constructor() {
    this.reset();
  }

  generateParamName(): string {
    return `param_${this.paramCounter++}`;
  }

  reset(): void {
    this.paramCounter = 0;
  }
}
