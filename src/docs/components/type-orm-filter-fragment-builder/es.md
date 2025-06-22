# TypeOrmFilterFragmentBuilder

## 1. Propósito Principal

El `TypeOrmFilterFragmentBuilder` es responsable de traducir un objeto `Filter` individual (que contiene un campo, un operador y un valor) en su correspondiente fragmento de condición SQL para MySQL y los parámetros asociados. Se encarga de la lógica específica para cada `FilterOperator` soportado, asegurando que la sintaxis SQL generada sea correcta y segura frente a inyecciones SQL mediante el uso de parámetros.

## 2. Decisiones de Diseño Clave

### 2.1. Centralización de la Lógica de Traducción de Operadores

- **Descripción:** Toda la lógica para convertir un `FilterOperator` específico (ej. `EQUALS`, `LIKE`, `SET_CONTAINS`, `JSON_CONTAINS`) en SQL reside dentro de esta clase, típicamente en métodos privados dedicados (`handleBasicComparison`, `handleSetContains`, `handleJsonContains`, etc.). El método público `build` actúa como un despachador (dispatcher) que, basándose en el operador del filtro, invoca al manejador (handler) interno apropiado.
- **Justificación (El "Porqué"):**
  - **Cohesión y Principio de Responsabilidad Única (SRP):** Mantiene la lógica de traducción de operadores concentrada en un solo lugar. Esto hace que la clase `TypeOrmMysqlTranslator` (el consumidor principal) sea más simple, ya que solo necesita delegar la construcción del fragmento de filtro sin conocer los detalles de cada operador.
  - **Mantenibilidad:** Si la sintaxis de MySQL para un operador cambia, se descubre una forma más eficiente de traducirlo, o se necesita corregir un bug en la traducción de un operador, el cambio se realiza en un único lugar bien definido dentro de esta clase.
  - **Extensibilidad:** Añadir soporte para un nuevo `FilterOperator` implica principalmente:
    1.  Añadir un nuevo caso en el `switch` del método `build`.
    2.  Implementar un nuevo método privado `handle<NewOperator>` que contenga la lógica de traducción específica.
        Esto minimiza el impacto en otras partes del sistema.
  - **Claridad y Legibilidad:** Facilita la comprensión de cómo se traduce cada operador específico, ya que la lógica está encapsulada y no dispersa.

### 2.2. Interacción con `TypeOrmParameterManager`

- **Descripción:** El constructor de `TypeOrmFilterFragmentBuilder` recibe una instancia de `TypeOrmParameterManager`. Cada vez que se necesita un parámetro en un fragmento SQL, se utiliza `parameterManager.generateParamName()` para obtener un nombre de parámetro único (ej. `:param_0`, `:param_1`).
- **Justificación (El "Porqué"):**
  - **Prevención de Colisiones SQL y Seguridad:** Asegura que todos los nombres de parámetros en la consulta SQL final sean únicos. Esto es crucial para evitar errores de SQL y, fundamentalmente, para prevenir vulnerabilidades de inyección SQL, ya que los valores de los filtros se pasan como parámetros en lugar de interpolarse directamente en la cadena SQL.
  - **Abstracción de la Generación de Nombres:** `TypeOrmFilterFragmentBuilder` no necesita preocuparse por la estrategia de generación o el estado del contador de parámetros; simplemente solicita un nombre único cuando lo necesita.

### 2.3. Manejo Específico de Operadores (Ejemplos Detallados del "Porqué")

Esta sección detalla la lógica y las razones detrás de la traducción de operadores más complejos.

#### 2.3.1. Operadores `SET_CONTAINS` y `SET_NOT_CONTAINS` (para campos `simple-array` de TypeORM, que se mapean a `SET` o `VARCHAR` en MySQL)

