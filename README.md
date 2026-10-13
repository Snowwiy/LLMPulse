# LLMPulse

LLMPulse es un widget de escritorio ligero para Windows diseñado para monitorizar modelos de IA locales ejecutados mediante llama.cpp.

Está desarrollado con:

- **Tauri 2** (Rust + WebView2)
- **Rust** (backend y recolección de métricas)
- **React / TypeScript** (interfaz)
- **Vite** (compilación del frontend)

Está pensado especialmente para monitorizar inferencia local sin necesidad de mantener abierta una consola ni un dashboard grande.

---

## Vista general

> **Nota sobre la captura:** esta sección está preparada para incluir una captura de pantalla del widget.
> Coloca la imagen en `docs/llmpulse-preview.png` y añade aquí el bloque de imagen, por ejemplo:
>
> ```markdown
> ![LLMPulse](docs/llmpulse-preview.png)
> ```
>
> No se ha creado ninguna captura falsa ni imagen de relleno.

---

## Métricas

Las métricas se muestran en una fila compacta con icono, etiqueta y valor. Cuando llama.cpp o el sistema no proporcionan un dato válido, la fila muestra **N/D** (no disponible) en lugar de un valor estimado.

### Modelo

Muestra el nombre del modelo actualmente cargado en llama.cpp.

```
qwen36-fast-80k [80K]
```

- El texto corresponde al identificador del modelo cargado (`/models` de llama.cpp).
- La insignia `[80K]` indica aproximadamente 80 000 tokens de contexto configurados para ese modelo.
- El contexto **no** representa tokens por segundo: es el tamaño de ventana de contexto, no una medida de velocidad.

### Tk/s In

Velocidad real de procesamiento del prompt (tokens de entrada) medida directamente desde llama.cpp.

```
70.1 Tk/s
```

Significa aproximadamente 70,1 tokens procesados por segundo. Este valor se extrae del campo `timings.prompt_per_second` que llama.cpp devuelve en la respuesta de cada inferencia (`/v1/chat/completions`).

**Importante:** Tk/s In mide el throughput real del prompt/input para la **misma inferencia** que acaba de ejecutarse. No es una estimación ni un valor hardcodeado. Si llama.cpp no devuelve esta métrica, la fila muestra **N/D**.

### Tk/s Out

Velocidad real de generación de tokens de salida medida directamente desde llama.cpp.

```
40.0 Tk/s
```

Significa aproximadamente 40,0 tokens generados por segundo. Este valor se extrae del campo `timings.predicted_per_second` que llama.cpp devuelve en la respuesta de cada inferencia (`/v1/chat/completions`).

**Importante:** Tk/s Out mide el throughput real de generación/output para la **misma inferencia** que acaba de ejecutarse. No es una estimación ni un valor hardcodeado. Si llama.cpp no devuelve esta métrica, la fila muestra **N/D**.

#### Diferencia entre Tk/s In y Tk/s Out

- **Tk/s In** = procesamiento real del prompt/input (cuántos tokens llama.cpp procesa por segundo al leer el input)
- **Tk/s Out** = generación real de tokens/output (cuántos tokens llama.cpp genera por segundo al producir la respuesta)

No confundir prompt throughput con generation throughput: son dos mediciones distintas de la misma inferencia.

### VRAM GPU

Memoria dedicada de la GPU utilizada frente al total disponible.

```
11.1 / 12.0 GB
```

- `11.1 GB`: memoria de video usada por el modelo.
- `12.0 GB`: memoria total reportada por la GPU.

Se obtiene mediante `nvidia-smi`, por lo que requiere un driver NVIDIA instalado. En equipos sin soporte NVIDIA, esta fila puede aparecer como **N/D**.

### GPU Usage

Utilización de la GPU y su temperatura.

```
79% 42°C
```

- `79%`: porcentaje de utilización de la GPU.
- `42°C`: temperatura real de la GPU cuando el driver la expone.

