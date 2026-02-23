"""
XRules AI Engine
Deep Learning model server supporting TensorFlow, PyTorch, and ONNX
Port: 50055
"""

import os
import time
import logging
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager
from enum import Enum

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from inference import InferenceEngine
from model_manager import ModelManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class FrameworkType(str, Enum):
    """Supported deep learning frameworks"""
    TENSORFLOW = "tensorflow"
    PYTORCH = "pytorch"
    ONNX = "onnx"


# Global state
model_manager = ModelManager()
inference_engine = InferenceEngine(model_manager)
startup_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting XRules AI Engine...")
    logger.info(f"GPU Available: {inference_engine.gpu_available}")
    yield
    logger.info("Shutting down XRules AI Engine...")


app = FastAPI(
    title="XRules AI Engine",
    description="Deep Learning model execution engine supporting TensorFlow, PyTorch, and ONNX",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============ Request/Response Models ============

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "ai-engine"
    version: str = "0.1.0"
    gpu_available: bool = False
    models_loaded: int = 0
    uptime: float = 0.0


class ExecuteRequest(BaseModel):
    rule: Dict[str, Any] = Field(..., description="Rule definition with model info")
    input: Dict[str, Any] = Field(..., description="Input data for inference")


class ExecuteResponse(BaseModel):
    success: bool
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: float = 0.0
    engine_used: str = "ai"
    device: str = "cpu"


class LoadModelRequest(BaseModel):
    model_path: Optional[str] = None
    framework: str = "onnx"
    model_name: Optional[str] = None


class LoadModelResponse(BaseModel):
    success: bool
    model_id: Optional[str] = None
    framework: Optional[str] = None
    error: Optional[str] = None


class InferenceRequest(BaseModel):
    model_id: str
    input: Dict[str, Any]
    preprocess: bool = True
    postprocess: bool = True


class InferenceResponse(BaseModel):
    success: bool
    predictions: Optional[List[Any]] = None
    probabilities: Optional[List[Dict[str, float]]] = None
    error: Optional[str] = None


class ModelInfo(BaseModel):
    id: str
    name: str
    framework: str
    loaded_at: str
    input_shape: Optional[List[int]] = None
    output_shape: Optional[List[int]] = None
    device: str = "cpu"


# ============ API Endpoints ============

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        gpu_available=inference_engine.gpu_available,
        models_loaded=len(model_manager.models),
        uptime=time.time() - startup_time
    )


@app.post("/execute", response_model=ExecuteResponse)
async def execute(request: ExecuteRequest):
    """Execute deep learning model inference"""
    start_time = time.time()
    
    try:
        rule_def = request.rule.get("definition", {})
        model_path = rule_def.get("model_path")
        framework = rule_def.get("framework", "onnx")
        
        if not model_path:
            return ExecuteResponse(
                success=False,
                error="Model path not found in rule definition",
                duration_ms=(time.time() - start_time) * 1000,
                device="cpu"
            )
        
        # Load or get cached model
        model_id = await model_manager.load_model(model_path, framework)
        
        # Run inference
        result = await inference_engine.infer(model_id, request.input)
        
        duration_ms = (time.time() - start_time) * 1000
        
        return ExecuteResponse(
            success=True,
            output=result,
            duration_ms=duration_ms,
            engine_used="ai",
            device=result.get("device", "cpu")
        )
        
    except Exception as e:
        logger.error(f"Execution error: {e}")
        return ExecuteResponse(
            success=False,
            error=str(e),
            duration_ms=(time.time() - start_time) * 1000,
            device="cpu"
        )


@app.post("/models/load", response_model=LoadModelResponse)
async def load_model(request: LoadModelRequest):
    """Load a deep learning model"""
    try:
        model_id = await model_manager.load_model(
            request.model_path,
            request.framework,
            request.model_name
        )
        
        return LoadModelResponse(
            success=True,
            model_id=model_id,
            framework=request.framework
        )
        
    except Exception as e:
        logger.error(f"Load model error: {e}")
        return LoadModelResponse(success=False, error=str(e))


@app.post("/models/upload")
async def upload_model(
    file: UploadFile = File(...),
    framework: str = "onnx",
    model_name: Optional[str] = None
):
    """Upload and load a model file"""
    try:
        # Save uploaded file
        upload_dir = "/app/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        
        file_path = os.path.join(upload_dir, file.filename)
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # Load the model
        model_id = await model_manager.load_model(file_path, framework, model_name)
        
        return {
            "success": True,
            "model_id": model_id,
            "framework": framework,
            "filename": file.filename
        }
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@app.get("/models")
async def list_models():
    """List all loaded models"""
    models = []
    for model_id, info in model_manager.models.items():
        models.append(ModelInfo(
            id=model_id,
            name=info.get("name", model_id),
            framework=info.get("framework", "unknown"),
            loaded_at=info.get("loaded_at", ""),
            input_shape=info.get("input_shape"),
            output_shape=info.get("output_shape"),
            device=info.get("device", "cpu")
        ))
    
    return {"success": True, "models": models}


@app.delete("/models/{model_id}")
async def unload_model(model_id: str):
    """Unload a model"""
    success = model_manager.unload(model_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found"
        )
    return {"success": True, "message": f"Model {model_id} unloaded"}


@app.post("/inference", response_model=InferenceResponse)
async def inference(request: InferenceRequest):
    """Run inference with a loaded model"""
    try:
        result = await inference_engine.infer(
            request.model_id,
            request.input,
            request.preprocess,
            request.postprocess
        )
        
        return InferenceResponse(
            success=True,
            predictions=result.get("predictions"),
            probabilities=result.get("probabilities")
        )
        
    except Exception as e:
        logger.error(f"Inference error: {e}")
        return InferenceResponse(success=False, error=str(e))


@app.get("/supported-frameworks")
async def get_supported_frameworks():
    """Get supported frameworks and their status"""
    frameworks = {
        "tensorflow": inference_engine.tensorflow_available,
        "pytorch": inference_engine.pytorch_available,
        "onnx": True  # Always available
    }
    
    return {
        "success": True,
        "frameworks": frameworks,
        "gpu_available": inference_engine.gpu_available
    }


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "50055"))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"Starting AI Engine on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