- **Comportamiento de MySQL para `SET` y `FIND_IN_SET`:**
  - El tipo `SET` en MySQL almacena una cadena donde los valores permitidos están definidos y los valores seleccionados se guardan separados por comas.
  - La función `FIND_IN_SET(aguja, pajar)` devuelve la posición (basada en 1) de la cadena `aguja` dentro de la cadena `pajar` (que es una lista de cadenas separadas por comas). Devuelve `0` si `aguja` no está en `pajar` o si `pajar` es la cadena vacía. Devuelve `NULL` si `aguja` o `pajar` son `NULL`.
  - **Traducción de `SET_CONTAINS`:**
    - **Fragmento SQL Generado:** `(${fieldName} IS NOT NULL AND FIND_IN_SET(:${paramName}, ${fieldName}) > 0)`
    - **Justificación (El "Porqué"):**
      - `FIND_IN_SET(:${paramName}, ${fieldName}) > 0`: Esta es la forma canónica y recomendada por MySQL para verificar si un elemento está presente en un campo de tipo `SET` (o en una cadena separada por comas).
      - `${fieldName} IS NOT NULL`: Esta condición es **crucial** y se añade explícitamente. Si el campo `SET` (o la columna `simple-array` que lo representa) es `NULL` en la base de datos, `FIND_IN_SET` devolvería `NULL`. Sin esta guarda, un `NULL > 0` evaluaría a `NULL` (o falso, dependiendo del contexto de la base de datos), lo cual no es el comportamiento intuitivo de "contiene". Un campo `NULL` no "contiene" ningún valor. Por lo tanto, para que `SET_CONTAINS` sea verdadero, el campo no debe ser `NULL` y el elemento debe encontrarse.
  - **Traducción de `SET_NOT_CONTAINS`:**
    - **Fragmento SQL Generado:** `(${fieldName} IS NULL OR FIND_IN_SET(:${paramName}, ${fieldName}) = 0)`
    - **Justificación (El "Porqué"):**
      - Un campo "no contiene" un valor específico si se cumple alguna de estas dos condiciones:
        1.  `${fieldName} IS NULL`: Si el campo es `NULL`, por definición no contiene el valor buscado (ni ningún otro).
        2.  `FIND_IN_SET(:${paramName}, ${fieldName}) = 0`: Si el campo no es `NULL`, pero `FIND_IN_SET` devuelve `0`, significa que el valor no está en la lista de elementos del campo.
      - Esta lógica combinada con `OR` cubre correctamente todos los escenarios para determinar que un valor no está contenido.

#### 2.3.2. Operadores `JSON_CONTAINS` y `JSON_NOT_CONTAINS` (para objetos y rutas anidadas)

- **Comportamiento de MySQL para JSON:** MySQL ofrece un conjunto de funciones para manipular y consultar datos en columnas de tipo `JSON`. `JSON_EXTRACT(json_doc, path)` extrae un valor de un documento JSON según una ruta.
  - **Traducción de `JSON_CONTAINS` (cuando `filter.value` es un objeto):**
    - **Fragmento SQL (ejemplo para `value: { "status": "active", "details.level": 5 }`):**
      `((JSON_EXTRACT(${fieldName}, '$.status') = :param_json_0) AND (JSON_EXTRACT(${fieldName}, '$.details.level') = :param_json_1))`
    - **Justificación (El "Porqué"):**
      - **Semántica de "Contiene Todos los Pares Clave-Valor":** Cuando el valor del filtro es un objeto, la intención es verificar si el documento JSON en la base de datos contiene _todas_ las claves especificadas en el objeto del filtro, y si los valores asociados a esas claves coinciden.
      - **Uso de `JSON_EXTRACT` y Comparación Directa:** Para cada par clave-valor en el objeto del filtro:
        - Se construye la ruta JSON (ej. `$.status`, `$.details.level`).
        - Se utiliza `JSON_EXTRACT` para obtener el valor en esa ruta del campo JSON de la base de datos.
        - Este valor extraído se compara directamente (`=`) con el valor proporcionado en el filtro (que se pasa como parámetro).
      - Todas estas comparaciones individuales se unen con el operador lógico `AND`, asegurando que todas las condiciones deban cumplirse.
      - **Manejo de Tipos de Valor:** Si un valor en el objeto del filtro es a su vez un objeto o un array, se serializa a una cadena JSON (`JSON.stringify(val)`) antes de pasarlo como parámetro. Esto es porque `JSON_EXTRACT` puede devolver un escalar JSON (string, number, boolean, null) o un fragmento JSON (objeto, array). La comparación directa funciona bien para escalares. Si se comparan fragmentos JSON, MySQL a menudo requiere que el operando de la derecha también sea una representación de cadena JSON válida para una comparación semántica.
  - **Traducción de `JSON_NOT_CONTAINS` (cuando `filter.value` es un objeto):**
    - **Fragmento SQL (ejemplo para `value: { "status": "archived" }`):**
      `((JSON_EXTRACT(${fieldName}, '$.status') IS NULL OR JSON_EXTRACT(${fieldName}, '$.status') <> :param_json_0))`
      Si el objeto del filtro tuviera múltiples claves, cada condición resultante se uniría con `AND`.
    - **Justificación (El "Porqué"):**
      - **Semántica de "No Cumple Alguna de las Condiciones de Igualdad":** Para que `JSON_NOT_CONTAINS` sea verdadero con respecto a un objeto de filtro, se interpreta que para _cada_ par clave-valor del filtro, la condición de igualdad _no_ debe cumplirse. Es decir, para una clave dada:
        1.  La clave podría no existir en el documento JSON de la base de datos (en cuyo caso `JSON_EXTRACT` devuelve el `NULL` de SQL).
        2.  O la clave existe, pero su valor es diferente al especificado en el filtro.
      - La expresión `(${extractedPath} IS NULL OR ${extractedPath} <> :${paramName})` cubre ambos escenarios para una sola clave. Si hay múltiples claves en el objeto del filtro, se asume que _todas_ estas condiciones de "no igualdad" deben ser verdaderas, por lo que se unen con `AND`. (Nota: Esta semántica podría ser debatible; una alternativa sería "al menos una de las claves no coincide o no existe", lo que implicaría un `OR` entre las condiciones de no-igualdad de cada clave. La implementación actual es más estricta).

