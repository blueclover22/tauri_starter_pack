// 데스크톱 release 빌드에서 콘솔 창이 뜨지 않도록 한다.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    app_lib::run();
}
