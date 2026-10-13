#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::State;
use serde::Serialize;
use sysinfo::System;

#[derive(Serialize)]
pub struct Metrics {
    pub model: String,
    pub online: bool,
    pub generating: bool,
    pub tok_per_sec: Option<f64>,
    pub tok_per_sec_last: Option<f64>,
    pub tok_per_sec_in: Option<f64>,
    pub tok_per_sec_out: Option<f64>,
    pub vram_used_gb: Option<f64>,
    pub vram_total_gb: Option<f64>,
    pub gpu_usage: Option<f64>,
    pub gpu_temp: Option<f64>,
    pub ram_used_gb: Option<f64>,
    pub ram_total_gb: Option<f64>,
    pub cpu_usage: Option<f64>,
    pub cpu_temp: Option<f64>,
    pub elapsed: String,
}

pub struct AppState {
    pub host: String,
    pub port: std::sync::atomic::AtomicU16,
    pub interval_ms: u64,
    pub elapsed_start: std::sync::Mutex<Option<std::time::Instant>>,
    pub sys: std::sync::Mutex<System>,
}

mod collectors;

#[tauri::command]
async fn get_metrics(state: State<'_, AppState>) -> Result<Metrics, String> {
    collectors::gather(state.inner()).await
}

#[tauri::command]
fn set_port(state: State<'_, AppState>, new_port: u16) {
    state.port.store(new_port, std::sync::atomic::Ordering::Relaxed);
}

#[tauri::command]
async fn test_llama_connection(_state: State<'_, AppState>, port: u16) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/health", port);
    match client
        .get(&url)
        .timeout(std::time::Duration::from_secs(5))
        .send().await {
        Ok(resp) if resp.status().is_success() => {
            Ok(format!("CONNECTED (http://127.0.0.1:{}/health)", port))
        }
        Ok(resp) => {
            Err(format!("DISCONNECTED (HTTP {})", resp.status()))
        }
        Err(e) => Err(format!("DISCONNECTED ({})", e)),
    }
}

#[tauri::command]
async fn get_tok_per_sec_from_request(_state: State<'_, AppState>, port: u16) -> Result<Option<f64>, String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/v1/chat/completions", port);
    let body = serde_json::json!({
        "model": "qwen36-fast-80k",
        "messages": [{"role": "user", "content": "Say hello in one word."}],
        "max_tokens": 50,
        "temperature": 0.1,
        "stream": false
    });
    match client.post(&url).json(&body).timeout(std::time::Duration::from_secs(30)).send().await {
        Ok(resp) => {
            if !resp.status().is_success() {
                return Ok(None);
            }
            let text = resp.text().await.ok().unwrap_or_default();
            if let Ok(obj) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(timings) = obj.get("timings").and_then(|t| t.as_object()) {
                    if let Some(pps) = timings.get("predicted_per_second").and_then(|v| v.as_f64()) {
                        if pps > 0.0 {
                            return Ok(Some(pps));
                        }
                    }
                }
            }
            Ok(None)
        }
        Err(_) => Ok(None),
    }
}

#[tauri::command]
async fn set_always_on_top(window: tauri::Window, enabled: bool) -> Result<(), String> {
    window.set_always_on_top(enabled).map_err(|e| e.to_string())
}

#[tauri::command]
fn close_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn set_window_size(window: tauri::Window, width: f64, height: f64) -> Result<(), String> {
    use dpi::Size;
    window.set_size(Size::Physical(dpi::PhysicalSize::new(width as u32, height as u32)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_window_position(window: tauri::Window, x: f64, y: f64) -> Result<(), String> {
    use dpi::Position;
    window.set_position(Position::Physical(dpi::PhysicalPosition::new(x as i32, y as i32)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_monitor_workarea(window: tauri::Window) -> Result<serde_json::Value, String> {
    let _ = window;
    Ok(serde_json::json!({
        "workarea": {
            "x": 0,
            "y": 0,
            "width": 1920,
            "height": 1080,
        }
    }))
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            host: "127.0.0.1".to_string(),
            port: std::sync::atomic::AtomicU16::new(18081),
            interval_ms: 1000,
            elapsed_start: std::sync::Mutex::new(None),
            sys: std::sync::Mutex::new({
                let mut s = System::new();
                s.refresh_cpu_usage();
                s
            }),
        })
        .invoke_handler(tauri::generate_handler![
            get_metrics,
            set_port,
            test_llama_connection,
            get_tok_per_sec_from_request,
            set_always_on_top,
            close_app,
            set_window_size,
            set_window_position,
            get_monitor_workarea
        ])
        .run(tauri::generate_context!())
        .expect("failed to start")
}