#### 2.3.3. Operadores de Array JSON (`ARRAY_CONTAINS_ELEMENT`, `ARRAY_CONTAINS_ALL_ELEMENTS`, `ARRAY_CONTAINS_ANY_ELEMENT`, `ARRAY_EQUALS`)

- **Comportamiento de MySQL para Arrays JSON:** La función `JSON_CONTAINS(json_doc, candidate_value, [path_to_array])` es fundamental. Verifica si `candidate_value` (que debe ser un escalar JSON o un array/objeto JSON serializado) está presente como un elemento dentro del array JSON ubicado en `json_doc` (o en `path_to_array` dentro de `json_doc`). `JSON_LENGTH(json_doc, [path_to_array])` devuelve el número de elementos en un array JSON.
  - **Traducción de `ARRAY_CONTAINS_ELEMENT`:**
    - **Fragmento SQL (ejemplo para `value: 'tag1'` en un campo `tags` que es un array JSON):**
      `JSON_CONTAINS(${fieldName}, :${paramName})` (si `fieldName` es directamente el array)
      o `JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.pathToTagsArray'), :${paramName}, '$')` (si el array está en una ruta anidada).
      El valor del parámetro `:paramName` será `JSON.stringify('tag1')`.
    - **Justificación (El "Porqué"):**
      - Uso directo de la función `JSON_CONTAINS` de MySQL, que está diseñada para esta operación. El valor a buscar se serializa a JSON para asegurar una comparación correcta de tipos dentro de la función de MySQL.
      - Si el filtro especifica una ruta (`filter.value` es un objeto como `{ "tags": "tag1" }`), se usa `JSON_EXTRACT` para aislar el array anidado antes de aplicar `JSON_CONTAINS` sobre él. El tercer argumento `'$'` en `JSON_CONTAINS` indica que se busque el elemento en cualquier nivel del array candidato (lo cual es apropiado si el candidato es el array mismo).
  - **Traducción de `ARRAY_CONTAINS_ALL_ELEMENTS`:**
    - **Fragmento SQL (ejemplo para `value: ['tag1', 'tag2']` en `$.tags`):**
      `((JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_all_0, '$')) AND (JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_all_1, '$')))`
    - **Justificación (El "Porqué"):**
      - Para que un array JSON contenga _todos_ los elementos especificados, se debe verificar la presencia de cada elemento individualmente.
      - Se genera una condición `JSON_CONTAINS` para cada elemento en el array del filtro.
      - Estas condiciones individuales se unen con el operador lógico `AND`.
  - **Traducción de `ARRAY_CONTAINS_ANY_ELEMENT`:**
    - **Fragmento SQL (ejemplo para `value: ['tag1', 'tag2']` en `$.tags`):**
      `((JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_any_0, '$')) OR (JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_any_1, '$')))`
    - **Justificación (El "Porqué"):**
      - Para que un array JSON contenga _alguno_ de los elementos especificados, basta con que al menos uno de ellos esté presente.
      - Se genera una condición `JSON_CONTAINS` para cada elemento en el array del filtro.
      - Estas condiciones individuales se unen con el operador lógico `OR`.
  - **Traducción de `ARRAY_EQUALS`:**
    - **Fragmento SQL (ejemplo para `value: ['tag1', 'tag2']` en `$.tags`):**
      `((JSON_LENGTH(JSON_EXTRACT(${fieldName}, '$.tags')) = :param_len) AND (JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_eq_el_0, '$')) AND (JSON_CONTAINS(JSON_EXTRACT(${fieldName}, '$.tags'), :param_eq_el_1, '$')))`
    - **Justificación (El "Porqué"):**
      - **Simulación de Igualdad de Conjuntos (no necesariamente de orden):** Para que dos arrays JSON se consideren "iguales" en el contexto de este operador, se implementa una lógica que verifica dos condiciones:
        1.  **Misma Longitud:** El array JSON en la base de datos debe tener la misma cantidad de elementos que el array proporcionado en el filtro. Esto se verifica con `JSON_LENGTH(...) = :param_len`.
        2.  **Mismos Elementos (Contención Mutua Implícita):** Cada elemento del array del filtro debe estar presente en el array JSON de la base de datos. Esto se verifica generando una condición `JSON_CONTAINS` para cada elemento del filtro y uniéndolas con `AND`.
      - **Comportamiento y Limitaciones:**
        - Esta implementación asegura que ambos arrays tengan los mismos elementos y la misma cantidad de ellos. **No garantiza el mismo orden de los elementos**. Si el orden es crítico, esta traducción no es suficiente y se requeriría una lógica de comparación mucho más compleja (posiblemente a nivel de aplicación o con funciones almacenadas en MySQL si el rendimiento es crucial).
        - Para la mayoría de los casos de uso donde se busca "los arrays tienen los mismos ítems, sin importar el orden", esta aproximación es práctica y eficiente.
      - **Manejo de Array Vacío:** Si el array del filtro está vacío (`[]`), la condición se simplifica a `JSON_LENGTH(...) = 0`, lo cual es correcto.

