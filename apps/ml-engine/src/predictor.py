"""
Predictor Module
Handles model inference for different model types
"""

import logging
from typing import Any, Dict, List, Optional, Union

import numpy as np
import onnxruntime as ort
from sklearn.base import BaseEstimator

from model_loader import ModelLoader, ModelType

logger = logging.getLogger(__name__)


class Predictor:
    """Makes predictions with loaded models"""
    
    def __init__(self, model_loader: Optional[ModelLoader] = None):
        self.model_loader = model_loader or ModelLoader()
    
    async def predict(
        self, 
        model_id: str, 
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Make prediction with specified model"""
        model = self.model_loader.get_model(model_id)
        model_type = self.model_loader.get_model_type(model_id)
        
        if model_type is None:
            raise ValueError(f"Unknown model type for {model_id}")
        
        # Route to appropriate predictor
        if model_type == ModelType.ONNX:
            return self._predict_onnx(model, input_data)
        elif model_type == ModelType.SKLEARN:
            return self._predict_sklearn(model, input_data)
        elif model_type == ModelType.XGBOOST:
            return self._predict_xgboost(model, input_data)
        elif model_type == ModelType.LIGHTGBM:
            return self._predict_lightgbm(model, input_data)
        else:
            raise ValueError(f"Unsupported model type: {model_type}")
    
    def _predict_onnx(
        self, 
        session: ort.InferenceSession, 
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Predict with ONNX model"""
        # Get input info
        input_name = session.get_inputs()[0].name
        input_shape = session.get_inputs()[0].shape
        
        # Convert input to numpy array
        features = self._extract_features(input_data)
        input_array = np.array([features], dtype=np.float32)
        
        # Run inference
        outputs = session.run(None, {input_name: input_array})
        
        # Format output
        prediction = outputs[0]
        
        return {
            "prediction": self._format_prediction(prediction),
            "model_type": "onnx",
            "input_features": len(features)
        }
    
    def _predict_sklearn(
        self, 
        model: BaseEstimator, 
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Predict with scikit-learn model"""
        # Extract features
        features = self._extract_features(input_data)
        X = np.array([features])
        
        # Make prediction
        prediction = model.predict(X)
        
        result = {
            "prediction": self._format_prediction(prediction),
            "model_type": "sklearn",
            "input_features": len(features)
        }
        
        # Add probabilities if available
        if hasattr(model, "predict_proba"):
            try:
                proba = model.predict_proba(X)
                if proba.shape[1] == 2:
                    # Binary classification
                    result["probability"] = float(proba[0, 1])
                else:
                    # Multi-class
                    result["probabilities"] = proba[0].tolist()
            except Exception as e:
                logger.warning(f"Could not get probabilities: {e}")
        
        return result
    
    def _predict_xgboost(
        self, 
        model: Any, 
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Predict with XGBoost model"""
        import xgboost as xgb
        
        # Extract features
        features = self._extract_features(input_data)
        X = np.array([features])
        
        # Handle different XGBoost model types
        if isinstance(model, xgb.Booster):
            # DMatrix format
            dmatrix = xgb.DMatrix(X)
            prediction = model.predict(dmatrix)
        else:
            # sklearn API
            prediction = model.predict(X)
        
        result = {
            "prediction": self._format_prediction(prediction),
            "model_type": "xgboost",
            "input_features": len(features)
        }
        
        return result
    
    def _predict_lightgbm(
        self, 
        model: Any, 
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Predict with LightGBM model"""
        # Extract features
        features = self._extract_features(input_data)
        X = np.array([features])
        
        # Make prediction
        prediction = model.predict(X)
        
        return {
            "prediction": self._format_prediction(prediction),
            "model_type": "lightgbm",
            "input_features": len(features)
        }
    
    def _extract_features(self, input_data: Dict[str, Any]) -> List[float]:
        """Extract numeric features from input dict"""
        features = []
        
        for key, value in sorted(input_data.items()):
            if isinstance(value, (int, float)):
                features.append(float(value))
            elif isinstance(value, bool):
                features.append(1.0 if value else 0.0)
            else:
                # Skip non-numeric features or encode them
                logger.warning(f"Skipping non-numeric feature: {key}={value}")
        
        if not features:
            raise ValueError("No numeric features found in input data")
        
        return features
    
    def _format_prediction(self, prediction: Any) -> Union[float, int, str, List]:
        """Format prediction for JSON serialization"""
        if isinstance(prediction, np.ndarray):
            if prediction.shape == (1,) or prediction.shape == ():
                return float(prediction.item())
            else:
                return prediction.flatten().tolist()
        elif isinstance(prediction, (np.integer, np.floating)):
            return float(prediction)
        else:
            return prediction
