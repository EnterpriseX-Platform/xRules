"""
Ollama Provider
Handles local Ollama API integration
"""

import os
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx


class OllamaProvider:
    """Ollama local LLM provider"""
    
    name = "Ollama"
    
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=60.0)
        self.default_model = "llama2"
    
    async def generate(
        self,
        model: str,
        prompt: str,
        system_message: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000
    ) -> Dict[str, Any]:
        """Generate text completion"""
        payload = {
            "model": model or self.default_model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        
        if system_message:
            payload["system"] = system_message
        
        response = await self.client.post("/api/generate", json=payload)
        response.raise_for_status()
        
        result = response.json()
        
        return {
            "text": result.get("response", ""),
            "tokens_used": result.get("eval_count"),
            "done": result.get("done", True)
        }
    
    async def generate_stream(
        self,
        model: str,
        prompt: str,
        system_message: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000
    ) -> AsyncGenerator[str, None]:
        """Generate streaming text completion"""
        payload = {
            "model": model or self.default_model,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        
        if system_message:
            payload["system"] = system_message
        
        async with self.client.stream("POST", "/api/generate", json=payload) as response:
            async for line in response.aiter_lines():
                if line:
                    import json
                    try:
                        data = json.loads(line)
                        if "response" in data:
                            yield data["response"]
                    except json.JSONDecodeError:
                        continue
    
    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1000
    ) -> Dict[str, Any]:
        """Chat completion with message history"""
        payload = {
            "model": model or self.default_model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        
        response = await self.client.post("/api/chat", json=payload)
        response.raise_for_status()
        
        result = response.json()
        
        return {
            "text": result.get("message", {}).get("content", ""),
            "tokens_used": result.get("eval_count")
        }
    
    async def create_embeddings(
        self,
        model: str,
        texts: List[str]
    ) -> List[List[float]]:
        """Create text embeddings"""
        embeddings = []
        
        for text in texts:
            payload = {
                "model": model or "llama2",
                "prompt": text
            }
            
            response = await self.client.post("/api/embeddings", json=payload)
            response.raise_for_status()
            
            result = response.json()
            embeddings.append(result.get("embedding", []))
        
        return embeddings
    
    async def list_models(self) -> List[str]:
        """List available local models"""
        try:
            response = await self.client.get("/api/tags")
            response.raise_for_status()
            
            result = response.json()
            return [m["name"] for m in result.get("models", [])]
        except Exception:
            return ["llama2", "mistral", "codellama"]
