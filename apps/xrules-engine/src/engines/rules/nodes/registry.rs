use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::rules::nodes::{
    api_input::ApiInputNode,
    http::HttpNode,
    condition::ConditionNode,
    transform::TransformNode,
    dmn_table::DmnTableNode,
    rule_ref::RuleRefNode,
    ml_model::MlModelNode,
    llm_prompt::LlmPromptNode,
    subflow::SubflowNode,
};
use crate::engines::EngineError;
use std::collections::HashMap;

pub struct NodeRegistry {
    executors: HashMap<String, Box<dyn NodeExecutor>>,
}

impl NodeRegistry {
    pub fn new() -> Self {
        let backend_url = std::env::var("BACKEND_URL")
            .unwrap_or_else(|_| "http://localhost:4000".to_string());

        let mut executors: HashMap<String, Box<dyn NodeExecutor>> = HashMap::new();

        // Core nodes
        executors.insert("apiInput".to_string(), Box::new(ApiInputNode));
        executors.insert("http".to_string(), Box::new(HttpNode));
        executors.insert("condition".to_string(), Box::new(ConditionNode));
        executors.insert("transform".to_string(), Box::new(TransformNode));
        executors.insert("decisionTable".to_string(), Box::new(DmnTableNode));

        // New integration nodes
        executors.insert("ruleRef".to_string(), Box::new(RuleRefNode::new(backend_url.clone())));
        executors.insert("mlModel".to_string(), Box::new(MlModelNode));
        executors.insert("llmPrompt".to_string(), Box::new(LlmPromptNode));
        executors.insert("subflow".to_string(), Box::new(SubflowNode::new(backend_url)));

        Self { executors }
    }

    pub fn get(&self, node_type: &str) -> std::result::Result<&dyn NodeExecutor, EngineError> {
        self.executors
            .get(node_type)
            .map(|b| b.as_ref())
            .ok_or_else(|| EngineError::Validation(format!("Unknown node type: {}", node_type)))
    }
}