La temperatura solo se muestra si el valor leído es razonable (entre 0 y 150 °C); si no está disponible, la fila indica **N/D**.

### RAM Usage

Memoria del sistema utilizada frente a la memoria física total.

```
17.2 / 31.9 GB
```

Es la **RAM global del sistema** (Windows), y no la memoria exclusiva del modelo. Se obtiene mediante la librería `sysinfo` de Rust.

### CPU Usage

Utilización actual del procesador.

```
43%
```

Es el uso global del CPU del sistema, no el consumo de un único proceso. La temperatura del CPU **no** está disponible de forma fiable en Windows con las herramientas actuales, por lo que no se muestra como dato.

### Estado

Indica si llama.cpp responde y si hay inferencia activa. Los estados implementados son:

| Estado | Significado |
| --- | --- |
| `CONNECTED` | llama.cpp responde correctamente. |
| `DISCONNECTED` | No se ha podido conectar con el servidor configurado. |
| `CONNECTING` | El servidor responde, pero no hay un modelo cargado (`NO MODEL`). |

---

## Cómo funciona

La arquitectura es la siguiente:

```
llama.cpp (servidor local)
        │
LLMPulse backend (Rust / Tauri)
        │
Tauri (WebView2)
        │
Interfaz React/TypeScript
```

LLMPulse **no ejecuta un segundo modelo ni realiza inferencia por sí mismo**. Su función es consultar el servidor llama.cpp configurado y mostrar las métricas que ese servidor y el sistema proporcionan.

Concretamente:

- Consulta el servidor llama.cpp configurado en la sección de Configuración.
- Obtiene el modelo cargado, el estado de generación y los datos de tokens por segundo.
- Obtiene métricas del sistema (CPU y RAM) mediante `sysinfo`.
- Obtiene VRAM, utilización y temperatura de GPU mediante `nvidia-smi`.
- Actualiza el widget periódicamente (intervalo de 1000 ms).

---

## Conexión con llama.cpp

### Configuración actual por defecto

| Parámetro | Valor |
| --- | --- |
| Host | `127.0.0.1` |
| Puerto | `18081` |
| URL de ejemplo | `http://127.0.0.1:18081` |

El puerto **puede modificarse desde Configuración**. No se asume que todos los usuarios utilicen el puerto 18081; si llama.cpp escucha en otro puerto, indícalo allí antes de abrir el widget.

### Endpoints utilizados por LLMPulse

El backend consulta los siguientes endpoints del servidor configurado:

| Endpoint | Uso |
| --- | --- |
| `GET /health` | Comprobar que llama.cpp responde. |
| `GET /models` | Obtener la lista de modelos y detectar el cargado (`status: loaded`). Detección universal: cualquier modelo con status "loaded" se detecta sin nombres hardcodeados. |
| `GET /props?model=<id>` | Obtener el alias del modelo mostrado en la interfaz. |
| `GET /slots?model=<id>` | Detectar si hay inferencia activa (`is_processing`). |
| `GET /metrics?model=<id>` | Obtener métricas de tokens por segundo cuando llama.cpp las expone (requiere `--metrics`). |
| `POST /v1/chat/completions` | Medición alternativa de Tk/s In/Out cuando `/metrics` no está disponible. Extrae `timings.predicted_per_second` (Tk/s Out) y `timings.prompt_per_second` (Tk/s In) de la respuesta JSON. |

#### Flujo de extracción de Tk/s

1. El backend intenta primero `/metrics?model=<id>` (si el servidor tiene `--metrics` habilitado).
2. Si `/metrics` no está disponible (error 501), el backend envía una petición `POST /v1/chat/completions` con `max_tokens: 20` para obtener los timings reales de la inferencia. Con 20 tokens el timing es representativo de la generación sostenida (~40 tok/s real esperado), evitando el sesgo del warmup que inflaba los valores con 5 tokens.
3. Los valores `timings.predicted_per_second` (Tk/s Out) y `timings.prompt_per_second` (Tk/s In) se extraen directamente del JSON de respuesta de la **misma inferencia**.
4. Si ninguna fuente es disponible, las filas muestran **N/D**.

