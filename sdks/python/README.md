# xrules — Python SDK

Official Python SDK for [XRules](https://github.com/your-org/xrules) — open-source decision management platform.

```bash
pip install xrules
```

## Quick start

```python
from xrules import XRulesClient

client = XRulesClient(
    base_url="https://api.xrules.example",
    api_key="...",
)

result = client.execute("loan-approval", {
    "income": 85000,
    "fico": 720,
    "loan_amount": 250000,
})

print(result["output"])    # {'decision': 'APPROVE', 'tier': 'A'}
print(result["duration"])  # ms
```

## Async usage

```python
import asyncio
from xrules import AsyncXRulesClient

async def main():
    async with AsyncXRulesClient(base_url="...", api_key="...") as client:
        result = await client.execute("loan-approval", {"income": 85000, "fico": 720})
        print(result["output"])

asyncio.run(main())
```

## Pinning version & environment

```python
# Specific version
client.execute("loan-approval", input, version=7)

# Pinned to environment (uses release pinned to that env)
client.execute("loan-approval", input, environment="production")

# Solver headers
client.execute("loan-approval", input, context={"strategy": "best-fit"})
```

## Batch execution

```python
results = client.batch_execute("credit-score", [input1, input2, input3])
```

## Error handling

```python
from xrules import XRulesError

try:
    client.execute("not-a-real-rule", {})
except XRulesError as e:
    print(e.status, e.code, str(e))
```

## License

AGPL-3.0 — see [LICENSE](https://github.com/your-org/xrules/blob/main/LICENSE).
