use crate::AppState;
use crate::Metrics;
use std::os::windows::process::CommandExt;
use sysinfo::System;

/// Parses a Prometheus-style line like `llamacpp:tokens_predicted_total 1172`.
/// Scans ALL lines (not just the first token) to find the matching metric.
fn counter_value(text: &str, prefix: &str) -> Option<f64> {
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with(prefix) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                return parts[1].parse().ok();
            }
        }
    }
    None
}

/// Represents the current model state detected from llama.cpp /models endpoint.
#[derive(Debug, Clone)]
struct ModelState {
    model: String,
    generating: bool,
    loaded_id: String,
}

/// Detects the currently loaded model from llama.cpp router.
/// Returns None when no model has status "loaded" (e.g. during unload/load transition).
/// Does NOT error — this is a valid state (CONNECTED + NO MODEL).
///
/// Universal detection: no hardcoded model names. Any model with status "loaded" is active.
async fn detect_model(host: &str, port: u16) -> Option<ModelState> {
    let client = reqwest::Client::new();
    let base = format!("http://{}:{port}", host);

    let models = match client.get(format!("{base}/models")).send().await {
        Ok(r) => r,
        Err(_) => return None,
    };
    let models_text = match models.text().await {
        Ok(t) => t,
        Err(_) => return None,
    };

    let models_resp: serde_json::Value = match serde_json::from_str(&models_text) {
        Ok(v) => v,
        Err(_) => return None,
    };

    // Universal detection: find the first model with status "loaded".
    let loaded = models_resp
        .get("data")
        .and_then(|d| d.as_array())
        .and_then(|arr| arr.iter().find(|m| {
            m.get("status")
                .and_then(|s| s.get("value"))
                .and_then(|v| v.as_str())
                == Some("loaded")
        }));

    let loaded = match loaded {
        Some(m) => m,
        None => return None, // No model loaded — valid state
    };

    let loaded_id = loaded
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    // Get model alias from /props (optional, may not exist)
    let alias = {
        let props_url = format!("{base}/props?model={}", url_encode(&loaded_id));
        match client.get(&props_url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.text().await {
                        Ok(text) => {
                            match serde_json::from_str::<serde_json::Value>(&text) {
                                Ok(props_obj) => props_obj
                                    .get("model_alias")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                                    .unwrap_or_else(|| loaded_id.clone()),
                                Err(_) => loaded_id.clone(),
                            }
                        }
                        Err(_) => loaded_id.clone(),
                    }
                } else {
                    loaded_id.clone()
                }
            }
            Err(_) => loaded_id.clone(),
        }
    };

    // Check if model is generating via /slots (optional, may not exist)
    let generating = {
        let slots_url = format!("{base}/slots?model={}", url_encode(&loaded_id));
        match client.get(&slots_url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.text().await {
                        Ok(text) => {
                            match serde_json::from_str::<serde_json::Value>(&text) {
                                Ok(slots_arr) => {
                                    if let Some(arr) = slots_arr.as_array() {
                                        arr.iter().any(|slot| {
                                            slot.get("is_processing")
                                                .and_then(|v| v.as_bool())
                                                .unwrap_or(false)
                                        })
                                    } else {
                                        false
                                    }
                                }
                                Err(_) => false,
                            }
                        }
                        Err(_) => false,
                    }
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    };

    Some(ModelState {
        model: if alias.is_empty() || alias == loaded_id { loaded_id.clone() } else { alias },
        generating,
        loaded_id,
    })
}

