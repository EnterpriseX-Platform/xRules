# XRules AI Engine

Deep Learning model execution engine supporting TensorFlow, PyTorch, and ONNX.

## Features

- **Multiple Frameworks**: TensorFlow, PyTorch, ONNX Runtime
- **Model Formats**: SavedModel, TorchScript, ONNX
- **GPU Support**: CUDA acceleration (optional)
- **HTTP API**: FastAPI with automatic OpenAPI docs
- **Model Upload**: Upload models via API
- **Health Checks**: Built-in health monitoring

## Quick Start

### Using Docker

```bash
# Build and run
docker-compose up -d

# Check health
curl http://localhost:50055/health
```

### Local Development

```bash
# Install dependencies (CPU version)
pip install -e "."

# Or with TensorFlow
pip install -e ".[tensorflow]"

# Or with PyTorch
pip install -e ".[torch]"

# Run server
python -m uvicorn src.main:app --host 0.0.0.0 --port 50055 --reload
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/execute` | POST | Execute model inference |
| `/models` | GET | List loaded models |
| `/models/load` | POST | Load model from path |
| `/models/upload` | POST | Upload model file |
| `/models/{id}` | DELETE | Unload model |
| `/inference` | POST | Run inference |
| `/supported-frameworks` | GET | Get framework status |

## Example Usage

### Execute Model

```bash
curl -X POST http://localhost:50055/execute \
  -H "Content-Type: application/json" \
  -d '{
    "rule": {
      "id": "image-classifier",
      "definition": {
        "model_path": "models/resnet50.onnx",
        "framework": "onnx"
      }
    },
    "input": {
      "pixel_values": [0.5, 0.3, 0.8, ...]
    }
  }'
```

### Upload Model

```bash
curl -X POST http://localhost:50055/models/upload \
  -F "file=@/path/to/model.onnx" \
  -F "framework=onnx" \
  -F "model_name=my_model"
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | 50055 | Server port |
| `HOST` | 0.0.0.0 | Server host |

## GPU Support

### TensorFlow GPU

```bash
pip install tensorflow[and-cuda]
```

### PyTorch GPU

```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

### Docker GPU

Uncomment the `deploy` section in `docker-compose.yml` for nvidia-docker support.

## Integration with XRules Engine Hub

The AI Engine connects to the Rust Engine Hub:

```rust
let ai_engine = AiEngine::new("http://localhost:50055");
let result = ai_engine.execute(rule, input).await?;
```

## License

MIT
