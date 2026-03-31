---
name: release
description: "Bump version, build, commit, push, and tag a new release of celavii-m365. Publishes to npm via GitHub Actions."
---

# Release Workflow

Use this when ready to publish a new version of celavii-m365.

## Steps

### 1. Determine Version Bump

- **Patch** (0.4.0 → 0.4.1): Bug fixes, minor tweaks
- **Minor** (0.4.0 → 0.5.0): New tools, new features, skill updates
- **Major** (0.4.0 → 1.0.0): Breaking changes (renamed tools, removed tools, changed schemas)

### 2. Update Version

Update version in **two places**:
- `mcp/package.json` — the `"version"` field
- `mcp/src/tools/auth.ts` — the version string in `m365_about` tool response

### 3. Build

```bash
cd mcp && npm run build
```

Verify build succeeds with no errors.

### 4. Commit and Push

```bash
git add mcp/package.json mcp/src/tools/auth.ts
git commit -m "Bump version to X.Y.Z"
git push
```

### 5. Tag and Push Tag

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

The GitHub Action (`.github/workflows/`) will automatically publish to npm when a new tag is pushed.

### 6. Verify

```bash
npm view celavii-m365 version
```

Wait 1-2 minutes for npm to update, then verify the new version is published.

### 7. Restart Server (if running)

If the HTTP server is running for Cowork:

```bash
kill $(lsof -ti :3333) 2>/dev/null
M365_CLIENT_ID=... M365_CLIENT_SECRET=... M365_TENANT_ID=... \
M365_ALLOWED_HOSTS=mcp.celavii.com \
node mcp/dist/remote/index.js &
```

Then in Claude Desktop: disconnect and reconnect the connector, start a new chat.

## Checklist

- [ ] Version bumped in `package.json` and `auth.ts`
- [ ] `npm run build` succeeds
- [ ] Changes committed and pushed
- [ ] Git tag created and pushed
- [ ] npm publish confirmed (via GitHub Action or `npm view`)
- [ ] Server restarted (if applicable)