/// Get tok/s from llama.cpp.
/// Strategy (fallback chain):
/// 1. Try /metrics endpoint (if server has --metrics enabled)
/// 2. Fall back to extracting timings from a lightweight test completion
///    — this gives REAL tok/s from the SAME inference that just ran
///
/// Returns (predicted_per_second, prompt_per_second) — real tok/s values from llama.cpp.
/// predicted_per_second = generation speed (Tk/s Out)
/// prompt_per_second    = prompt processing speed (Tk/s In)
async fn get_tok_per_sec(client: &reqwest::Client, host: &str, port: u16, loaded_id: &str) -> Option<(f64, f64)> {
    // Try /metrics endpoint first (if server has --metrics enabled)
    let metrics_url = format!(
        "http://{}:{port}/metrics?model={}",
        host,
        url_encode(loaded_id)
    );

    if let Ok(resp) = client.get(&metrics_url).send().await {
        if resp.status().is_success() {
            if let Ok(text) = resp.text().await {
                // Check if this is the "not supported" error
                if !text.contains("not_supported_error") && !text.contains("metrics endpoint") {
                    // Parse prompt_per_second and predicted_per_second from Prometheus format
                    let prompt_ps = counter_value(&text, "llamacpp:prompt_per_second");
                    let predicted_ps = counter_value(&text, "llamacpp:predicted_per_second");

                    match (predicted_ps, prompt_ps) {
                        (Some(p), Some(pp)) => return Some((p, pp)),
                        (Some(p), None) => return Some((p, 0.0)),
                        (None, Some(pp)) => return Some((0.0, pp)),
                        (None, None) => {}
                    }
                }
            }
        }
    }

    // Fallback: extract timings from a lightweight test completion
    // This gives REAL tok/s from the SAME inference
    let base = format!("http://{}:{port}", host);
    let completion_url = format!("{base}/v1/chat/completions");

    // Use a moderate completion (20 tokens) for accurate throughput measurement.
    // With only 5 tokens the timing is skewed by GPU warmup / first-token overhead,
    // inflating predicted_per_second (~96-100 vs real ~40).  20 tokens gives a
    // representative sample of sustained generation speed.
    let body = serde_json::json!({
        "model": loaded_id,
        "messages": [{"role": "user", "content": "Say one word."}],
        "max_tokens": 20,
        "temperature": 0.1,
        "stream": false
    });

    match client.post(&completion_url).json(&body).timeout(std::time::Duration::from_secs(30)).send().await {
        Ok(resp) => {
            if !resp.status().is_success() {
                return None;
            }
            let text = match resp.text().await {
                Ok(t) => t,
                Err(_) => return None,
            };

            if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(timings) = obj.get("timings").and_then(|t| t.as_object()) {
                    let predicted_ps = timings.get("predicted_per_second").and_then(|v| v.as_f64());
                    let prompt_ps = timings.get("prompt_per_second").and_then(|v| v.as_f64());

                    match (predicted_ps, prompt_ps) {
                        (Some(p), Some(pp)) if p > 0.0 && pp > 0.0 => return Some((p, pp)),
                        (Some(p), _) if p > 0.0 => return Some((p, 0.0)),
                        (_, Some(pp)) if pp > 0.0 => return Some((0.0, pp)),
                        _ => None,
                    }
                } else {
                    None
                }
            } else {
                None
            }
        }
        Err(_) => None,
    }
}

fn url_encode(id: &str) -> String {
    id.replace('_', "%5F")
}

/// Acquire CPU/RAM metrics from the persistent System object in AppState.
/// Returns (cpu_usage, ram_used_gb, ram_total_gb).
fn get_sys_metrics(sys: &mut System) -> (Option<f64>, f64, f64) {
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let cpu = sys.global_cpu_usage();
    let ram_total = sys.total_memory();
    let ram_used = sys.used_memory();
    (
        if cpu > 0.0 { Some(cpu as f64) } else { None },
        ram_used as f64 / 1073741824.0,
        ram_total as f64 / 1073741824.0,
    )
}

/// Collect GPU hardware metrics from nvidia-smi.
/// Returns (vram_used_gb, vram_total_gb, gpu_usage_pct, gpu_temp_c).
fn collect_gpu_metrics() -> (Option<f64>, Option<f64>, Option<f64>, Option<f64>) {
    let mut cmd = std::process::Command::new("nvidia-smi");
    cmd.arg("--query-gpu=memory.used,memory.total,utilization.gpu,temperature.gpu")
       .arg("--format=csv,noheader,nounits")
       .creation_flags(0x08000000); // CREATE_NO_WINDOW
    let out = match cmd.output() {
        Ok(o) => o,
        Err(_) => return (None, None, None, None),
    };

    let stdout = match String::from_utf8(out.stdout) {
        Ok(s) => s,
        Err(_) => return (None, None, None, None),
    };

    let line = stdout.trim();
    if line.is_empty() {
        return (None, None, None, None);
    }

    let parts: Vec<String> = line
        .split(',')
        .map(|s| s.trim().to_string())
        .collect();
    if parts.len() < 4 {
        return (None, None, None, None);
    }

    let extract_num = |s: &str| -> f64 {
        s.trim().parse::<f64>().unwrap_or(0.0)
    };

    let used = extract_num(&parts[0]);
    let total = extract_num(&parts[1]);
    let util = extract_num(&parts[2]);
    let temp = extract_num(&parts[3]);

    if total > 0.0 {
        (Some(used / 1024.0), Some(total / 1024.0), Some(util),
         if temp > 0.0 && temp < 150.0 { Some(temp) } else { None })
    } else {
        (None, None, None, None)
    }
}

