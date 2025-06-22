# TypeOrmConditionBuilder

## 1. Propósito Principal

El `TypeOrmConditionBuilder` es una clase auxiliar que encapsula la lógica para manipular la estructura de un `SelectQueryBuilder` de TypeORM. Sus responsabilidades principales incluyen:

- Resolver y aplicar las cláusulas `SELECT`, asegurando que se incluyan todos los campos necesarios (explícitos, por ordenamiento o por cursor).
- Construir y aplicar las condiciones para la paginación basada en cursor.
- Procesar grupos de filtros (`FilterGroup`) para la cláusula `WHERE` principal, aplicando correctamente los `Brackets` de TypeORM y los conectores lógicos (`AND`/`OR`) directamente al `QueryBuilder`.
- **Generar una cadena de condición SQL y sus parámetros a partir de un `FilterGroup`, para ser usada en contextos como las cláusulas `ON` de los `JOIN`s.**
- Aplicar condiciones de filtro individuales al `QueryBuilder`.

Actúa como un ayudante para `TypeOrmMysqlTranslator` y `TypeOrmJoinApplier`, centralizando la lógica común de modificación y construcción de partes de la consulta.

## 2. Decisiones de Diseño Clave

### 2.1. Resolución Centralizada de `SELECT`s

- **Descripción:** El método `resolveSelects` toma un `ICriteriaBase` (que puede ser un `RootCriteria` o un `JoinCriteria`) y un `Set<string>` (que representa el conjunto global de campos a seleccionar para toda la consulta).
- **Justificación (El "Porqué"):**
  - **Evitar Selecciones Redundantes y Asegurar Campos Necesarios:**
    - Si el `criteria.select` está vacío (indicando "seleccionar todo" para esa entidad/alias), no se añaden campos específicos al `Set` global en este punto. La lógica de `TypeOrmJoinApplier` (usando `innerJoinAndSelect` o `leftJoinAndSelect`) y la aplicación final de `qb.select(Array.from(this.selects.values()))` en `TypeOrmMysqlTranslator` se encargarán de seleccionar todos los campos de la entidad o los campos explícitamente añadidos al `Set` global.
    - Si `criteria.select` tiene campos específicos, este método asegura que, además de esos campos explícitos, también se incluyan en el `Set` global:
      1.  **Campos de `ORDER BY`:** Los campos utilizados en las cláusulas `orderBy` del `criteria` actual. Esto es vital porque muchas bases de datos (incluyendo MySQL bajo ciertas condiciones o para evitar ambigüedades) requieren que los campos por los que se ordena estén presentes en la lista `SELECT`.
      2.  **Campos de `cursor`:** Los campos utilizados en la definición del `cursor` del `criteria` actual. Similar al `ORDER BY`, estos campos deben estar disponibles para que la lógica de paginación por cursor funcione correctamente.
  - **Gestión Global vs. Local:** Al pasar el `Set` global (`this.selects` del traductor principal), se asegura que todas las necesidades de selección de todas las partes del `Criteria` (raíz y joins) se consoliden en un único lugar antes de aplicar el `SELECT` final a la consulta.
  - **Optimización en `many_to_one` (manejada por `TypeOrmJoinApplier`):** Aunque `resolveSelects` añade campos, `TypeOrmJoinApplier` tiene una lógica posterior para _eliminar_ la clave foránea del lado "padre" de una relación `many-to-one` del `Set` global de `selects` si la entidad "hija" (el lado "one") ya está siendo seleccionada. Esto evita redundancia (ej. no seleccionar `post.user_uuid` si ya se está seleccionando `user.uuid` a través de un join a `user`). `resolveSelects` no se encarga de esta eliminación, sino de la adición inicial.

### 2.2. Construcción de Condiciones de Paginación por Cursor (`buildCursorCondition`)

- **Descripción:** Este método toma un objeto `Cursor` y el alias de la entidad actual para generar el fragmento SQL y los parámetros necesarios para la paginación por cursor. Soporta cursores de uno o dos campos.
- **Justificación (El "Porqué"):**
  - **Encapsulación de Lógica Compleja:** La paginación basada en cursor (keyset pagination) es más compleja que el simple `OFFSET/LIMIT`. La condición `WHERE` generada depende del número de campos del cursor y de la dirección del ordenamiento.
    - **Cursor de un campo:** `(campo1 > :valor1)` o `(campo1 < :valor1)`
    - **Cursor de dos campos:** `((campo1 > :valor1) OR (campo1 = :valor1 AND campo2 > :valor2))` o su equivalente para `LESS_THAN`.
  - **Manejo de Operadores:** El método traduce el `FilterOperator.GREATER_THAN` o `FilterOperator.LESS_THAN` del cursor al operador SQL correspondiente (`>` o `<`).
  - **Generación de Parámetros:** Utiliza `TypeOrmParameterManager` para generar nombres de parámetros únicos para los valores del cursor, manteniendo la seguridad y la consistencia.
  - **Reusabilidad:** Centraliza esta lógica para que `TypeOrmMysqlTranslator` pueda simplemente solicitarla.
  - **Limitación Actual:** La implementación actual soporta explícitamente cursores de uno o dos campos. Extenderlo a más campos requeriría una generalización de la lógica de construcción de la tupla de comparación. La decisión de limitarlo a dos campos se basa en que es un caso de uso común y mantiene la implementación relativamente simple. Para más de dos campos, la complejidad de la cláusula `OR` anidada aumenta significativamente.