---

## Configuración

La ventana de Configuración se abre desde el icono de engranaje del header o desde el menú contextual. Contiene las siguientes opciones:

### Servidor

- **Host**: campo deshabilitado con `127.0.0.1`. El host no es editable en la interfaz; se fija en el código del backend.
- **Puerto**: campo numérico editable (rango 1–65535).
- **Probar**: envía una petición a `/health` para validar que el servidor responde en el puerto indicado.
- **Guardar**: guarda el puerto configurado y lo aplica al backend.

### Apariencia

- **Transparencia**: slider con rango del **70 % al 100 %**. La preferencia se guarda en `localStorage` (`backgroundOpacity`) y se aplica en tiempo real.
- **Tema**: cuatro opciones — Azul, Negro, Grafito y Personalizado.
- **Color personalizado**: selector de color que se usa como color base cuando el tema es Personalizado.

### Métricas

Cada fila de métrica tiene su propio selector de color (Tk/s In, Tk/s Out, VRAM, GPU, RAM, CPU), además de un botón para restaurar los colores por defecto. Los colores guardados persisten en `localStorage` (`llmpulse_colors`).

### Ventana

- **Fijar posición**: bloquea el arrastre del widget para evitar moverlo accidentalmente.
- **Siempre visible**: mantiene LLMPulse encima de las demás ventanas mediante la API de Tauri.
- **Compacto / Mediano / Grande**: presets de tamaño.
- **Restaurar posición**: devuelve el widget a la esquina superior derecha del monitor.

### Fijar posición vs. Siempre visible

Son funciones independientes:

- **Fijar posición** impide mover el widget accidentalmente arrastrándolo.
- **Siempre visible** controla el orden de las ventanas (always-on-top).

Pueden activarse o desactivarse por separado, y ambas preferencias se guardan en `localStorage`.

---

## Controles

| Control | Comportamiento |
| --- | --- |
| Arrastrar desde el header | Mueve el widget. No funciona si la posición está fijada. |
| Resize (manijas de 8 px) | Cambia el tamaño del widget dentro de los límites permitidos. |
| Click derecho | Abre el menú contextual propio. |
| Menú contextual | Fijar posición, Siempre visible, Compacto/Mediano/Grande, Configuración, Restaurar posición y Cerrar LLMPulse. |
| Configuración (icono de engranaje) | Abre la ventana de Configuración. |
| Cerrar (menú contextual) | Cierra el widget mediante la API `close_app`. |
| Presets de tamaño | Compacto, Mediano y Grande, además de ajustes personalizados por arrastre. |

---

## Versión portable

La copia portable utilizada para distribución se encuentra en:

```
dist\LLMPulse.exe
```

En el proyecto actual la ruta es:

```
G:\AI Local\Projects\LLMPulse\dist\LLMPulse.exe
```

