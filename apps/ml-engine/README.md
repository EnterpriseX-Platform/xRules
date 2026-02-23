# XRules ML Engine

Python-based machine learning model execution engine supporting scikit-learn, XGBoost, and ONNX.

## Features

- **Multiple Frameworks**: scikit-learn, XGBoost, LightGBM, ONNX
- **Model Formats**: Pickle, Joblib, ONNX
- **Model Types**: Classification, Regression, Clustering
- **HTTP API**: FastAPI with automatic OpenAPI docs
- **Model Management**: Load, unload, and list models
- **Health Checks**: Built-in health monitoring

## Quick Start

### Using Docker

```bash
# Build and run
docker-compose up -d

# Check health
curl http://localhost:50053/health
```

### Local Development

```bash
# Install dependencies
pip install -e "."

# Run server
python -m uvicorn src.main:app --host 0.0.0.0 --port 50053 --reload
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/execute` | POST | Execute model prediction |
| `/models` | GET | List loaded models |
| `/models/load` | POST | Load model |
| `/models/{id}` | DELETE | Unload model |
| `/models/{id}/predict` | POST | Predict with model |
| `/supported-types` | GET | Get supported types |

## Example Usage

### Execute Model

```bash
curl -X POST http://localhost:50053/execute \
  -H "Content-Type: application/json" \
  -d '{
    "rule": {
      "id": "risk-scoring",
      "definition": {
        "model_path": "models/risk_model.joblib"
      }
    },
    "input": {
      "age": 30,
      "income": 60000,
      "credit_score": 750
    }
  }'
```

### Load Model

```bash
curl -X POST http://localhost:50053/models/load \
  -H "Content-Type: application/json" \
  -d '{"model_path": "models/my_model.joblib"}'
```

## Supported Model Formats

| Format | Extension | Description |
|--------|-----------|-------------|
| Joblib | `.joblib` | Scikit-learn recommended format |
| Pickle | `.pkl`, `.pickle` | Python pickle format |
| ONNX | `.onnx` | Open Neural Network Exchange |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | 50053 | Server port |
| `HOST` | 0.0.0.0 | Server host |

## Integration with XRules Engine Hub

The ML Engine connects to the Rust Engine Hub via HTTP:

```rust
// Rust Hub routes ML rules to this engine
let ml_engine = MlEngine::new("http://localhost:50053");
let result = ml_engine.execute(rule, input).await?;
```

## License

MIT
