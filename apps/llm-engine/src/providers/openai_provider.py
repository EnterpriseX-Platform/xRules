"""
OpenAI Provider
Handles OpenAI API integration
"""

import os
from typing import Any, AsyncGenerator, Dict, List, Optional

import openai
from openai import AsyncOpenAI


class OpenAIProvider:
    """OpenAI API provider"""
    
    name = "OpenAI"
    
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY not set")
        
        self.client = AsyncOpenAI(api_key=api_key)
        self.default_model = "gpt-3.5-turbo"
    
    async def generate(
        self,
        model: str,
        prompt: str,
        system_message: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000
    ) -> Dict[str, Any]:
        """Generate text completion"""
        messages = []
        
        if system_message:
            messages.append({"role": "system", "content": system_message})
        
        messages.append({"role": "user", "content": prompt})
        
        response = await self.client.chat.completions.create(
            model=model or self.default_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        return {
            "text": response.choices[0].message.content,
            "tokens_used": response.usage.total_tokens if response.usage else None,
            "finish_reason": response.choices[0].finish_reason
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
        messages = []
        
        if system_message:
            messages.append({"role": "system", "content": system_message})
        
        messages.append({"role": "user", "content": prompt})
        
        stream = await self.client.chat.completions.create(
            model=model or self.default_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True
        )
        
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    
    async def chat(
        self,
        model: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1000
    ) -> Dict[str, Any]:
        """Chat completion with message history"""
        response = await self.client.chat.completions.create(
            model=model or self.default_model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens
        )
        
        return {
            "text": response.choices[0].message.content,
            "tokens_used": response.usage.total_tokens if response.usage else None
        }
    
    async def create_embeddings(
        self,
        model: str,
        texts: List[str]
    ) -> List[List[float]]:
        """Create text embeddings"""
        response = await self.client.embeddings.create(
            model=model or "text-embedding-ada-002",
            input=texts
        )
        
        return [item.embedding for item in response.data]
