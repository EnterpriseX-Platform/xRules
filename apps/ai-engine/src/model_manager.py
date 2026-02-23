"""
Model Manager
Handles loading and caching deep learning models
"""

import hashlib
import logging
import os
from datetime import datetime
from typing import Any, Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)


class ModelManager:
    """Manages deep learning models"""
    
    def __init__(self):
        self.models: Dict[str, Dict[str, Any]] = {}
        self._loaders = {
            "onnx": self._load_onnx,
            "tensorflow": self._load_tensorflow,
            "pytorch": self._load_pytorch
        }
    
    async def load_model(
        self, 
        model_path: str, 
        framework: str = "onnx",
        model_name: Optional[str] = None
    ) -> str:
        """Load a model from file path"""
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")
        
        # Generate model ID from path
        model_id = hashlib.md5(model_path.encode()).hexdigest()[:12]
        
        # Check if already loaded
        if model_id in self.models:
            logger.info(f"Model {model_id} already loaded")
            return model_id
        
        # Load based on framework
        loader = self._loaders.get(framework)
        if not loader:
            raise ValueError(f"Unsupported framework: {framework}")
        
        model, metadata = loader(model_path)
        
        # Detect device
        device = self._detect_device(framework)
        
        # Store model
        self.models[model_id] = {
            "model": model,
            "framework": framework,
            "name": model_name or os.path.basename(model_path),
            "path": model_path,
            "loaded_at": datetime.utcnow().isoformat(),
            "device": device,
            "input_shape": metadata.get("input_shape"),
            "output_shape": metadata.get("output_shape")
        }
        
        logger.info(f"Loaded {framework} model: {model_id}")
        return model_id
    
    def _load_onnx(self, model_path: str):
        """Load ONNX model"""
        import onnxruntime as ort
        
        # Configure providers (GPU if available)
        providers = ort.get_available_providers()
        session = ort.InferenceSession(model_path, providers=providers)
        
        # Get input/output info
        input_shape = session.get_inputs()[0].shape
        output_shape = session.get_outputs()[0].shape
        
        metadata = {
            "input_shape": input_shape,
            "output_shape": output_shape
        }
        
        return session, metadata
    
    def _load_tensorflow(self, model_path: str):
        """Load TensorFlow model"""
        try:
            import tensorflow as tf
            
            # Check if it's a SavedModel directory or .h5 file
            if os.path.isdir(model_path):
                model = tf.keras.models.load_model(model_path)
            else:
                model = tf.keras.models.load_model(model_path)
            
            # Get input shape
            input_shape = model.input_shape
            output_shape = model.output_shape
            
            metadata = {
                "input_shape": list(input_shape) if input_shape else None,
                "output_shape": list(output_shape) if output_shape else None
            }
            
            return model, metadata
            
        except ImportError:
            raise ImportError("TensorFlow not installed. Install with: pip install tensorflow")
    
    def _load_pytorch(self, model_path: str):
        """Load PyTorch model"""
        try:
            import torch
            
            # Load model
            model = torch.load(model_path, map_location="cpu")
            
            # Handle different model types
            if isinstance(model, torch.nn.Module):
                model.eval()
            
            metadata = {
                "input_shape": None,  # Would need model-specific handling
                "output_shape": None
            }
            
            return model, metadata
            
        except ImportError:
            raise ImportError("PyTorch not installed. Install with: pip install torch")
    
    def _detect_device(self, framework: str) -> str:
        """Detect available device (CPU/GPU)"""
        if framework == "tensorflow":
            try:
                import tensorflow as tf
                gpus = tf.config.list_physical_devices("GPU")
                return "gpu" if gpus else "cpu"
            except:
                return "cpu"
        
        elif framework == "pytorch":
            try:
                import torch
                return "cuda" if torch.cuda.is_available() else "cpu"
            except:
                return "cpu"
        
        elif framework == "onnx":
            import onnxruntime as ort
            providers = ort.get_available_providers()
            return "gpu" if "CUDAExecutionProvider" in providers else "cpu"
        
        return "cpu"
    
    def get_model(self, model_id: str) -> Any:
        """Get loaded model by ID"""
        if model_id not in self.models:
            raise ValueError(f"Model {model_id} not found")
        return self.models[model_id]["model"]
    
    def get_model_info(self, model_id: str) -> Dict[str, Any]:
        """Get model metadata"""
        if model_id not in self.models:
            raise ValueError(f"Model {model_id} not found")
        info = self.models[model_id].copy()
        info.pop("model")  # Remove actual model
        return info
    
    def unload(self, model_id: str) -> bool:
        """Unload a model"""
        if model_id in self.models:
            del self.models[model_id]
            logger.info(f"Unloaded model: {model_id}")
            return True
        return False
