# TypeOrmMysqlTranslator

## 1. Propósito Principal

El `TypeOrmMysqlTranslator` es la clase central encargada de convertir un objeto `Criteria`, que representa una consulta abstracta, en un `SelectQueryBuilder` de TypeORM específico para MySQL. Utiliza el patrón Visitor para recorrer la estructura del `Criteria` y construir la consulta SQL de manera incremental, delegando tareas especializadas a clases auxiliares (helpers) para mantener la cohesión y la claridad.

## 2. Decisiones de Diseño Clave

### 2.1. Uso del Patrón Visitor

- **Descripción:** La clase extiende `CriteriaTranslator` e implementa el patrón Visitor para procesar los diferentes nodos de un objeto `Criteria` (`RootCriteria`, `FilterGroup`, `JoinCriteria`, etc.).
- **Justificación (El "Porqué"):**
  - **Separación de Preocupaciones:** Permite que la lógica de traducción para cada tipo de nodo del `Criteria` resida en su propio método `visit<NodeType>`. Esto mantiene la clase organizada y facilita la comprensión de cómo se traduce cada parte específica de la consulta.
  - **Extensibilidad:**
    - **Nuevos Nodos de Criteria:** Si en el futuro se añaden nuevos tipos de nodos al `Criteria` (ej. un nuevo tipo de `Join` o una cláusula `HAVING`), se pueden añadir nuevos métodos `visit<NewNodeType>` al traductor sin modificar drásticamente el código existente.
    - **Nuevas Operaciones:** Si se quisiera soportar una nueva operación sobre los `Criteria` (además de la traducción a SQL, por ejemplo, una validación compleja), se podría crear otro `CriteriaVisitor` sin afectar al traductor actual.
  - **Mantenimiento:** Los cambios en la lógica de traducción para un tipo de nodo específico están aislados en su método `visit` correspondiente, reduciendo el riesgo de introducir errores en otras partes del proceso de traducción.
  - **Alternativas Consideradas:** Se podría haber optado por una serie de `if/else` o `switch` anidados para manejar los tipos de nodos. Sin embargo, esto tiende a generar clases más grandes, menos cohesivas y más difíciles de extender y mantener, especialmente a medida que crece el número de tipos de nodos y la complejidad de la traducción. El patrón Visitor ofrece una solución más elegante y escalable.
- **Funcionamiento en este Contexto:**
  - El método `translate` (que internamente llama a `criteria.accept(this, ...)` en el `RootCriteria`) inicia el proceso.
  - Cada nodo del `Criteria` llama al método `accept` del traductor, que a su vez delega al método `visit<NodeType>` apropiado.
  - El `SelectQueryBuilder` de TypeORM (`qb`) se pasa como contexto a través de las visitas, modificándose progresivamente.
  - Otros datos de estado, como los `selects` acumulados y los `orderBy`, se gestionan como miembros de la clase `TypeOrmMysqlTranslator` y se actualizan durante las visitas.

### 2.2. Gestión de Estado Interno (Selects y OrderBy)

- **Descripción:** La clase mantiene internamente un `Set<string>` para `this.selects` y un `Array` para `this.orderBy`.
- **Justificación (El "Porqué"):**
  - **Acumulación Centralizada y Unificada:** Los campos a seleccionar (`SELECT`) y las cláusulas de ordenamiento (`ORDER BY`) pueden originarse tanto en el `RootCriteria` como en cualquiera de los `JoinCriteria` anidados. Gestionarlos de forma centralizada en el traductor principal permite:
    - **Consistencia en `SELECT`:** Asegurar que todos los campos necesarios (explícitamente seleccionados, requeridos por `ORDER BY` o por `cursor`) se incluyan en la cláusula `SELECT` final. El uso de un `Set` para `this.selects` evita la duplicación de campos.
    - **Ordenamiento Global:** Aplicar todas las cláusulas `ORDER BY` al `QueryBuilder` una sola vez al final del proceso, respetando la `sequenceId` definida en cada `Order` para garantizar el orden correcto entre diferentes directivas de ordenamiento provenientes de distintas partes del `Criteria`.
  - **Reinicio por Traducción:** Estos estados (`this.selects`, `this.orderBy`, y el `parameterManager`) se reinician al comienzo de cada llamada a `visitRoot`. Esto es crucial para asegurar que cada traducción de un objeto `Criteria` sea independiente y no se vea afectada por los estados de traducciones anteriores, permitiendo reutilizar la instancia del traductor si fuera necesario (aunque generalmente se crea una nueva por cada `Criteria` a traducir).