#### 2.3.4. Operadores `SET_CONTAINS_ANY` y `SET_CONTAINS_ALL` (para campos de cadena separados por comas)

- **Propósito:**
  - `SET_CONTAINS_ANY`: Verifica si un campo (que típicamente almacena múltiples valores como una cadena separada por comas, como el `simple-array` de TypeORM) contiene al menos uno de los valores especificados.
  - `SET_CONTAINS_ALL`: Verifica si un campo contiene todos los valores especificados.
  - **Traducción a MySQL:** Utiliza la función `FIND_IN_SET()` de MySQL para cada valor proporcionado, combinada con `OR` (para `ANY`) o `AND` (para `ALL`).
  - **Ejemplo de Criteria (`SET_CONTAINS_ANY`):**

```typescript
{ field: 'categorias', operator: FilterOperator.SET_CONTAINS_ANY, value: ['tecnologia', 'noticias'] }
```

- **Fragmento SQL Generado (`SET_CONTAINS_ANY`):**
  `(${fieldName} IS NOT NULL AND (FIND_IN_SET(:param_0, ${fieldName}) > 0 OR FIND_IN_SET(:param_1, ${fieldName}) > 0))`
  - Parámetros: `{ param_0: 'tecnologia', param_1: 'noticias' }`
- **Ejemplo de Criteria (`SET_CONTAINS_ALL`):**

```typescript
{ field: 'categorias', operator: FilterOperator.SET_CONTAINS_ALL, value: ['tecnologia', 'opinion'] }
```

- **Fragmento SQL Generado (`SET_CONTAINS_ALL`):**
  `(${fieldName} IS NOT NULL AND (FIND_IN_SET(:param_0, ${fieldName}) > 0 AND FIND_IN_SET(:param_1, ${fieldName}) > 0))`
  - Parámetros: `{ param_0: 'tecnologia', param_1: 'opinion' }`
- **Consideraciones:**
  - **Verificación `IS NOT NULL`:** Se incluye la condición `${fieldName} IS NOT NULL` porque un campo `NULL` no puede contener ningún valor.
  - **Rendimiento:** `FIND_IN_SET` en campos de cadena no indexados puede ser lento en grandes conjuntos de datos. Para escenarios críticos de rendimiento con datos tipo conjunto, considera diseños de esquema alternativos (ej. una tabla relacionada separada) o asegúrate de que la columna sea del tipo `SET` nativo de MySQL si es apropiado y el número de valores distintos es limitado.
  - **Array de Valor Vacío:** Si el array `value` en el criteria está vacío:
    - `SET_CONTAINS_ANY` se traduce a `1=0` (falso).
    - `SET_CONTAINS_ALL` se traduce a `1=1` (verdadero por vacuidad).

