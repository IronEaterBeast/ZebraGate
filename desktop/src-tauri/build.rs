use std::fs;
use std::path::Path;

/// 构建期注入：把 desktop 目录下的环境配置项通过 cargo:rustc-env
/// 暴露给 option_env!，从而在编译时固化进二进制。
///
/// 开发构建（`pnpm dev` / cargo debug）读取 `.env.development`，
/// 发布构建（`pnpm build` / cargo release）读取 `.env.production`。
/// 两套配置彼此独立、各自固化，本地开发无需每次手动指定环境变量。
///
/// 这些文件不分发给最终用户，也不入库（被 .gitignore 忽略）。
/// 模板见 desktop/.env.example。对应文件不存在时静默跳过，
/// 仍可退回到运行时环境变量（见 resolve_* 函数）。
fn inject_build_env() {
    // cargo 在 debug 构建时 PROFILE=debug，release 构建时 PROFILE=release。
    let profile = std::env::var("PROFILE").unwrap_or_default();
    let file_name = if profile == "release" {
        ".env.production"
    } else {
        ".env.development"
    };

    // build.rs 的工作目录是 src-tauri，配置文件位于上一级 desktop 目录。
    let rel_path = format!("../{file_name}");
    let path = Path::new(&rel_path);
    println!("cargo:rerun-if-changed={rel_path}");

    let Ok(contents) = fs::read_to_string(path) else {
        return;
    };

    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        if key.is_empty() {
            continue;
        }
        println!("cargo:rustc-env={key}={value}");
    }
}

fn main() {
    inject_build_env();
    tauri_build::build()
}