### 2.3. Delegación a Clases Auxiliares (Helpers)

- **Descripción:** Gran parte de la lógica específica de construcción de fragmentos SQL, gestión de parámetros, aplicación de joins y estructuración de la consulta se delega a clases especializadas:
  - `TypeOrmParameterManager`: Gestión de nombres de parámetros SQL.
  - `TypeOrmFilterFragmentBuilder`: Construcción de fragmentos SQL para cada `FilterOperator`.
  - `TypeOrmConditionBuilder`: Aplicación de condiciones, `Brackets`, resolución de `SELECT`s y lógica de paginación por cursor.
  - `TypeOrmJoinApplier`: Aplicación de `JOIN`s y sus condiciones `ON`.
- **Justificación (El "Porqué"):**
  - **Principio de Responsabilidad Única (SRP):** Cada clase auxiliar se enfoca en una tarea específica. Esto hace que el `TypeOrmMysqlTranslator` principal sea más cohesivo, centrándose en orquestar el proceso de visita y la aplicación general de las partes del `Criteria`, en lugar de albergar toda la lógica de bajo nivel.
  - **Reusabilidad de Lógica:** Ciertas lógicas son comunes a diferentes partes del proceso. Por ejemplo, la construcción de fragmentos de filtro (`TypeOrmFilterFragmentBuilder`) es necesaria tanto para la cláusula `WHERE` principal como para las condiciones `ON` de los `JOIN`. Los helpers permiten reutilizar esta lógica sin duplicación.
  - **Testeabilidad Aislada:** Cada helper puede ser probado de forma unitaria y aislada, lo que simplifica significativamente la creación y el mantenimiento de las pruebas y aumenta la confianza en la correctitud de cada componente.
  - **Legibilidad y Mantenibilidad:** Reduce la cantidad de código y la complejidad ciclomática dentro de la clase `TypeOrmMysqlTranslator`, haciéndola más fácil de entender, modificar y mantener.
  - **Encapsulación de Complejidad Específica:**
    - **Traducción de Operadores de Filtro (`TypeOrmFilterFragmentBuilder`):** La traducción de cada `FilterOperator` (ej. `EQUALS`, `LIKE`, `SET_CONTAINS`, `JSON_CONTAINS`) a su sintaxis SQL específica de MySQL, incluyendo el manejo de `NULL`s o funciones como `FIND_IN_SET`, es una tarea especializada. Delegarla permite que `TypeOrmMysqlTranslator` no necesite conocer estos detalles íntimos de MySQL. Por ejemplo, la traducción de `SET_CONTAINS` a `(campo IS NOT NULL AND FIND_IN_SET(?, campo) > 0)` y `SET_NOT_CONTAINS` a `(campo IS NULL OR FIND_IN_SET(?, campo) = 0)` encapsula la lógica para manejar correctamente los `NULL` en campos de tipo `SET` de MySQL.
    - **Lógica de Paginación por Cursor (`TypeOrmConditionBuilder`):** La paginación basada en cursor es más compleja que el simple `OFFSET/LIMIT`, ya que requiere construir una cláusula `WHERE` que compare múltiples campos (ej. `(campo1 > :valor1) OR (campo1 = :valor1 AND campo2 > :valor2)`). Esta lógica, incluyendo la correcta generación de parámetros y el manejo de la dirección del cursor (ASC/DESC), se encapsula en `TypeOrmConditionBuilder`.

## 3. Flujo General de Operación

1.  **Inicio (`visitRoot`):**
    - **Reinicio de Estado:** Se reinician `parameterManager`, `this.selects` y `this.orderBy` para asegurar una traducción limpia.
    - **Resolución de `SELECT`s Iniciales:** Se invoca `queryStructureHelper.resolveSelects(criteria, this.selects)`.
      - **Porqué:** Esta delegación asegura que si el `RootCriteria` tiene selecciones de campos específicas (`criteria.select`), también se incluyan automáticamente en `this.selects` los campos necesarios para las cláusulas `ORDER BY` y para el `cursor`, si estuvieran definidos. Esto es vital porque las bases de datos requieren que los campos usados en `ORDER BY` estén presentes en la selección (especialmente si se usara `DISTINCT` o para un comportamiento predecible).