---

#### 2.3.5. Operadores `BETWEEN` y `NOT_BETWEEN`

- **Propósito:**
  - `BETWEEN`: Verifica si el valor de un campo se encuentra dentro de un rango inclusivo especificado (valor >= min Y valor <= max).
  - `NOT_BETWEEN`: Verifica si el valor de un campo se encuentra fuera de un rango inclusivo especificado.
  - **Traducción a MySQL:** Utiliza los operadores SQL estándar `BETWEEN` y `NOT BETWEEN`.
  - **Ejemplo de Criteria (`BETWEEN`):**

```typescript
{ field: 'precio', operator: FilterOperator.BETWEEN, value: [10, 20] }
```

- **Fragmento SQL Generado (`BETWEEN`):**
  `${fieldName} BETWEEN :param_min AND :param_max`
  - Parámetros: `{ param_min: 10, param_max: 20 }`
- **Ejemplo de Criteria (`NOT_BETWEEN`):**

```typescript
{ field: 'fechaCreacion', operator: FilterOperator.NOT_BETWEEN, value: ['2023-01-01', '2023-12-31'] }
```

- **Fragmento SQL Generado (`NOT_BETWEEN`):**
  `${fieldName} NOT BETWEEN :param_min AND :param_max`
  - Parámetros: `{ param_min: '2023-01-01', param_max: '2023-12-31' }`
- **Consideraciones:**
  - **Formato del Valor:** El `value` en el criteria debe ser un array que contenga exactamente dos elementos no nulos: `[valorMinimo, valorMaximo]`. Si no es así, la condición por defecto es `1=0` (falso).
  - **Inclusividad:** El `BETWEEN` de SQL es inclusivo con los valores límite.

---

#### 2.3.6. Operador `MATCHES_REGEX`

- **Propósito:** Verifica si un campo de tipo cadena coincide con una expresión regular dada.
  - **Traducción a MySQL:** Utiliza el operador `REGEXP` (o `RLIKE`) de MySQL.
  - **Ejemplo de Criteria:**

```typescript
{ field: 'codigoProducto', operator: FilterOperator.MATCHES_REGEX, value: '^PROD[0-9]{4}$' }
```

- **Fragmento SQL Generado:**
  `${fieldName} REGEXP :param_regex`
  - Parámetros: `{ param_regex: '^PROD[0-9]{4}$' }`
- **Consideraciones:**
  - **Rendimiento:** La coincidencia de expresiones regulares puede ser computacionalmente intensiva, especialmente con patrones complejos o en campos no indexados. Usar con precaución en grandes conjuntos de datos.
  - **Sintaxis:** La expresión regular proporcionada debe cumplir con la sintaxis regex soportada por MySQL.

---

#### 2.3.7. Operadores `ILIKE` y `NOT_ILIKE`

- **Propósito:**
  - `ILIKE`: Realiza una operación `LIKE` insensible a mayúsculas/minúsculas.
  - `NOT_ILIKE`: Realiza una operación `NOT LIKE` insensible a mayúsculas/minúsculas.
  - **Traducción a MySQL:**
    - Estos operadores se traducen a los operadores estándar `LIKE` y `NOT LIKE` de MySQL, respectivamente.
    - **Fragmento SQL Generado (`ILIKE`):** `${fieldName} LIKE :param_value`
    - **Fragmento SQL Generado (`NOT_ILIKE`):** `${fieldName} NOT LIKE :param_value`
  - **Ejemplo de Criteria (`ILIKE`):**

```typescript
{ field: 'nombreUsuario', operator: FilterOperator.ILIKE, value: 'juan%' }
```

- **Parámetros:** `{ param_value: 'juan%' }`
- **Consideraciones:**
  - **Insensibilidad a Mayúsculas/Minúsculas en MySQL:** El `LIKE` estándar en MySQL es a menudo insensible a mayúsculas/minúsculas por defecto, dependiendo de la colación (collation) de la columna (ej. colaciones que terminan en `_ci` como `utf8mb4_general_ci`). Si la colación de la columna es sensible a mayúsculas/minúsculas (ej. `_bin`), entonces `LIKE` será sensible.
  - **Verdadera Insensibilidad (si es necesaria):** Si se requiere una comparación verdaderamente insensible a mayúsculas/minúsculas independientemente de la colación, típicamente se podría usar `LOWER(${fieldName}) LIKE LOWER(:param_value)`. Sin embargo, esto puede impedir el uso de índices en `${fieldName}`. El traductor actual utiliza la forma más simple `LIKE`, confiando en la configuración de colación de la base de datos para la sensibilidad.
  - **Comodines:** El `value` del filtro debe incluir los comodines SQL de `LIKE` (`%`, `_`) según sea necesario, al igual que con el operador `LIKE` estándar.

