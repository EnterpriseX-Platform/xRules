"""
Model Loader Module
Handles loading and caching ML models from various formats
"""

import os
import io
import hashlib
import logging
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

import joblib
import onnxruntime as ort
from sklearn.base import BaseEstimator

try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False

logger = logging.getLogger(__name__)


class ModelType(Enum):
    """Supported model types"""
    SKLEARN = "sklearn"
    XGBOOST = "xgboost"
    ONNX = "onnx"
    LIGHTGBM = "lightgbm"
    UNKNOWN = "unknown"


class ModelFormat(Enum):
    """Supported model formats"""
    PICKLE = "pickle"
    JOBLIB = "joblib"
    ONNX = "onnx"
    JSON = "json"


class ModelLoader:
    """Loads and manages ML models"""
    
    def __init__(self):
        self.loaded_models: Dict[str, Dict[str, Any]] = {}
    
    async def load_from_file(self, file_path: str, format_hint: str = "auto") -> str:
        """Load model from file path"""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Model file not found: {file_path}")
        
        with open(file_path, "rb") as f:
            content = f.read()
        
        return await self.load_from_bytes(content, format_hint, file_path)
    
    async def load_from_bytes(
        self, 
        content: bytes, 
        format_hint: str = "auto",
        source: Optional[str] = None
    ) -> str:
        """Load model from bytes"""
        # Generate model ID from content hash
        model_id = hashlib.md5(content).hexdigest()[:12]
        
        # Check if already loaded
        if model_id in self.loaded_models:
            logger.info(f"Model {model_id} already loaded, returning cached")
            return model_id
        
        # Detect format
        model_format = self._detect_format(content, format_hint)
        
        # Load based on format
        if model_format == ModelFormat.ONNX:
            model = self._load_onnx(content)
            model_type = ModelType.ONNX
        elif model_format == ModelFormat.JOBLIB:
            model = self._load_joblib(content)
            model_type = self._detect_model_type(model)
        elif model_format == ModelFormat.PICKLE:
            model = self._load_pickle(content)
            model_type = self._detect_model_type(model)
        else:
            raise ValueError(f"Unsupported model format: {model_format}")
        
        # Store model
        self.loaded_models[model_id] = {
            "model": model,
            "type": model_type.value,
            "format": model_format.value,
            "loaded_at": datetime.utcnow().isoformat(),
            "source": source or "bytes",
            "features": [],  # Extract from model if possible
            "target": None
        }
        
        logger.info(f"Loaded model {model_id} (type: {model_type.value}, format: {model_format.value})")
        return model_id
    
    def _detect_format(self, content: bytes, hint: str) -> ModelFormat:
        """Detect model format from content"""
        if hint != "auto":
            return ModelFormat(hint.lower())
        
        # Check ONNX magic number
        if content.startswith(b"ONNX") or content[:4] == b"\x08\x00\x00\x00":
            return ModelFormat.ONNX
        
        # Check for joblib signature
        if b"joblib" in content[:100]:
            return ModelFormat.JOBLIB
        
        # Default to pickle
        return ModelFormat.PICKLE
    
    def _load_onnx(self, content: bytes) -> ort.InferenceSession:
        """Load ONNX model"""
        try:
            # Create session with default providers
            providers = ort.get_available_providers()
            session = ort.InferenceSession(content, providers=providers)
            return session
        except Exception as e:
            logger.error(f"Failed to load ONNX model: {e}")
            raise
    
    def _load_joblib(self, content: bytes) -> Any:
        """Load joblib model"""
        try:
            buffer = io.BytesIO(content)
            model = joblib.load(buffer)
            return model
        except Exception as e:
            logger.error(f"Failed to load joblib model: {e}")
            raise
    
    def _load_pickle(self, content: bytes) -> Any:
        """Load pickle model"""
        try:
            import pickle
            buffer = io.BytesIO(content)
            model = pickle.load(buffer)
            return model
        except Exception as e:
            logger.error(f"Failed to load pickle model: {e}")
            raise
    
    def _detect_model_type(self, model: Any) -> ModelType:
        """Detect model type from loaded object"""
        # Check sklearn
        if isinstance(model, BaseEstimator):
            return ModelType.SKLEARN
        
        # Check XGBoost
        if XGBOOST_AVAILABLE:
            if isinstance(model, (xgb.XGBClassifier, xgb.XGBRegressor, 
                                  xgb.XGBModel, xgb.Booster)):
                return ModelType.XGBOOST
        
        # Check ONNX session
        if isinstance(model, ort.InferenceSession):
            return ModelType.ONNX
        
        # Check by module name
        module = type(model).__module__
        if "sklearn" in module:
            return ModelType.SKLEARN
        elif "xgboost" in module:
            return ModelType.XGBOOST
        elif "lightgbm" in module:
            return ModelType.LIGHTGBM
        
        return ModelType.UNKNOWN
    
    def get_model(self, model_id: str) -> Any:
        """Get loaded model by ID"""
        if model_id not in self.loaded_models:
            raise ValueError(f"Model {model_id} not found")
        return self.loaded_models[model_id]["model"]
    
    def get_model_info(self, model_id: str) -> Dict[str, Any]:
        """Get model metadata"""
        if model_id not in self.loaded_models:
            raise ValueError(f"Model {model_id} not found")
        info = self.loaded_models[model_id].copy()
        info.pop("model")  # Remove actual model from info
        return info
    
    def unload(self, model_id: str) -> bool:
        """Unload a model"""
        if model_id in self.loaded_models:
            del self.loaded_models[model_id]
            logger.info(f"Unloaded model {model_id}")
            return True
        return False
    
    def get_model_type(self, model_id: str) -> Optional[ModelType]:
        """Get model type enum"""
        if model_id not in self.loaded_models:
            return None
        type_str = self.loaded_models[model_id]["type"]
        try:
            return ModelType(type_str)
        except ValueError:
            return ModelType.UNKNOWN