2.  **Procesamiento del `rootFilterGroup`:**
    - Si existen filtros en el `RootCriteria`, se envuelven en un `Brackets` de TypeORM.
      - **Porqué:** Esto asegura la correcta precedencia de los operadores lógicos (`AND`/`OR`) dentro de la cláusula `WHERE` principal, evitando ambigüedades.
    - El `rootFilterGroup` llama a su método `accept(this, criteria.alias, bracketQb)`, que a su vez invoca `visitAndGroup` o `visitOrGroup` en el traductor.
3.  **Procesamiento de `visitAndGroup` / `visitOrGroup`:**
    - Delegan a `queryStructureHelper.processGroupItems` para iterar sobre los ítems del grupo (filtros individuales o grupos anidados).
    - Para cada `Filter`:
      - Se llama a `visitFilter(filter, currentAlias)`, que a su vez delega a `filterFragmentBuilder.build(filter, currentAlias)`.
        - **Porqué `filterFragmentBuilder.build`:** Esta es la pieza clave para la traducción de operadores individuales. `TypeOrmFilterFragmentBuilder` contiene la lógica específica para convertir cada `FilterOperator` (ej. `EQUALS`, `LIKE`, `SET_CONTAINS`, `JSON_CONTAINS`) en su correspondiente fragmento SQL de MySQL y los parámetros asociados. Por ejemplo, para `SET_CONTAINS`, genera `(nombre_campo IS NOT NULL AND FIND_IN_SET(:param, nombre_campo) > 0)`. Esta encapsulación es crucial para la mantenibilidad y para soportar la diversidad de operadores de MySQL.
      - El fragmento y los parámetros resultantes se aplican al `QueryBuilder` usando `queryStructureHelper.applyConditionToQueryBuilder`.
    - Para `FilterGroup` anidados, se crea un nuevo `Brackets` y se llama recursivamente al método `visit` correspondiente del grupo anidado, manteniendo la estructura lógica.
4.  **Aplicación del Cursor:**
    - Si existe un `cursor` en el `RootCriteria`:
      - Se construye la condición del cursor delegando a `queryStructureHelper.buildCursorCondition(criteria.cursor, criteria.alias)`.
        - **Porqué `queryStructureHelper.buildCursorCondition`:** La lógica para generar la condición de un cursor (ej. `(campo1 > :val1) OR (campo1 = :val1 AND campo2 > :val2)`) es compleja y depende del número de campos del cursor y de la dirección (ASC/DESC). Esta delegación encapsula dicha complejidad.
      - Esta condición se añade al `QueryBuilder` (con `AND` si ya había una cláusula `WHERE` principal, dentro de un nuevo `Brackets` para aislarla).
      - Se añaden los `ORDER BY` implícitos del cursor directamente al `QueryBuilder`.
        - **Porqué:** Los `ORDER BY` del cursor deben aplicarse inmediatamente y con la misma dirección que el cursor para que la paginación funcione correctamente. Estos tienen precedencia sobre otros `ORDER BY` definidos explícitamente si un cursor está presente.
5.  **Acumulación de `ORDER BY` del `RootCriteria`:**
    - Los `orderBy` explícitos del `RootCriteria` se añaden a la lista `this.orderBy` para su posterior procesamiento global.
6.  **Aplicación de `TAKE` y `SKIP`:**
    - Se aplican al `QueryBuilder` si están definidos. El `SKIP` solo se aplica si no hay un `cursor` definido, ya que la paginación por cursor y por `SKIP` son mutuamente excluyentes.