### 2.4. Retorno de `TypeOrmConditionFragment`

- **Descripción:** El método público `build` devuelve un objeto de tipo `TypeOrmConditionFragment`, que tiene la forma `{ queryFragment: string, parameters: ObjectLiteral }`.
- **Justificación (El "Porqué"):**
  - **Separación Clara de Consulta y Parámetros:** Permite que el consumidor (principalmente `TypeOrmQueryStructureHelper` dentro de `TypeOrmMysqlTranslator`) reciba tanto el fragmento de SQL como el objeto de parámetros de forma desacoplada.
  - **Integración con TypeORM:** TypeORM espera que las condiciones y sus parámetros se proporcionen de esta manera (`queryBuilder.where("campo = :nombre", { nombre: "valor" })`) para manejar correctamente la parametrización de consultas, lo que es esencial para la seguridad (prevención de inyección SQL) y la eficiencia (reutilización de planes de consulta por la BD).

## 3. Flujo General de Operación del Método `build`

1.  Se obtiene el nombre completo del campo, cualificado con el alias actual (ej. `users.email`).
2.  Un bloque `switch` basado en `filter.operator` dirige la ejecución al método privado `handle<OperatorType>` apropiado.
3.  Cada método `handle<OperatorType>`:
    - Construye la cadena `queryFragment` específica para ese operador y la sintaxis de MySQL.
    - Si el operador requiere valores (la mayoría lo hacen, excepto `IS_NULL` / `IS_NOT_NULL`), solicita uno o más nombres de parámetros únicos al `parameterManager`.
    - Prepara los valores de los parámetros según sea necesario (ej. añadiendo comodines `%` para operadores `LIKE`, `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`; serializando a JSON para operadores `JSON_` y `ARRAY_`).
    - Puebla el objeto `parameters` con los nombres de parámetros generados y sus valores preparados.
4.  Se devuelve el objeto `TypeOrmConditionFragment` resultante.

## 4. Consideraciones de Implementación y Limitaciones

- **Versión de MySQL:** La disponibilidad y el comportamiento exacto de algunas funciones (especialmente las funciones JSON) pueden variar entre versiones de MySQL. La implementación actual está orientada a funcionalidades comunes disponibles en versiones relativamente modernas (MySQL 5.7+ para la mayoría de las funciones JSON, con mejoras y más funciones en MySQL 8.0+). Es importante probar contra la versión de MySQL objetivo.
- **Rendimiento de Consultas JSON y SET/simple-array:** Las consultas que filtran por campos de tipo `JSON` o `SET` (o `simple-array` que se mapea a tipos de cadena) pueden tener implicaciones de rendimiento si las columnas no están adecuadamente indexadas. MySQL 8.0+ ofrece mejores capacidades de indexación para datos JSON (ej. índices en arrays JSON o en campos virtuales generados a partir de rutas JSON). El traductor se enfoca en la correctitud funcional de la traducción; la optimización del rendimiento a nivel de esquema de base de datos (definición de índices apropiados) es responsabilidad del desarrollador que utiliza la biblioteca.
- **Complejidad de `ARRAY_EQUALS`:** Como se detalló anteriormente, la implementación de `ARRAY_EQUALS` verifica la igualdad de longitud y la presencia de todos los elementos, pero no garantiza el orden. Si se requiere una igualdad estricta de arrays ordenados, se necesitaría una solución diferente.
- **Manejo de `NULL` en Comparaciones:** La mayoría de los operadores de comparación (`=`, `<>`, `>`, etc.) cuando se comparan con `NULL` en SQL producen un resultado `NULL` (que en un contexto booleano se trata como falso). Los operadores `IS_NULL` e `IS_NOT_NULL` están diseñados específicamente para verificar la nulidad. La lógica para `SET_CONTAINS` y `SET_NOT_CONTAINS` incluye explícitamente verificaciones de `IS NULL` / `IS NOT NULL` para un comportamiento intuitivo. Para otros operadores, el comportamiento estándar de SQL con `NULL`s se aplica.
