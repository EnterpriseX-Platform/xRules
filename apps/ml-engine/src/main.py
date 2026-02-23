"""
XRules ML Engine
Python-based machine learning model server supporting scikit-learn, XGBoost, and ONNX
Port: 50053
"""

import os
import time
import logging
from typing import Any, Dict, List, Optional
from contextlib import asynccontextmanager

import joblib
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from model_loader import ModelLoader, ModelType
from predictor import Predictor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global state
model_loader = ModelLoader()
predictor = Predictor()
startup_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting XRules ML Engine...")
    yield
    logger.info("Shutting down XRules ML Engine...")


app = FastAPI(
    title="XRules ML Engine",
    description="Python-based ML model execution engine supporting scikit-learn, XGBoost, and ONNX",
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
    service: str = "ml-engine"
    version: str = "0.1.0"
    models_loaded: int = 0
    uptime: float = 0.0


class ExecuteRequest(BaseModel):
    rule: Dict[str, Any] = Field(..., description="Rule definition with model info")
    input: Dict[str, Any] = Field(..., description="Input data for prediction")


class ExecuteResponse(BaseModel):
    success: bool
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: float = 0.0
    engine_used: str = "ml"


class LoadModelRequest(BaseModel):
    model_path: Optional[str] = None
    model_content: Optional[bytes] = None
    model_type: Optional[str] = None
    model_format: Optional[str] = Field(default="auto", description="pickle, joblib, onnx, or auto")


class LoadModelResponse(BaseModel):
    success: bool
    model_id: Optional[str] = None
    model_type: Optional[str] = None
    error: Optional[str] = None


class ModelInfo(BaseModel):
    id: str
    type: str
    format: str
    loaded_at: str
    features: List[str] = []
    target: Optional[str] = None


class ListModelsResponse(BaseModel):
    success: bool
    models: List[ModelInfo]


class PredictRequest(BaseModel):
    model_id: str
    input: Dict[str, Any]


class PredictResponse(BaseModel):
    success: bool
    prediction: Optional[Any] = None
    probabilities: Optional[Dict[str, float]] = None
    error: Optional[str] = None


# ============ API Endpoints ============

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        models_loaded=len(model_loader.loaded_models),
        uptime=time.time() - startup_time
    )


@app.post("/execute", response_model=ExecuteResponse)
async def execute(request: ExecuteRequest):
    """Execute ML model prediction"""
    start_time = time.time()
    
    try:
        # Extract model info from rule
        rule_def = request.rule.get("definition", {})
        model_path = rule_def.get("model_path")
        model_content = rule_def.get("model_content")
        model_format = rule_def.get("model_format", "auto")
        
        if not model_path and not model_content:
            return ExecuteResponse(
                success=False,
                error="Model path or content not found in rule definition",
                duration_ms=(time.time() - start_time) * 1000
            )
        
        # Load or get cached model
        if model_path:
            model_id = await model_loader.load_from_file(model_path, model_format)
        else:
            model_id = await model_loader.load_from_bytes(
                model_content.encode() if isinstance(model_content, str) else model_content,
                model_format
            )
        
        # Make prediction
        prediction = await predictor.predict(model_id, request.input)
        
        duration_ms = (time.time() - start_time) * 1000
        
        return ExecuteResponse(
            success=True,
            output=prediction,
            duration_ms=duration_ms,
            engine_used="ml"
        )
        
    except Exception as e:
        logger.error(f"Execution error: {e}")
        return ExecuteResponse(
            success=False,
            error=str(e),
            duration_ms=(time.time() - start_time) * 1000
        )


@app.post("/models/load", response_model=LoadModelResponse)
async def load_model(request: LoadModelRequest):
    """Load a model from file or bytes"""
    try:
        if request.model_path:
            model_id = await model_loader.load_from_file(
                request.model_path, 
                request.model_format
            )
        elif request.model_content:
            model_id = await model_loader.load_from_bytes(
                request.model_content,
                request.model_format
            )
        else:
            raise ValueError("Either model_path or model_content must be provided")
        
        model_info = model_loader.get_model_info(model_id)
        
        return LoadModelResponse(
            success=True,
            model_id=model_id,
            model_type=model_info.get("type", "unknown")
        )
        
    except Exception as e:
        logger.error(f"Load model error: {e}")
        return LoadModelResponse(success=False, error=str(e))


@app.get("/models", response_model=ListModelsResponse)
async def list_models():
    """List all loaded models"""
    models = []
    for model_id, info in model_loader.loaded_models.items():
        models.append(ModelInfo(
            id=model_id,
            type=info.get("type", "unknown"),
            format=info.get("format", "unknown"),
            loaded_at=info.get("loaded_at", ""),
            features=info.get("features", []),
            target=info.get("target")
        ))
    
    return ListModelsResponse(success=True, models=models)


@app.delete("/models/{model_id}")
async def unload_model(model_id: str):
    """Unload a model"""
    success = model_loader.unload(model_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found"
        )
    return {"success": True, "message": f"Model {model_id} unloaded"}


@app.post("/models/{model_id}/predict", response_model=PredictResponse)
async def predict(model_id: str, request: PredictRequest):
    """Predict with a specific loaded model"""
    try:
        prediction = await predictor.predict(model_id, request.input)
        return PredictResponse(success=True, prediction=prediction)
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        return PredictResponse(success=False, error=str(e))


@app.get("/supported-types")
async def get_supported_types():
    """Get supported model types and formats"""
    return {
        "success": True,
        "model_types": [
            "sklearn",
            "xgboost",
            "lightgbm",
            "onnx"
        ],
        "formats": ["pickle", "joblib", "onnx", "json"],
        "frameworks": {
            "scikit-learn": "1.3+",
            "xgboost": "2.0+",
            "onnxruntime": "1.16+"
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "50053"))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"Starting ML Engine on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
