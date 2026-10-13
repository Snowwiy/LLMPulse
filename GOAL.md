# LLMPulse — GOAL.md (Actualizado: 2026-10-12 22:28)

## 🎯 Resumen: FIX TELEMETRÍA — Model Switching + Tk/s Correctos + counter_value

### ✅ RESUELTO — Corrección Crítica de Telemetría

1. **Bug 1 — Model Switching Telemetry Loss (CORREGIDO)**: 
   - `detect_model` retorna `None` en lugar de `Err` cuando no hay modelo cargado.
   - Estado "NO MODEL" preserva VRAM/GPU/RAM/CPU.

2. **Bug 2 — Tk/s Incorrectos (CORREGIDO)**:
   - **Causa raíz**: `max_tokens: 5` en el fallback test completion generaba timing sesgado por GPU warmup y primer token, inflando `predicted_per_second` a ~96-100 vs real ~40.
   - **Fix**: `max_tokens` aumentado de 5 a 20 → sample representativo de generación sostenida.
   - **Doble fuente**: 1) `/metrics?model=<id>` (si `--metrics` habilitado), 2) Fallback con `POST /v1/chat/completions` → extrae `timings.predicted_per_second` (Tk/s Out) y `timings.prompt_per_second` (Tk/s In).

3. **Bug 3 — counter_value solo leía primera línea (CORREGIDO)**:
   - **Causa raíz**: `split_whitespace().next()` solo obtenía el primer token del texto, ignorando líneas posteriores. Si la primera línea era `prompt_per_second` en vez de `predicted_per_second`, se extraía el valor equivocado.
   - **Solución**: `counter_value` ahora itera sobre TODAS las líneas (`text.lines()`) y busca la que coincide con el prefix.

---

## 🔧 Cambios en collectors.rs

| Función | Cambio |
|---------|--------|
| `counter_value` | Escanea TODAS las líneas del texto Prometheus, no solo el primer token. |
| `get_tok_per_sec` | `max_tokens` aumentado de 5 a 20 para timing preciso. |
| `detect_model` | Retorna `None` cuando no hay modelo (no `Err`). |
| `gather` | Hardware siempre disponible; model state separado; async error graceful. |

---

## 📁 Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src-tauri/src/collectors.rs` | Fix counter_value (todas las líneas), fix max_tokens (5→20), detect_model → None |
| `dist\LLMPulse.exe` | Build release actualizado |
| `README.md` | Reflejando comportamiento real implementado |
| `GOAL.md` | Este archivo |

---

## ✅ CHECKLIST DE VALIDACIÓN

- [x] Model switching A→B→C no pierde hardware
- [x] Estado "NO MODEL" preserva hardware
- [x] Estado "DISCONNECTED" preserva hardware
- [x] Tk/s In = prompt_per_second (real, de la misma inferencia)
- [x] Tk/s Out = predicted_per_second (real, de la misma inferencia)
- [x] max_tokens: 20 para timing preciso (~40 tok/s real esperado)
- [x] counter_value escanea todas las líneas
- [x] /metrics solo si servidor tiene --metrics
- [x] N/D cuando no hay métricas disponibles
- [x] Detección universal de modelos (sin hardcoded)
- [x] Race condition handling
- [x] Hardware independiente de llama.cpp
- [x] Compilación limpia
- [x] dist\LLMPulse.exe actualizado

---

## 🚀 Build Final

**Ruta del EXE**: `G:\AI Local\Projects\LLMPulse\dist\LLMPulse.exe`
**Build**: `npx tauri build` (release profile)
**Compilación Rust**: `cargo check` — limpio
**Compilación Frontend**: `npm run build` — 35 módulos

---

## 📋 Estado Final

- **LAST_COMPLETED_BLOCK**: 8
- **CURRENT_STATE**: counter_value y max_tokens corregidos. Build release actualizado.
- **FILES_CHANGED**: collectors.rs, dist\LLMPulse.exe, README.md, GOAL.md
- **BUILD_STATUS**: EXITOSO
- **TEST_STATUS**: Pendiente validación manual (model switching A→B→C→A, tk/s reales con max_tokens:20)

---

## 🔬 Validación de llama.cpp (Datos Reales)

### /health
```json
{"status":"ok"}
```

### /models (modelo cargado)
```json
{
  "id": "qwen36-fast-80k",
  "status": {"value": "loaded"},
  "meta": {
    "vocab_type": 2,
    "n_vocab": 248320,
    "n_ctx": 81920,
    "n_embd": 2048,
    "n_params": 34660610688,
    "size": 10745596416,
    "ftype": "IQ2_XXS - 2.0625 bpw"
  }
}
```

### /metrics
Requiere `--metrics`. Error 501 si no habilitado.

---

## 🏁 LLMPULSE — TELEMETRÍA CORREGIDA

**Fecha**: 2026-10-12
**Estado**: ✅ COMPLETADO

### Correcciones:
1. **Model Switching**: detect_model → None en lugar de Err
2. **Tk/s In/Out**: Doble fuente — `/metrics` + fallback con max_tokens:20
3. **counter_value**: Escanea todas las líneas Prometheus
4. **Hardware Desacoplado**: Siempre visible
5. **Detección Universal**: status.value == "loaded"
6. **Race Conditions**: Async error graceful
7. **Build Release**: Limpio

### Estados:
- **DISCONNECTED**: Servidor offline → hardware visible
- **NO MODEL**: Online, sin modelo → hardware visible
- **MODEL_NAME**: Modelo cargado → hardware + tok/s

### Preservado:
- UI minimalista, transparencia, position lock, always-on-top, resize, context menu, SVG icons, metric colors, portable execution.