### 2.3. Procesamiento de Grupos de Filtros para `WHERE` (`processGroupItems` y `applyConditionToQueryBuilder`)

- **Descripción:**
  - `processGroupItems`: Itera sobre los ítems de un `FilterGroup`. Para filtros individuales, delega la construcción del fragmento a `TypeOrmFilterFragmentBuilder` y luego usa `applyConditionToQueryBuilder` para añadirlo al `QueryBuilder`. Para grupos anidados, crea un nuevo `Brackets` de TypeORM y llama recursivamente al método `visitAndGroup` o `visitOrGroup` del traductor (pasado como `visitor`).
  - `applyConditionToQueryBuilder`: Añade una condición (ya sea un fragmento de string o un `Brackets`) al `QueryBuilder` usando `qb.where()`, `qb.andWhere()`, o `qb.orWhere()` según si es la primera condición en el bracket actual y el conector lógico del grupo.
- **Justificación (El "Porqué"):**
  - **Correcta Aplicación de `Brackets` y Lógica `AND`/`OR`:**
    - El uso de `Brackets` de TypeORM (`new Brackets((subQb) => { ... })`) es esencial para agrupar condiciones y asegurar la precedencia correcta de los operadores `AND` y `OR` en la consulta SQL generada. Por ejemplo, para traducir `(A AND B) OR C`, el `(A AND B)` debe estar entre paréntesis.
    - `processGroupItems` maneja la lógica de si una condición debe unirse con `AND` o con `OR` basándose en el `logicalOperator` del `FilterGroup` que se está procesando.
    - La recursión a través del `visitor` para grupos anidados asegura que la estructura jerárquica del `Criteria` se refleje correctamente en la consulta SQL con paréntesis anidados.
  - **Desacoplamiento:** `TypeOrmMysqlTranslator` no necesita preocuparse por los detalles de cómo se añaden las condiciones (`where` vs `andWhere` vs `orWhere`) o cómo se manejan los `Brackets`; simplemente delega esta tarea.
  - **Reusabilidad:** Esta lógica de procesamiento de grupos se utiliza tanto para el `rootFilterGroup` del `RootCriteria` como para los `rootFilterGroup` de los `JoinCriteria` (que forman parte de la condición `ON` del join).

### 2.4. Construcción de Cadenas de Condición desde Grupos de Filtros (`buildConditionStringFromGroup`)

- **Descripción:** El método `buildConditionStringFromGroup` toma un `FilterGroup` y un alias, y devuelve un objeto con una `conditionString` (el fragmento SQL) y sus `parameters`. Está diseñado para generar condiciones que pueden ser usadas en contextos donde no se aplica directamente a un `QueryBuilder` principal, como las cláusulas `ON` de los `JOIN`s.
- **Justificación (El "Porqué"):**
  - **Reutilización para Condiciones `ON`:** Esta función fue introducida para centralizar la lógica de conversión de un `FilterGroup` a una cadena SQL, permitiendo que `TypeOrmJoinApplier` la utilice para construir las condiciones `ON` de los `JOIN`s.
  - **Consistencia y DRY:** Asegura que el procesamiento de la estructura de `FilterGroup` (manejo de `Filter`s individuales, grupos anidados, operadores `AND`/`OR` y paréntesis) sea consistente, ya sea para aplicar a un `QueryBuilder` (vía `processGroupItems`) o para generar una cadena (vía `buildConditionStringFromGroup`).
  - **Encapsulación:** Mantiene la lógica de construcción de cadenas de condición dentro del helper responsable de la estructura de la consulta, en lugar de tenerla duplicada o simplificada en `TypeOrmJoinApplier`.
  - **Manejo Interno de Recursión:** A diferencia de `processGroupItems` que utiliza el patrón `visitor` para la recursión en subgrupos (llamando a `visitAndGroup`/`visitOrGroup` del traductor), `buildConditionStringFromGroup` maneja la recursión para subgrupos internamente para construir la cadena de manera autónoma.

## 3. Flujo General de Operación (Métodos Clave)

### `resolveSelects`

