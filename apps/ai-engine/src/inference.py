"""
Inference Engine
Handles model inference for different frameworks
"""

import logging
from typing import Any, Dict, List, Optional

import numpy as np

from model_manager import ModelManager

logger = logging.getLogger(__name__)


class InferenceEngine:
    """Runs inference with loaded models"""
    
    def __init__(self, model_manager: ModelManager):
        self.model_manager = model_manager
        self.gpu_available = self._check_gpu()
        self.tensorflow_available = self._check_tensorflow()
        self.pytorch_available = self._check_pytorch()
    
    def _check_gpu(self) -> bool:
        """Check if GPU is available"""
        # Check CUDA via onnxruntime
        try:
            import onnxruntime as ort
            providers = ort.get_available_providers()
            if "CUDAExecutionProvider" in providers:
                return True
        except:
            pass
        
        # Check TensorFlow
        try:
            import tensorflow as tf
            if tf.config.list_physical_devices("GPU"):
                return True
        except:
            pass
        
        # Check PyTorch
        try:
            import torch
            if torch.cuda.is_available():
                return True
        except:
            pass
        
        return False
    
    def _check_tensorflow(self) -> bool:
        """Check if TensorFlow is available"""
        try:
            import tensorflow
            return True
        except ImportError:
            return False
    
    def _check_pytorch(self) -> bool:
        """Check if PyTorch is available"""
        try:
            import torch
            return True
        except ImportError:
            return False
    
    async def infer(
        self,
        model_id: str,
        input_data: Dict[str, Any],
        preprocess: bool = True,
        postprocess: bool = True
    ) -> Dict[str, Any]:
        """Run inference with specified model"""
        model_info = self.model_manager.models.get(model_id)
        if not model_info:
            raise ValueError(f"Model {model_id} not found")
        
        framework = model_info["framework"]
        model = model_info["model"]
        device = model_info.get("device", "cpu")
        
        # Preprocess input
        if preprocess:
            input_tensor = self._preprocess(input_data, framework)
        else:
            input_tensor = input_data
        
        # Run inference
        if framework == "onnx":
            result = self._infer_onnx(model, input_tensor)
        elif framework == "tensorflow":
            result = self._infer_tensorflow(model, input_tensor)
        elif framework == "pytorch":
            result = self._infer_pytorch(model, input_tensor, device)
        else:
            raise ValueError(f"Unsupported framework: {framework}")
        
        # Postprocess
        if postprocess:
            result = self._postprocess(result, framework)
        
        result["device"] = device
        result["framework"] = framework
        
        return result
    
    def _preprocess(self, input_data: Dict[str, Any], framework: str) -> np.ndarray:
        """Preprocess input data"""
        # Extract features and convert to numpy array
        features = []
        
        for key, value in sorted(input_data.items()):
            if isinstance(value, (int, float)):
                features.append(float(value))
            elif isinstance(value, list):
                features.extend(value)
            elif isinstance(value, np.ndarray):
                features.extend(value.flatten().tolist())
        
        if not features:
            raise ValueError("No valid input features found")
        
        arr = np.array(features, dtype=np.float32)
        
        # Reshape based on framework
        if framework == "onnx":
            return arr.reshape(1, -1)
        elif framework == "tensorflow":
            return arr.reshape(1, -1)
        elif framework == "pytorch":
            return arr.reshape(1, -1)
        
        return arr
    
    def _infer_onnx(self, session, input_tensor: np.ndarray) -> Dict[str, Any]:
        """Run ONNX inference"""
        input_name = session.get_inputs()[0].name
        outputs = session.run(None, {input_name: input_tensor})
        
        predictions = outputs[0]
        
        return {
            "predictions": predictions.tolist(),
            "raw_output": [o.tolist() for o in outputs]
        }
    
    def _infer_tensorflow(self, model, input_tensor: np.ndarray) -> Dict[str, Any]:
        """Run TensorFlow inference"""
        import tensorflow as tf
        
        predictions = model.predict(input_tensor, verbose=0)
        
        # Handle different output types
        if isinstance(predictions, list):
            predictions = predictions[0]
        
        return {
            "predictions": predictions.tolist()
        }
    
    def _infer_pytorch(
        self, 
        model, 
        input_tensor: np.ndarray, 
        device: str
    ) -> Dict[str, Any]:
        """Run PyTorch inference"""
        import torch
        
        # Convert to torch tensor
        tensor = torch.from_numpy(input_tensor)
        
        if device == "cuda":
            tensor = tensor.cuda()
            model = model.cuda()
        
        # Run inference
        with torch.no_grad():
            if isinstance(model, torch.nn.Module):
                output = model(tensor)
            else:
                # Handle other model types
                output = model
        
        # Convert back to numpy
        if isinstance(output, torch.Tensor):
            predictions = output.cpu().numpy()
        else:
            predictions = np.array(output)
        
        return {
            "predictions": predictions.tolist()
        }
    
    def _postprocess(
        self, 
        result: Dict[str, Any], 
        framework: str
    ) -> Dict[str, Any]:
        """Postprocess inference results"""
        predictions = result.get("predictions", [])
        
        # Add probabilities for classification
        if isinstance(predictions, list) and len(predictions) > 0:
            pred_array = np.array(predictions)
            
            # If output looks like probabilities (sums to ~1)
            if pred_array.ndim > 1 and pred_array.shape[1] > 1:
                # Multi-class classification
                class_probs = pred_array[0]
                result["class_probabilities"] = {
                    f"class_{i}": float(p) 
                    for i, p in enumerate(class_probs)
                }
                result["predicted_class"] = int(np.argmax(class_probs))
            elif pred_array.ndim == 1 and len(pred_array) > 1:
                # Single prediction with multiple outputs
                result["predicted_class"] = int(np.argmax(pred_array))
        
        return result
