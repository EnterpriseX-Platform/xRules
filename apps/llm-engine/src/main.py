"""
XRules LLM Engine
Large Language Model integration server supporting OpenAI, Anthropic Claude, and Ollama
Port: 50054
"""

import os
import time
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional
from contextlib import asynccontextmanager
from enum import Enum

import httpx
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator

from providers.openai_provider import OpenAIProvider
from providers.anthropic_provider import AnthropicProvider
from providers.ollama_provider import OllamaProvider

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class ProviderType(str, Enum):
    """Supported LLM providers"""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"


# Global state
providers: Dict[ProviderType, Any] = {}
startup_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    logger.info("Starting XRules LLM Engine...")
    
    # Initialize providers
    if os.getenv("OPENAI_API_KEY"):
        providers[ProviderType.OPENAI] = OpenAIProvider()
        logger.info("OpenAI provider initialized")
    
    if os.getenv("ANTHROPIC_API_KEY"):
        providers[ProviderType.ANTHROPIC] = AnthropicProvider()
        logger.info("Anthropic provider initialized")
    
    # Ollama is always available (local)
    providers[ProviderType.OLLAMA] = OllamaProvider()
    logger.info("Ollama provider initialized")
    
    yield
    
    logger.info("Shutting down XRules LLM Engine...")


app = FastAPI(
    title="XRules LLM Engine",
    description="LLM integration engine supporting OpenAI, Claude, and Ollama",
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
    service: str = "llm-engine"
    version: str = "0.1.0"
    available_providers: List[str] = []
    uptime: float = 0.0


class GenerateRequest(BaseModel):
    provider: str = Field(default="openai", description="LLM provider (openai, anthropic, ollama)")
    model: str = Field(default="gpt-3.5-turbo", description="Model name")
    prompt: str = Field(..., description="Input prompt")
    system_message: Optional[str] = Field(default=None, description="System message/context")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1000, ge=1, le=4096)
    stream: bool = Field(default=False, description="Stream response")
    
    @field_validator("provider")
    @classmethod
    def validate_provider(cls, v: str) -> str:
        allowed = ["openai", "anthropic", "ollama"]
        if v.lower() not in allowed:
            raise ValueError(f"Provider must be one of {allowed}")
        return v.lower()


class GenerateResponse(BaseModel):
    success: bool
    text: Optional[str] = None
    tokens_used: Optional[int] = None
    provider: str
    model: str
    duration_ms: float
    error: Optional[str] = None


class ChatMessage(BaseModel):
    role: str = Field(..., description="system, user, or assistant")
    content: str


class ChatRequest(BaseModel):
    provider: str = "openai"
    model: str = "gpt-3.5-turbo"
    messages: List[ChatMessage]
    temperature: float = 0.7
    max_tokens: int = 1000
    stream: bool = False


class ChatResponse(BaseModel):
    success: bool
    message: Optional[ChatMessage] = None
    tokens_used: Optional[int] = None
    error: Optional[str] = None


class EmbeddingsRequest(BaseModel):
    provider: str = "openai"
    model: str = "text-embedding-ada-002"
    texts: List[str]


class EmbeddingsResponse(BaseModel):
    success: bool
    embeddings: Optional[List[List[float]]] = None
    error: Optional[str] = None


# ============ API Endpoints ============

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    available = [p.value for p in providers.keys()]
    return HealthResponse(
        available_providers=available,
        uptime=time.time() - startup_time
    )


@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest):
    """Generate text completion"""
    start_time = time.time()
    
    try:
        provider_type = ProviderType(request.provider)
        
        if provider_type not in providers:
            return GenerateResponse(
                success=False,
                provider=request.provider,
                model=request.model,
                duration_ms=(time.time() - start_time) * 1000,
                error=f"Provider {request.provider} not available. Check API keys."
            )
        
        provider = providers[provider_type]
        
        if request.stream:
            # Return streaming response
            async def stream_generator() -> AsyncGenerator[str, None]:
                async for chunk in provider.generate_stream(
                    model=request.model,
                    prompt=request.prompt,
                    system_message=request.system_message,
                    temperature=request.temperature,
                    max_tokens=request.max_tokens
                ):
                    yield f"data: {chunk}\n\n"
                yield "data: [DONE]\n\n"
            
            return StreamingResponse(
                stream_generator(),
                media_type="text/event-stream"
            )
        
        # Non-streaming response
        result = await provider.generate(
            model=request.model,
            prompt=request.prompt,
            system_message=request.system_message,
            temperature=request.temperature,
            max_tokens=request.max_tokens
        )
        
        duration_ms = (time.time() - start_time) * 1000
        
        return GenerateResponse(
            success=True,
            text=result["text"],
            tokens_used=result.get("tokens_used"),
            provider=request.provider,
            model=request.model,
            duration_ms=duration_ms
        )
        
    except Exception as e:
        logger.error(f"Generation error: {e}")
        return GenerateResponse(
            success=False,
            provider=request.provider,
            model=request.model,
            duration_ms=(time.time() - start_time) * 1000,
            error=str(e)
        )


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat completion with message history"""
    try:
        provider_type = ProviderType(request.provider)
        
        if provider_type not in providers:
            return ChatResponse(
                success=False,
                error=f"Provider {request.provider} not available"
            )
        
        provider = providers[provider_type]
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        
        result = await provider.chat(
            model=request.model,
            messages=messages,
            temperature=request.temperature,
            max_tokens=request.max_tokens
        )
        
        return ChatResponse(
            success=True,
            message=ChatMessage(role="assistant", content=result["text"]),
            tokens_used=result.get("tokens_used")
        )
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return ChatResponse(success=False, error=str(e))


@app.post("/embeddings", response_model=EmbeddingsResponse)
async def create_embeddings(request: EmbeddingsRequest):
    """Create text embeddings"""
    try:
        provider_type = ProviderType(request.provider)
        
        if provider_type not in providers:
            return EmbeddingsResponse(
                success=False,
                error=f"Provider {request.provider} not available"
            )
        
        provider = providers[provider_type]
        embeddings = await provider.create_embeddings(
            model=request.model,
            texts=request.texts
        )
        
        return EmbeddingsResponse(success=True, embeddings=embeddings)
        
    except Exception as e:
        logger.error(f"Embeddings error: {e}")
        return EmbeddingsResponse(success=False, error=str(e))


@app.get("/models")
async def list_models():
    """List available models by provider"""
    available_models = {
        "openai": ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo", "text-embedding-ada-002"],
        "anthropic": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku", "claude-2.1"],
        "ollama": ["llama2", "mistral", "codellama", "neural-chat"]
    }
    
    available_providers = [p.value for p in providers.keys()]
    
    return {
        "success": True,
        "providers": available_providers,
        "models": {k: v for k, v in available_models.items() if k in available_providers}
    }


@app.get("/providers")
async def get_providers():
    """Get available providers and their status"""
    result = {}
    for provider_type, provider in providers.items():
        result[provider_type.value] = {
            "available": True,
            "name": provider.name
        }
    return {"success": True, "providers": result}


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "50054"))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"Starting LLM Engine on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
