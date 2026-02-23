use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::rules::nodes::{
    api_input::ApiInputNode,
    http::HttpNode,
    condition::ConditionNode,
    transform::TransformNode,
    dmn_table::DmnTableNode,
};
use crate::engines::EngineError;
use std::collections::HashMap;

pub struct NodeRegistry {
    executors: HashMap<String, Box<dyn NodeExecutor>>,
}

impl NodeRegistry {
    pub fn new() -> Self {
        let mut executors: HashMap<String, Box<dyn NodeExecutor>> = HashMap::new();
        
        executors.insert("apiInput".to_string(), Box::new(ApiInputNode));
        executors.insert("http".to_string(), Box::new(HttpNode));
        executors.insert("condition".to_string(), Box::new(ConditionNode));
        executors.insert("transform".to_string(), Box::new(TransformNode));
        executors.insert("decisionTable".to_string(), Box::new(DmnTableNode));
        
        Self { executors }
    }
    
    pub fn get(&self, node_type: &str) -> Result<&dyn NodeExecutor, EngineError> {
        self.executors
            .get(node_type)
            .map(|b| b.as_ref())
            .ok_or_else(|| EngineError::Validation(format!("Unknown node type: {}", node_type)))
    }
}
