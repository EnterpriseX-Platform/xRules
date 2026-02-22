use std::io::Result;

fn main() -> Result<()> {
    tonic_build::configure()
        .build_server(true)
        .build_client(true)
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .file_descriptor_set_path("src/proto/engine_descriptor.bin")
        .compile(&["proto/engine.proto"], &["proto"])?;
    Ok(())
}
