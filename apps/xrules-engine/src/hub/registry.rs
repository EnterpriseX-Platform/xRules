use crate::engines::Engine;
use crate::hub::types::{EngineType, Standard};
use crate::hub::{EngineInfo, HubError};
use std::collections::HashMap;

pub struct EngineRegistry {
    engines: HashMap<EngineType, Box<dyn Engine>>,
}

impl EngineRegistry {
    pub fn new(engines: HashMap<EngineType, Box<dyn Engine>>) -> Self {
        Self { engines }
    }

    pub fn get(&self, engine_type: EngineType) -> Result<&dyn Engine, HubError> {
        self.engines
            .get(&engine_type)
            .map(|b| b.as_ref())
            .ok_or_else(|| HubError::EngineNotFound(engine_type.to_string()))
    }

    pub async fn list_engines(&self) -> Vec<EngineInfo> {
        let mut result = vec![];

        for (engine_type, engine) in &self.engines {
            let standards: Vec<String> = engine
                .supported_standards()
                .iter()
                .map(|s| s.name.clone())
                .collect();

            result.push(EngineInfo {
                name: engine.name().to_string(),
                engine_type: engine_type.to_string(),
                status: if engine.is_healthy().await {
                    "healthy"
                } else {
                    "unhealthy"
                }
                .to_string(),
                standards,
                version: engine.version().to_string(),
            });
        }

        result
    }
}
