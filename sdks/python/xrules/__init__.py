"""Official Python SDK for XRules.

Usage:

    from xrules import XRulesClient

    client = XRulesClient(base_url="http://localhost:4000", api_key="...")
    result = client.execute("loan-approval", {"income": 85000, "fico": 720})
    print(result["output"])

Async usage:

    import asyncio
    from xrules import AsyncXRulesClient

    async def main():
        async with AsyncXRulesClient(base_url="http://localhost:4000", api_key="...") as client:
            r = await client.execute("loan-approval", {"income": 85000, "fico": 720})
            print(r["output"])

    asyncio.run(main())
"""
from .client import (
    XRulesClient,
    AsyncXRulesClient,
    XRulesError,
    ExecuteResult,
)

__all__ = [
    "XRulesClient",
    "AsyncXRulesClient",
    "XRulesError",
    "ExecuteResult",
]
__version__ = "0.1.0"
