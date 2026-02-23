use crate::engines::rules::context::ExecutionContext;
use crate::engines::rules::Result;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;

pub trait NodeExecutor: Send + Sync {
    fn execute<'a>(
        &'a self,
        config: &'a Value,
        context: &'a mut ExecutionContext,
    ) -> Pin<Box<dyn Future<Output = Result<Value>> + Send + 'a>>;
}
