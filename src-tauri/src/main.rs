use tauri::State;
use serde::Serialize;

#[derive(Serialize)]
pub struct Metrics {
    pub model: String,
    pub online: bool,
    pub generating: bool,
    pub tok_per_sec: Option<f64>,
    pub vram_used_gb: Option<f64>,
    pub vram_total_gb: Option<f64>,
    pub ram_used_gb: Option<f64>,
    pub ram_total_gb: Option<f64>,
    pub cpu_usage: Option<f64>,
    pub elapsed: String,
}

pub struct AppState {
    pub host: String,
    pub port: u16,
    pub interval_ms: u64,
    /// Cumulative generation tokens seen on the last sample (tok/s delta source).
    pub last_tokens: std::sync::Mutex<i64>,
    /// Start of the current generation, if one is active.
    pub elapsed_start: std::sync::Mutex<Option<std::time::Instant>>,
}

mod collectors;
//pub mod nvml;

#[tauri::command]
async fn get_metrics(state: State<'_, AppState>) -> Result<Metrics, String> {
    collectors::gather(state.inner()).await
}

fn main() {
    #[cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
    fn main_inner() {
        tauri::Builder::default()
            .manage(AppState {
                host: "127.0.0.1".to_string(),
                port: 18080,
                interval_ms: 1000,
                last_tokens: std::sync::Mutex::new(0),
                elapsed_start: std::sync::Mutex::new(None),
            })
            .invoke_handler(tauri::generate_handler![get_metrics])
            .run(tauri::generate_context!())
            .expect("failed to start")
    }

    main_inner();
}