`G:\...` corresponde al entorno de desarrollo del autor y **no** es una ruta que otros usuarios necesiten tener. Para distribución, el archivo importante es `LLMPulse.exe` dentro de `dist\`.

El usuario puede copiar el ejecutable a otra carpeta y ejecutarlo directamente, sin iniciar Vite ni ejecutar `npm run dev` ni `npm run tauri dev`.

**Dependencias del sistema:** el widget usa WebView2 de Tauri, por lo que requiere el **Microsoft Edge WebView2 Runtime** instalado. No es una aplicación "sin dependencias": si el runtime no está presente, la ventana no se podrá abrir.

---

## Uso rápido

1. Tener llama.cpp funcionando.
2. Ejecutar el servidor/router de llama.cpp.
3. Abrir `LLMPulse.exe`.
4. Abrir Configuración.
5. Indicar el host y el puerto.
6. Probar la conexión.
7. Guardar la configuración.
8. Cargar/utilizar un modelo en llama.cpp.
9. LLMPulse mostrará las métricas disponibles.

> LLMPulse **no** inicia llama.cpp automáticamente. El servidor debe estar ejecutando antes de abrir el widget.

---

## Desarrollo

### Requisitos

- Windows 11
- Rust
- Node.js y npm
- Visual Studio Build Tools / MSVC
- Microsoft Edge WebView2 Runtime

### Comandos

```bash
npm install
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npx tauri build
```

Para la compilación completa del ejecutable portable se puede usar el script `build_release.cmd`, que ejecuta `vcvars64.bat`, `npm run build` y `cargo build --release --manifest-path src-tauri/Cargo.toml`.

---

## Arquitectura

```
LLMPulse/
├── src/                    # Frontend React/TypeScript
│   ├── App.tsx             # Componente principal (widget, controles, persistencia)
│   └── hooks/useMetrics.ts # Polling de métricas cada 1000 ms
├── src-tauri/              # Backend Rust y configuración Tauri
│   ├── src/main.rs         # Entry point, comandos Tauri y estado (host/port)
│   └── src/collectors.rs   # Recolecta métricas de llama.cpp, GPU y sistema
├── dist/                   # Frontend compilado y ejecutable portable
├── build_release.cmd       # Compilación portable completa
└── target/                 # Artifacts de compilación (no se distribuye)
```

---

## Privacidad

LLMPulse trabaja localmente: todas las consultas van al servidor llama.cpp configurado por el usuario y a servicios locales del sistema (`sysinfo`, `nvidia-smi`). La telemetría de llama.cpp se obtiene únicamente del servidor configurado en la sección de Configuración.

No se afirma que nunca exista tráfico de Internet: si el host configurado no fuera local, las consultas irían hacia ese host. En la configuración actual el host por defecto es `127.0.0.1`.

---

## Limitaciones actuales

- **Tk/s** depende de los datos disponibles desde llama.cpp; puede aparecer como **N/D**.
- **VRAM, GPU Usage y GPU Temperature** requieren un driver NVIDIA y `nvidia-smi`; sin él, las filas pueden mostrar **N/D**.
- **CPU Temperature** no está disponible de forma fiable en Windows con las herramientas actuales.
- **RAM Usage** es la RAM global del sistema, no la memoria exclusiva del modelo.
- La prueba de conexión valida el puerto mediante `/health`; el host se comprueba al cargar las métricas.
- La medición alternativa de tokens por segundo usa el identificador real del modelo cargado (`loaded_id` detectado dinámicamente) con `max_tokens: 20` para timing preciso.
- **Restaurar posición** invoca `get_monitor_workarea` del backend Tauri para obtener el área de trabajo real del monitor y posicionar el widget en la esquina superior derecha.
- **Tk/s In/Out** requieren que llama.cpp devuelva el campo `timings` en la respuesta de `/v1/chat/completions`. Si el servidor no incluye timings, las filas muestran **N/D**.

---

## Modelos

LLMPulse es un monitor compatible con los modelos servidos por la configuración existente de llama.cpp. No está limitado a un único modelo.

El ejemplo `qwen36-fast-80k [80K]` corresponde simplemente al modelo utilizado en el entorno del autor. La insignia de contexto (`[80K]`, `[70B]`, `[32B]`, `[14B]`, `[8B]`) se deriva del identificador del modelo cargado.

---

## Licencia

Actualmente **no existe** un archivo `LICENSE` en el proyecto, por lo que no se declara ninguna licencia específica.

---

## Estado

LLMPulse está en desarrollo y se encuentra en una versión inicial estable: la arquitectura, las métricas y los controles descritos funcionan, pero el widget sigue recibiendo mejoras (interfaz, precisión de métricas y compatibilidad con distintos perfiles de llama.cpp). No se garantiza compatibilidad total ni ausencia de incidencias.
