"""
Anthropic Provider
Handles Claude API integration
"""

import os
from typing import Any, AsyncGenerator, Dict, List, Optional


class AnthropicProvider:
    """Anthropic Claude API provider"""
    
    name = "Anthropic Claude"
    
    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")
        
        try:
            import anthropic
            self.client = anthropic.AsyncAnthropic(api_key=api_key)
        except ImportError:
            raise ImportError("anthropic package not installed. Install with: pip install anthropic")
        
        self.default_model = "claude-3-sonnet-20240229"
    
    async def generate(
        self,
        model: str,
        prompt: str,
        system_message: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000
    ) -> Dict[str, Any]:
        """Generate text completion"""
        messages = [{"role": "user", "content": prompt}]
        
        kwargs = {
            "model": model or self.default_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        
        if system_message:
            kwargs["system"] = system_message
        
        response = await self.client.messages.create(**kwargs)
        
        return {
            "text": response.content[0].text,
            "tokens_used": response.usage.input_tokens + response.usage.output_tokens if response.usage else None,
            "stop_reason": response.stop_reason
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
        messages = [{"role": "user", "content": prompt}]
        
        kwargs = {
            "model": model or self.default_model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": True
        }
        
        if system_message:
            kwargs["system"] = system_message
        
        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
    
    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1000
    ) -> Dict[str, Any]:
        """Chat completion with message history"""
        # Convert messages to Claude format
        claude_messages = []
        for msg in messages:
            if msg["role"] != "system":
                claude_messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        response = await self.client.messages.create(
            model=model or self.default_model,
            messages=claude_messages,
            max_tokens=max_tokens,
            temperature=temperature
        )
        
        return {
            "text": response.content[0].text,
            "tokens_used": response.usage.input_tokens + response.usage.output_tokens if response.usage else None
        }
    
    async def create_embeddings(
        self,
        model: str,
        texts: List[str]
    ) -> List[List[float]]:
        """Create text embeddings (not directly supported by Claude)"""
        raise NotImplementedError("Embeddings not supported by Anthropic provider")
