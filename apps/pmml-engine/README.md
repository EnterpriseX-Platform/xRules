# XRules PMML Engine

R-based statistical model execution engine supporting PMML 4.4 (Predictive Model Markup Language).

## Features

- **PMML 4.4 Support**: Load and execute PMML models
- **Model Types**:
  - Regression Models (Linear, Logistic)
  - Decision Trees
  - Neural Networks
  - General Regression
  - Mining Models
  - Scorecards
- **HTTP API**: RESTful API via Plumber
- **Model Management**: Load, unload, and list models
- **Health Checks**: Built-in health monitoring

## Quick Start

### Using Docker

```bash
# Build and run
docker-compose up -d

# Check health
curl http://localhost:50052/health
```

### Local Development

```bash
# Install dependencies
Rscript -e "install.packages(c('plumber', 'pmml', 'XML', 'jsonlite', 'logger'))"

# Run server
Rscript plumber.R
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/execute` | POST | Execute model scoring |
| `/models` | GET | List loaded models |
| `/models/load` | POST | Load PMML model |
| `/models/{id}` | DELETE | Unload model |
| `/validate` | POST | Validate PMML content |
| `/supported-types` | GET | Get supported model types |

## Example Usage

### Execute Model

```bash
curl -X POST http://localhost:50052/execute \
  -H "Content-Type: application/json" \
  -d '{
    "rule": {
      "id": "loan-approval",
      "definition": {
        "pmml": "<?xml version=\"1.0\"?>..."
      }
    },
    "input": {
      "age": 30,
      "income": 60000,
      "credit_score": 750
    }
  }'
```

### Load Model from File

```bash
curl -X POST http://localhost:50052/models/load \
  -H "Content-Type: application/json" \
  -d '{"model_path": "models/sample_regression.pmml"}'
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | 50052 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `R_ENVIRON` | production | R environment |

## PMML Standards

This engine supports PMML 4.4 as defined by the Data Mining Group (DMG):
- https://dmg.org/pmml/v4-4/GeneralStructure.html

## Integration with XRules Engine Hub

The PMML Engine is designed to work with the XRules Rust Engine Hub:

```rust
// Rust Hub routes PMML rules to this engine
let pmml_engine = PmmlEngine::new("http://localhost:50052");
let result = pmml_engine.execute(rule, input).await?;
```

## License

MIT
