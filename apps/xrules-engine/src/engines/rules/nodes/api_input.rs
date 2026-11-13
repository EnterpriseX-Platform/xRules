use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::nodes::types::NodeExecutor;
use crate::engines::rules::Result;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

pub struct ApiInputNode;

impl NodeExecutor for ApiInputNode {
    fn execute<'a>(
        &'a self,
        _config: &'a Value,
        context: &'a mut ExecutionContext,
    ) -> Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>> {
        Box::pin(async move { Ok(context.input.clone()) })
    }
}
