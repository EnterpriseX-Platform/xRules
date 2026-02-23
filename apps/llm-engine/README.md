# XRules LLM Engine

Large Language Model integration engine supporting OpenAI, Anthropic Claude, and Ollama.

## Features

- **Multiple Providers**: OpenAI GPT, Anthropic Claude, Ollama (local)
- **Streaming Support**: Real-time text generation
- **Chat API**: Multi-turn conversations
- **Embeddings**: Text vectorization
- **HTTP API**: FastAPI with automatic OpenAPI docs
- **Model Management**: List available models per provider

## Quick Start

### Using Docker

```bash
# Set API keys (optional)
export OPENAI_API_KEY=your_key
export ANTHROPIC_API_KEY=your_key

# Build and run
docker-compose up -d

# Check health
curl http://localhost:50054/health
```

### Local Development

```bash
# Install dependencies
pip install -e ".[anthropic]"

# Set environment variables
export OPENAI_API_KEY=your_key
export ANTHROPIC_API_KEY=your_key

# Run server
python -m uvicorn src.main:app --host 0.0.0.0 --port 50054 --reload
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/generate` | POST | Text generation |
| `/chat` | POST | Chat completion |
| `/embeddings` | POST | Create embeddings |
| `/models` | GET | List available models |
| `/providers` | GET | Get provider status |

## Example Usage

### Generate Text

```bash
curl -X POST http://localhost:50054/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-3.5-turbo",
    "prompt": "Explain machine learning in one sentence",
    "temperature": 0.7,
    "max_tokens": 100
  }'
```

### Chat Completion

```bash
curl -X POST http://localhost:50054/chat \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "model": "claude-3-sonnet",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### Streaming Response

```bash
curl -X POST http://localhost:50054/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-4",
    "prompt": "Tell me a story",
    "stream": true
  }'
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | 50054 | Server port |
| `HOST` | 0.0.0.0 | Server host |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |
| `OLLAMA_URL` | http://localhost:11434 | Ollama endpoint |

## Supported Models

### OpenAI
- gpt-4, gpt-4-turbo
- gpt-3.5-turbo
- text-embedding-ada-002

### Anthropic
- claude-3-opus, claude-3-sonnet, claude-3-haiku
- claude-2.1

### Ollama (Local)
- llama2, mistral, codellama
- Any model pulled to local Ollama

## License

MIT