pub async fn gather(state: &AppState) -> Result<Metrics, String> {
    let host = state.host.clone();
    let port = state.port.load(std::sync::atomic::Ordering::Relaxed);

    // ====== CONCERN 1: Server Health ======
    let client = reqwest::Client::new();
    let health = client
        .get(format!("http://{}:{port}/health", host))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await;

    let server_online = match health {
        Ok(r) if r.status().is_success() => true,
        _ => false,
    };

    // ====== CONCERN 2: Hardware Telemetry (always collected, independent of llama.cpp) ======
    let gpu_metrics = collect_gpu_metrics();

    // ====== CONCERN 3: CPU/RAM Metrics ======
    // Must collect BEFORE any async calls to avoid MutexGuard across await
    let (cpu_usage, ram_used_gb, ram_total_gb) = {
        let mut sys = state.sys.lock().unwrap();
        get_sys_metrics(&mut sys)
    };

    // ====== CONCERN 4: Elapsed Time ======
    let elapsed = match *state.elapsed_start.lock().unwrap() {
        Some(start) => {
            let s = start.elapsed().as_secs();
            let h = (s / 3600) as u32;
            let m = ((s % 3600) / 60) as u32;
            let sec = (s % 60) as u32;
            format!("{h:02}:{m:02}:{sec:02}")
        }
        None => "--:--:--".to_string(),
    };

    // Build metrics based on server state and model state
    if !server_online {
        return Ok(Metrics {
            model: "DISCONNECTED".to_string(),
            online: false,
            generating: false,
            tok_per_sec: None,
            tok_per_sec_last: None,
            tok_per_sec_in: None,
            tok_per_sec_out: None,
            vram_used_gb: gpu_metrics.0,
            vram_total_gb: gpu_metrics.1,
            gpu_usage: gpu_metrics.2,
            gpu_temp: gpu_metrics.3,
            ram_used_gb: Some(ram_used_gb),
            ram_total_gb: Some(ram_total_gb),
            cpu_usage,
            cpu_temp: None,
            elapsed,
        });
    }

    // Server online — check model state (sequence-based invalidation for race condition handling)
    let model_state = detect_model(&host, port).await;

    match model_state {
        Some(meta) => {
            // Model is loaded — get tok/s from /metrics (if available) or test completion
            let (tok_out, tok_in) = match get_tok_per_sec(&client, &host, port, &meta.loaded_id).await {
                Some((out, inp)) => (Some(out), Some(inp)),
                None => (None, None),
            };

            // Update elapsed start tracking based on generating state
            {
                let mut start_lock = state.elapsed_start.lock().unwrap();
                if meta.generating && start_lock.is_none() {
                    *start_lock = Some(std::time::Instant::now());
                } else if !meta.generating {
                    *start_lock = None;
                }
            }

            Ok(Metrics {
                model: meta.model,
                online: true,
                generating: meta.generating,
                tok_per_sec: tok_out,
                tok_per_sec_last: None,
                tok_per_sec_in: tok_in,
                tok_per_sec_out: tok_out,
                vram_used_gb: gpu_metrics.0,
                vram_total_gb: gpu_metrics.1,
                gpu_usage: gpu_metrics.2,
                gpu_temp: gpu_metrics.3,
                ram_used_gb: Some(ram_used_gb),
                ram_total_gb: Some(ram_total_gb),
                cpu_usage,
                cpu_temp: None,
                elapsed,
            })
        }
        None => {
            // No model loaded — valid state (CONNECTED + NO MODEL)
            // Hardware metrics remain visible
            Ok(Metrics {
                model: "NO MODEL".to_string(),
                online: true,
                generating: false,
                tok_per_sec: None,
                tok_per_sec_last: None,
                tok_per_sec_in: None,
                tok_per_sec_out: None,
                vram_used_gb: gpu_metrics.0,
                vram_total_gb: gpu_metrics.1,
                gpu_usage: gpu_metrics.2,
                gpu_temp: gpu_metrics.3,
                ram_used_gb: Some(ram_used_gb),
                ram_total_gb: Some(ram_total_gb),
                cpu_usage,
                cpu_temp: None,
                elapsed,
            })
        }
    }
}
