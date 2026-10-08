use crate::AppState;
use crate::Metrics;
// use crate::nvml;
use serde::Serialize;
use sysinfo::System;

const HOST: &str = "http://127.0.0.1";

fn f64_from_i64(v: i64) -> f64 {
    v as f64
}

/// Parses a Prometheus-style line like `llamacpp:tokens_predicted_total 1172`.
fn counter_value(text: &str, prefix: &str) -> Option<f64> {
    let first = text.split_whitespace().next()?;
    if !first.starts_with(prefix) {
        return None;
    }
    first.trim_start_matches(prefix).trim().parse().ok()
}

async fn load_model_id() -> Result<Meta, String> {
    let client = reqwest::Client::new();

    let health = client
        .get(format!("{HOST}:18080/health"))
        .send()
        .await
        .map_err(|e| format!("health check failed: {e}"))?;
    if !health.status().is_success() {
        return Err("llama.cpp not responding on health".into());
    }

    let models = client
        .get(format!("{HOST}:18080/models"))
        .send()
        .await
        .map_err(|e| format!("models fetch failed: {e}"))?;
    let models_text = models.text().await.map_err(|e| format!("models fetch failed: {e}"))?;

    let loaded_id = models_text
        .lines()
        .filter(|line| {
            line.strip_prefix('{').is_some_and(|s| s.contains(r#""status":{"value":"loaded"}"#))
        })
        .find_map(|line| {
            let start = line.find(r#""id":"#)?;
            let end = line.find(r#""status":{"#)?;
            let id = line[start..end].trim_matches('"').to_string();
            Some(id)
        })
        .ok_or_else(|| "no model with status 'loaded' found".to_string())?;

    // model human-readable alias from props
    let props = client
        .get(format!("{HOST}:18080/props?model={}", url_encode(&loaded_id)))
        .send()
        .await
        .map_err(|_| "")?;
    let props_text = props.text().await.map_err(|_| "")?;
    let alias = props_text
        .lines()
        .find_map(|line| {
            line.strip_prefix('{').is_some_and(|s| s.contains(r#""model_alias""#))
                .then(|| line.to_string())
        })
        .and_then(|line| {
            let start = line.find(r#""model_alias":"#)?;
            let end = line.find('}')?;
            let v = line[start..end].trim_matches('"').to_string();
            Some(v)
        })
        .unwrap_or_else(|| loaded_id.clone());

    // generation state
    let slots = client
        .get(format!("{HOST}:18080/slots?model={}", url_encode(&loaded_id)))
        .send()
        .await
        .map_err(|_| "")?;
    let slots_text = slots.text().await.map_err(|_| "")?;
    let generating = slots_text
        .lines()
        .any(|line| {
            line.strip_prefix('{').is_some_and(|s| s.contains(r#""is_processing":true"#))
        });

    Ok(Meta {
        model: alias,
        generating,
        loaded_id,
    })
}

fn url_encode(id: &str) -> String {
    id.replace('_', "%5F")
}

#[derive(Serialize)]
struct Meta {
    model: String,
    generating: bool,
    loaded_id: String,
}

pub async fn gather(state: &AppState) -> Result<Metrics, String> {
    let client = reqwest::Client::new();

    let meta = load_model_id().await?;

    // tok/s: delta of the cumulative generation-token counter over the sampling window
    let metrics = client
        .get(format!("{HOST}:18080/metrics?model={}", url_encode(&meta.loaded_id)))
        .send()
        .await
        .map_err(|_| "")?;
    let metrics_text = metrics.text().await.map_err(|_| "")?;

    let tokens_predicted_total =
        counter_value(&metrics_text, "llamacpp:tokens_predicted_total");
    let tok_per_sec = if meta.generating && tokens_predicted_total.is_some() {
        let total = tokens_predicted_total.unwrap() as i64;
        let delta = total - *state.last_tokens.lock().unwrap();
        *state.last_tokens.lock().unwrap() = total;
        if delta > 0 {
            Some(f64_from_i64(delta) * 1000.0)
        } else {
            None
        }
    } else {
        None
    };

    // VRAM (NVML)
    let mut vram_used = None::<f64>;
    let mut vram_total = None::<f64>;

    // RAM + CPU (sysinfo)
    let mut cpu_usage = None::<f64>;
    let ram_total_gb: f64;
    let ram_used_gb: f64;
    {
        let mut sys = System::new_all();
        sys.refresh_cpu_usage();
        let cpu = sys.global_cpu_usage();
        if cpu > 0.0 {
            cpu_usage = Some(cpu as f64);
        }
        ram_total_gb = sys.total_memory() as f64 / 1073741824.0;
        ram_used_gb = sys.used_memory() as f64 / 1073741824.0;
    }

    // elapsed generation time
    let elapsed = match *state.elapsed_start.lock().unwrap() {
        Some(start) => fmt_elapsed(start.elapsed()),
        None => "--:--:--".to_string(),
    };

    let model = if meta.model.is_empty() { meta.loaded_id } else { meta.model };

    Ok(Metrics {
        model,
        online: true,
        generating: meta.generating,
        tok_per_sec,
        vram_used_gb: vram_used,
        vram_total_gb: vram_total,
        ram_used_gb: Some(ram_used_gb),
        ram_total_gb: Some(ram_total_gb),
        cpu_usage,
        elapsed,
    })
}

fn fmt_elapsed(duration: std::time::Duration) -> String {
    let s = duration.as_secs();
    let h = (s / 3600) as u32;
    let m = ((s % 3600) / 60) as u32;
    let sec = (s % 60) as u32;
    format!("{h:02}:{m:02}:{sec:02}")
}
