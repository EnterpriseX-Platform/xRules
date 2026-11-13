# xRules MCP server

Lets Claude (Cowork, Desktop, Code) read documents on your machine and create **drafts** in xRules:
business terms, Thai rule sentences, test cases, backtests — and explain any execution from its Rule Trace.
It cannot publish; publishing stays behind tests and review.

```json
{
  "mcpServers": {
    "xrules": {
      "command": "node",
      "args": ["/path/to/XRULES/apps/xrules-mcp/dist/index.js"],
      "env": { "XRULES_URL": "http://localhost:4000", "XRULES_EMAIL": "you@example.com", "XRULES_PASSWORD": "…", "XRULES_PROJECT": "neb-pre-screening" }
    }
  }
}
```

Tools: `list_projects`, `list_vocabulary`, `suggest_terms`, `add_term`, `check_rule_sentence`, `save_rule_draft`,
`add_test_case`, `run_tests`, `backtest`, `bulk_status`, `explain_execution`, `submit_for_review`.