1.  Verifica si `criteria.select` (los campos explícitamente seleccionados para el alias actual) tiene elementos.
2.  Si es así (selección explícita):
    - Añade cada campo de `criteria.orders` al `selectsSet` global (cualificado con `criteria.alias`).
    - Si `criteria.cursor` existe, añade cada campo de `criteria.cursor.filters` al `selectsSet` global.
    - Añade cada campo de `criteria.select` al `selectsSet` global.
3.  Si `criteria.select` está vacío, no se añaden campos explícitos al `selectsSet` desde este método para este alias (se asume "seleccionar todo" para este alias, lo cual se maneja globalmente o por los `...AndSelect` de los joins).

### `buildCursorCondition`

1.  Obtiene los filtros primitivos del `cursor`.
2.  Toma el primer filtro para determinar el operador (`>` o `<`) y el primer campo/valor.
3.  Genera un nombre de parámetro para el primer valor y construye el fragmento SQL inicial: `(campo1 > :param1)`.
4.  Si hay un segundo filtro en el cursor:
    - Genera un nombre de parámetro para el segundo valor.
    - Modifica el fragmento SQL para incluir la lógica de tupla: `((campo1 > :param1) OR (campo1 = :param1 AND campo2 > :param2))`.
5.  Devuelve el `queryFragment` y el objeto `parameters`.

### `processGroupItems` (para cláusulas `WHERE`)

1.  Itera sobre cada `item` en `items` (filtros o subgrupos).
2.  Determina si es el primer ítem en el bracket actual.
3.  Si `item` es un `Filter`:
    - Llama a `filterFragmentBuilder.build()` para obtener el fragmento SQL y los parámetros.
    - Llama a `applyConditionToQueryBuilder()` para añadirlo al `qb`.
4.  Si `item` es un `FilterGroup` (anidado):
    - Crea un `new Brackets((subQb) => { ... })`.
    - Dentro del callback de `Brackets`, llama al método `visitAndGroup` o `visitOrGroup` del `visitor` (que es la instancia de `TypeOrmMysqlTranslator`) pasándole el `subQb`. Esto permite la recursión.
    - Llama a `applyConditionToQueryBuilder()` para añadir el `Brackets` anidado al `qb` actual.

### `applyConditionToQueryBuilder`

1.  Si `isFirstInThisBracket` es `true`, usa `qb.where(conditionOrBracket, parameters)`.
2.  Si no, si `logicalConnector` es `AND`, usa `qb.andWhere(conditionOrBracket, parameters)`.
3.  Si no, si `logicalConnector` es `OR`, usa `qb.orWhere(conditionOrBracket, parameters)`.

### `buildConditionStringFromGroup` (para cláusulas `ON` u otros contextos de cadena)

1.  Si el grupo de filtros está vacío, devuelve `undefined`.
2.  Inicializa un array para las cadenas de condición y un objeto para todos los parámetros.
3.  Define una función recursiva interna (`processItemRecursive`):
    - Si el ítem es un `Filter`:
      - Llama a `this.filterFragmentBuilder.build()` para obtener el fragmento SQL y los parámetros.
      - Añade los parámetros al objeto `allParams`.
      - Devuelve el `queryFragment`.
    - Si el ítem es un `FilterGroup` (anidado):
      - Llama recursivamente a `processItemRecursive` para cada ítem del subgrupo.
      - Une las sub-condiciones resultantes con el operador lógico del subgrupo (`AND` o `OR`) y las envuelve en paréntesis.
      - Devuelve la cadena del subgrupo.
4.  Itera sobre los ítems del grupo principal, llamando a `processItemRecursive` para cada uno y acumulando las condiciones resultantes.
5.  Si no se generaron condiciones, devuelve `undefined`.
6.  Une las condiciones principales con el operador lógico del grupo principal.
7.  Devuelve un objeto con la `conditionString` final y el objeto `allParams` consolidado.

## 4. Consideraciones de Implementación

- **Dependencia del `visitor` en `processGroupItems`:** El método `processGroupItems` necesita una referencia a los métodos `visitAndGroup` y `visitOrGroup` del traductor principal para manejar la recursión en grupos anidados. Esto se logra pasando el propio traductor (`this` desde `TypeOrmMysqlTranslator`) como el parámetro `visitor`.
- **Manejo de `QueryBuilder` en `Brackets`:** TypeORM proporciona un nuevo `QueryBuilder` (o un proxy) dentro del callback de `Brackets`. Las condiciones añadidas a este `subQb` se encapsulan correctamente entre paréntesis en la consulta principal.
- **Seguridad de Parámetros:** La delegación a `TypeOrmFilterFragmentBuilder` y el uso consistente de `TypeOrmParameterManager` son fundamentales para asegurar que todos los valores de los filtros se traten como parámetros, previniendo inyecciones SQL.
- **Recursión en `buildConditionStringFromGroup`:** Este método maneja la recursión para grupos anidados internamente, a diferencia de `processGroupItems` que depende del patrón visitor. Esto lo hace más autónomo para la tarea específica de generar una cadena de condición.
