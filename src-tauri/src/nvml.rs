//! Minimal, self-contained NVML bindings.
//!
//! Loads `nvml.dll` via Win32 `LoadLibraryW` / `GetProcAddress` using the
//! `windows` crate (Win32 + Unicode). No static `nvml.lib` needed.

use std::path::PathBuf;
use std::os::windows::prelude::OsStrExt;
use std::ffi::c_void;

use windows::Win32::Foundation::{FreeLibrary, HMODULE};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

#[repr(C)]
pub struct nvmlMemory_t {
    pub used: u64,
    pub total: u64,
}

pub type NvmlReturnT = i32;

const NVML_SUCCESS: NvmlReturnT = 0;

/// Resolve an NVML function name from the loaded module.
/// Returns a raw function pointer via transmute.
fn resolve_proc(handle: HMODULE, name: &str) -> Result<*const c_void, String> {
    let bytes = name
        .as_bytes()
        .iter()
        .copied()
        .chain([0u8])
        .collect::<Vec<u8>>();
    let farproc = unsafe { GetProcAddress(handle, windows::core::PCSTR(bytes.as_ptr())) };
    // FARPROC is Option<unsafe extern "system" fn() -> isize>
    let ptr = farproc
        .ok_or_else(|| format!("GetProcAddress('{}') returned null", name))? as *const c_void;
    Ok(ptr)
}

/// Loads `nvml.dll`, resolves each NVML symbol via `GetProcAddress`, and calls
/// the functions. Returns `None` if the DLL is missing, the driver is absent,
/// or no GPU is present. Returns `Some((name, mem))` on success.
pub fn get_gpu_memory() -> Result<(String, nvmlMemory_t), String> {
    let paths: Vec<PathBuf> = vec![
        "nvml.dll".into(),
        "C:\\Windows\\System32\\DriverStore\\FileRepository\\nv_dispi.inf_amd64_da865124972e1f80\\nvml.dll".into(),
        "C:\\Windows\\System32\\nvml.dll".into(),
    ];

    let handle = load_module(&paths)?;

    let nvml_init = NvmlProc(resolve_proc(handle, "nvmlInit")?);
    let nvml_shutdown = NvmlProc(resolve_proc(handle, "nvmlShutdown")?);
    let nvml_device_get_count = NvmlProc(resolve_proc(handle, "nvmlDevice_getCount")?);
    let nvml_device_get_handle_by_index = NvmlProc(resolve_proc(handle, "nvmlDevice_getHandleByIndex")?);
    let nvml_device_get_memory_info = NvmlProc(resolve_proc(handle, "nvmlDevice_getMemoryInfo")?);
    let nvml_device_get_name = NvmlProc(resolve_proc(handle, "nvmlDevice_getName")?);

    if unsafe { nvml_init.call_noarg() } != NVML_SUCCESS {
        let _ = unsafe { FreeLibrary(handle) };
        return Err("nvmlInit() failed".into());
    }

    let mut count = 0u32;
    let ret = unsafe { nvml_device_get_count.call_uint(&mut count) };
    if ret != NVML_SUCCESS || count <= 0 {
        unsafe { nvml_shutdown.call_noarg() };
        let _ = unsafe { FreeLibrary(handle) };
        return Err("no NVIDIA GPU devices found".into());
    }

    let index = 0u32;
    let mut dev = std::ptr::null_mut();
    let ret = unsafe { nvml_device_get_handle_by_index.call_i32(index, &mut dev) };
    if ret != NVML_SUCCESS || dev.is_null() {
        unsafe { nvml_shutdown.call_noarg() };
        let _ = unsafe { FreeLibrary(handle) };
        return Err("failed to get handle for GPU #0".into());
    }

    let mut mem = nvmlMemory_t { used: 0, total: 0 };
    let ret = unsafe { nvml_device_get_memory_info.call_mem(dev, &mut mem) };
    if ret != NVML_SUCCESS {
        let name = device_name(&nvml_device_get_name, dev);
        unsafe { nvml_shutdown.call_noarg() };
        let _ = unsafe { FreeLibrary(handle) };
        return Err(format!(
            "nvmlDevice_getMemoryInfo() failed (ret={}) on device '{}'",
            ret, name
        ));
    }

    let name = device_name(&nvml_device_get_name, dev);
    unsafe { nvml_shutdown.call_noarg() };
    let _ = unsafe { FreeLibrary(handle) };
    Ok((name, mem))
}

fn load_module(paths: &[PathBuf]) -> Result<HMODULE, String> {
    for path in paths {
        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .into_iter()
            .chain(Some(0))
            .collect();
        let h = unsafe { LoadLibraryW(windows::core::PCWSTR(wide.as_ptr())) }.map_err(|e| {
            let _ = e;
            "LoadLibraryW failed for path".to_string()
        })?;
        return Ok(h);
    }
    Err("failed to load nvml.dll from all paths".into())
}

/// A resolved NVML function pointer.
struct NvmlProc(*const c_void);

impl NvmlProc {
    /// nvmlReturn_t nvmlInit(void)
    unsafe fn call_noarg(&self) -> NvmlReturnT {
        let f: unsafe extern "system" fn() -> NvmlReturnT =
            unsafe { std::mem::transmute(self.0) };
        unsafe { f() }
    }

    /// nvmlReturn_t nvmlDevice_getCount(unsigned int*)
    unsafe fn call_uint(&self, count: *mut u32) -> NvmlReturnT {
        let f: unsafe extern "system" fn(*mut u32) -> NvmlReturnT =
            unsafe { std::mem::transmute(self.0) };
        unsafe { f(count) }
    }

    /// nvmlReturn_t nvmlDevice_getHandleByIndex(unsigned int, nvmlDevice_t*)
    unsafe fn call_i32(&self, index: u32, device: *mut *mut c_void) -> NvmlReturnT {
        let f: unsafe extern "system" fn(u32, *mut *mut c_void) -> NvmlReturnT =
            unsafe { std::mem::transmute(self.0) };
        unsafe { f(index, device) }
    }

    /// nvmlReturn_t nvmlDevice_getMemoryInfo(nvmlDevice_t, nvmlMemory_t*)
    unsafe fn call_mem(&self, device: *mut c_void, memory: *mut nvmlMemory_t) -> NvmlReturnT {
        let f: unsafe extern "system" fn(*mut c_void, *mut nvmlMemory_t) -> NvmlReturnT =
            unsafe { std::mem::transmute(self.0) };
        unsafe { f(device, memory) }
    }
}

fn device_name(proc: &NvmlProc, handle: *mut c_void) -> String {
    let mut buf = [0u8; 256];
    unsafe {
        let f: unsafe extern "system" fn(*mut c_void, *mut [u8; 256]) -> NvmlReturnT =
            std::mem::transmute(proc.0);
        f(handle, &mut buf);
    }
    String::from_utf8_lossy(&buf).trim_matches(|c: char| c.is_ascii_whitespace() || c == '\0').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_gpu_memory() {
        match get_gpu_memory() {
            Ok((name, mem)) => {
                assert!(!name.is_empty());
                assert!(mem.total > 0);
                println!("GPU {} used {}/{} GB", name, mem.used, mem.total);
            }
            Err(e) => panic!("{}", e),
        }
    }
}
