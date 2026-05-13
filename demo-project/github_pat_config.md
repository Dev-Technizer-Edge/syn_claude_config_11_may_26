**GitHub → Settings → Developer Settings → Personal Access Tokens**

---

**Step by step:**

**1.** Go to [github.com](https://github.com) → click your **profile photo** (top right) → **Settings**

**2.** Scroll all the way down the left sidebar → click **Developer settings**

**3.** Left sidebar → **Personal access tokens** → **Tokens (classic)**

**4.** Click **Generate new token** → **Generate new token (classic)**

**5.** Fill in:
```
Note      →  my-mcp-server (any name)
Expiration → 90 days / No expiration
```

**6.** Select scopes — for GitHub MCP server:

| Scope | Why |
|---|---|
| ✅ `repo` | Full access to repos (read/write/PR) |
| ✅ `read:org` | Read org and team info |
| ✅ `read:user` | Read user profile |
| ✅ `gist` | If you want gist access |

**7.** Click **Generate token** at the bottom

**8.** **Copy it immediately** — GitHub shows it only once

---

**Then put it in your config:**

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

**Two token types — which to use:**

| | Classic | Fine-grained |
|---|---|---|
| Scope control | Broad | Per repo, per permission |
| MCP compatibility | ✅ Works | ✅ Works |
| Recommended for | Quick setup | Production / team use |

For MCP dev/training use, **classic token** is fine. For production, use **fine-grained** and limit it to only the repos Claude needs access to.