7.  **Procesamiento de `JOINs`:**
    - Se itera sobre los `joins` definidos en el `RootCriteria`.
    - Cada `JoinCriteria` llama a su método `accept(this, joinDetail.parameters, qb)`, que invoca el método `visit<JoinType>Join` correspondiente en el traductor (ej. `visitInnerJoin`, `visitLeftJoin`).
    - Estos métodos delegan la lógica principal de aplicación del join a `joinApplier.applyJoinLogic(...)`.
      - **Porqué `joinApplier.applyJoinLogic`:** La aplicación de `JOIN`s implica construir la relación (`parent_alias.relationProperty`), el alias del join, y la condición `ON`. La condición `ON` puede ser compleja y contener sus propios filtros y grupos lógicos, por lo que `joinApplier` reutiliza `filterFragmentBuilder` y `queryStructureHelper` para construirla.
      - `joinApplier` aplica el `JOIN` al `QueryBuilder` (usando `innerJoinAndSelect` o `leftJoinAndSelect` de TypeORM).
        - **Porqué `...AndSelect`:** Se usa `...AndSelect` para que TypeORM automáticamente seleccione todos los campos de la entidad unida y los hidrate correctamente. La gestión fina de qué campos específicos se seleccionan se maneja a través de `this.selects`.
      - `joinApplier` (a través de `queryStructureHelper.resolveSelects`) añade los campos seleccionados del `JoinCriteria` a `this.selects`.
      - `joinApplier` también se encarga de la optimización de no seleccionar la clave foránea en el lado "many" de una relación `many-to-one` si la entidad "one" ya está siendo seleccionada, para evitar redundancia.
      - Los `ORDER BY` definidos en el `JoinCriteria` se añaden a la lista global `this.orderBy`.
    - Se procesan recursivamente los joins anidados dentro de cada `JoinCriteria` (un join sobre otra entidad ya unida).
8.  **Finalización:**
    - **Ordenamiento Global de `ORDER BY`:** Se ordenan todas las cláusulas `ORDER BY` acumuladas en `this.orderBy` (provenientes del `RootCriteria` y de todos los `JoinCriteria`) según su `sequenceId`.
      - **Porqué:** Esto permite al usuario definir un orden de aplicación global para las cláusulas de ordenamiento, independientemente de dónde se definieron en la estructura del `Criteria`.
    - **Aplicación de `ORDER BY` Finales:** Se aplican las cláusulas `ORDER BY` ordenadas al `QueryBuilder`, solo si no se utilizó un cursor (ya que el cursor impone su propio ordenamiento).
    - **Aplicación de `SELECT` Final:** Se aplica la cláusula `SELECT` final al `QueryBuilder` utilizando todos los campos únicos acumulados en `this.selects`.
      - **Porqué al final:** Aplicar el `SELECT` una sola vez al final, después de procesar todos los joins y resolver todas las dependencias de campos (por `ORDER BY` o `cursor`), asegura que se seleccionen todos los campos necesarios y solo esos, de manera eficiente.
    - Se devuelve el `SelectQueryBuilder` modificado.

## 4. Puntos Clave de Implementación / Consideraciones

- **Manejo de Alias (`currentAlias`):** Es crucial pasar y utilizar el `currentAlias` correcto en cada método `visit` y al interactuar con los helpers. Esto asegura que los campos en los fragmentos SQL se refieran a la tabla/entidad correcta, especialmente en consultas con múltiples joins donde el mismo nombre de campo podría existir en diferentes entidades.
- **Reinicio de `ParameterManager`:** Se reinicia en `visitRoot` para que cada traducción completa de un `Criteria` comience con un contador de parámetros limpio (ej. `:param_0`, `:param_1`, ...). Esto evita colisiones de nombres de parámetros si se traduce más de un `Criteria` con la misma instancia del traductor (aunque la práctica común y recomendada es crear una nueva instancia del traductor por cada `Criteria` a traducir).
- **`OuterJoin` (Limitación):** La visita para `OuterJoinCriteria` lanza un error.
  - **Porqué:** `FULL OUTER JOIN` no es soportado directamente por MySQL de la misma forma que en otros SGBD (como PostgreSQL u Oracle). Implementar una emulación genérica de `FULL OUTER JOIN` en MySQL (usualmente mediante `UNION` de `LEFT JOIN` y `RIGHT JOIN` con condiciones anti-join) está fuera del alcance actual de este traductor debido a su complejidad y al impacto potencial en el rendimiento y la estructura de la consulta generada por TypeORM. Se prioriza la traducción directa y eficiente de las capacidades comunes.
- **Impacto de `...AndSelect` en Joins:** El uso de `innerJoinAndSelect` y `leftJoinAndSelect` por parte de `TypeOrmJoinApplier` simplifica la hidratación de entidades relacionadas por TypeORM. Sin embargo, implica que por defecto se seleccionan todos los campos de la entidad unida. Si se requiere una selección más granular de campos de entidades unidas, el `Criteria` debe especificarlo a través de `JoinCriteria.setSelect()`, y el traductor lo reflejará en la cláusula `SELECT` final.
