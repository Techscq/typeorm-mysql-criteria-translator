# TypeOrmParameterManager

## 1. Propósito Principal

El `TypeOrmParameterManager` es una clase sencilla pero crucial cuya única responsabilidad es generar nombres de parámetros únicos (ej. `:param_0`, `:param_1`, ...) para ser utilizados en las consultas SQL construidas por el traductor. Esto previene colisiones de nombres de parámetros y es fundamental para la correcta parametrización de las consultas, lo que a su vez es esencial para la seguridad (prevención de inyección SQL).

## 2. Decisiones de Diseño Clave

### 2.1. Clase Dedicada para la Gestión de Parámetros

- **Descripción:** En lugar de pasar un simple contador numérico a través de las diferentes clases y métodos, se optó por una clase dedicada.
- **Justificación (El "Porqué"):**
  - **Encapsulación y Claridad:** Encapsula la lógica de generación de nombres y el estado del contador en un solo lugar. Esto hace que el código que utiliza el gestor de parámetros sea más limpio, ya que simplemente solicita un nuevo nombre de parámetro sin preocuparse por los detalles de la implementación.
  - **Reseteo Controlado:** La clase proporciona un método `reset()`. Esta es una función vital que es llamada por `TypeOrmMysqlTranslator` al inicio de cada traducción completa de un objeto `Criteria` (`visitRoot`). Esto asegura que cada traducción comience con un contador de parámetros desde cero, evitando que los nombres de parámetros de una traducción anterior interfieran con una nueva, especialmente si la misma instancia del traductor se reutilizara (aunque la práctica común es una nueva instancia por `Criteria`).
  - **Mantenibilidad y Extensibilidad (Potencial):** Aunque actualmente la generación de nombres es un simple incremento, si en el futuro se necesitara una lógica más compleja para generar nombres de parámetros (ej. con prefijos específicos o estrategias diferentes), los cambios estarían aislados dentro de esta clase sin afectar a sus consumidores.

### 2.2. Simplicidad del Contador

- **Descripción:** Utiliza un contador numérico simple (`paramCounter`) que se incrementa con cada llamada a `generateParamName()`.
- **Justificación (El "Porqué"):**
  - **Suficiencia:** Para el propósito de generar nombres únicos dentro del alcance de una única consulta SQL generada, un contador incremental simple es suficiente y eficiente. TypeORM y el driver de la base de datos se encargan de mapear estos nombres a los valores reales.
  - **Rendimiento:** No introduce sobrecarga innecesaria.

## 3. Flujo General de Operación

1.  **Instanciación:** Una instancia de `TypeOrmParameterManager` es creada por `TypeOrmMysqlTranslator` en su constructor. Esta misma instancia se pasa a otros helpers que también necesitan generar parámetros (como `TypeOrmFilterFragmentBuilder` y `TypeOrmConditionBuilder`).
2.  **Reseteo (`reset()`):**
    - Al inicio de cada llamada a `TypeOrmMysqlTranslator.visitRoot()`, se invoca `this.parameterManager.reset()`.
    - Esto reinicia el `paramCounter` interno a `0`.
3.  **Generación de Nombre (`generateParamName()`):**
    - Cuando un componente (ej. `TypeOrmFilterFragmentBuilder` al construir un fragmento de filtro) necesita un nombre de parámetro, llama a `parameterManager.generateParamName()`.
    - Este método devuelve una cadena como `param_N` (donde N es el valor actual del `paramCounter`) y luego incrementa `paramCounter`.

## 4. Consideraciones de Implementación

- **Alcance de la Instancia:** Es importante que la misma instancia de `TypeOrmParameterManager` sea compartida entre todos los componentes que participan en la traducción de un único `Criteria` para asegurar la unicidad global de los parámetros dentro de esa consulta. El `TypeOrmMysqlTranslator` se encarga de esto al crear e inyectar la instancia.
- **No Persistencia entre Traducciones:** El reseteo en `visitRoot` significa que los nombres de los parámetros no son persistentes ni únicos entre diferentes llamadas a `translator.translate()`. Esto es intencional y correcto, ya que cada llamada a `translate` genera una consulta independiente.
