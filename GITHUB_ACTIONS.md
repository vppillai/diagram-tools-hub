# GitHub Actions for Diagram Tools Hub

This repository includes comprehensive GitHub Actions workflows for CI/CD, security scanning, and release management.

## 🚀 Available Workflows

### 1. CI/CD Pipeline (`ci-cd.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main`

**Features:**
- ✅ Build and test TLDraw and Whiteboard applications (matrix; submodules: recursive)
- ✅ Validate Docker Compose configuration
- ✅ Security scanning with Trivy
- ✅ Staging and production deployment hooks

### 2. Release Management (`release.yml`)

**Manual trigger** with customizable inputs:
- Version number (e.g., 1.0.0)
- Release type (patch, minor, major)
- Prerelease flag

**Features:**
- ✅ Automated changelog generation
- ✅ Build and push Docker images to GitHub Container Registry
- ✅ Release notes with Docker image references
- ✅ Quick start instructions
- ✅ Feature highlights

### 3. tldraw Parity & Lint (`tldraw-parity.yml`)

**Triggers:**
- Push to `main`
- Pull requests to `main`

**Jobs:**
- **parity** — the tldraw frontend and sync backend must run the exact same tldraw version:
  - ✅ `@tldraw/tldraw`, `@tldraw/sync` (frontend `package.json`) and `@tldraw/sync-core` (backend `package.json` and `package-lock.json`) are exact pins with identical versions
  - ✅ The `@tldraw/sync-core` the frontend actually resolves equals the backend's
  - ✅ `vite build` of the frontend
  - ✅ Real round-trip: starts `server.js`, connects a `TLSyncClient` from the frontend's `node_modules` (`tldraw/tests/sync-parity.mjs`), writes a page and waits until it is persisted in `.rooms/<room>`; fails on sync errors, timeout (20 s) or any error in the server log
- **lint**:
  - ✅ actionlint on all workflows
  - ✅ `shellcheck -S warning` on `manage-config.sh` and `install-service.sh`
  - ✅ `nginx -t` of the rendered http and https configs (via `manage-config.sh generate-nginx-config`, which validates in a throwaway `nginx:alpine` container)

Run the round-trip locally: `cd tldraw-sync-backend && npm ci && PORT=3901 node server.js`, then `cd tldraw && npm install && node tests/sync-parity.mjs`.

### 4. Dependabot (`.github/dependabot.yml`)

Weekly updates for npm (`/tldraw` and `/tldraw-sync-backend` in one entry), GitHub Actions and the Node base images. `tldraw` and `@tldraw/*` are grouped so frontend and backend bump in the same PR (the parity job rejects a one-sided bump). Node major base-image bumps are ignored; minor/patch still arrive.

### 5. Dependabot Automation

**Triggers:**
- Dependabot pull requests

**Features:**
- ✅ Auto-approve dependency updates
- ✅ Enable auto-merge for security patches
- ✅ Automated testing
- ✅ PR comments with status

### 6. Security Scanning (`security.yml`)

**Triggers:**
- Weekly scheduled scans (Mondays at 2 AM)
- Push to main branch
- Pull requests

**Features:**
- ✅ Trivy vulnerability scanning
- ✅ Snyk security analysis
- ✅ OWASP ZAP web application scanning
- ✅ Secret detection with TruffleHog
- ✅ Automated PR comments with findings

## 📋 How to Use

### Creating a Release

1. **Go to Actions tab** in your GitHub repository
2. **Select "Release Management"** workflow
3. **Click "Run workflow"**
4. **Fill in the details:**
   - Version: `1.0.0` (or your desired version)
   - Release type: `patch`, `minor`, or `major`
   - Prerelease: Check if this is a beta/alpha release
5. **Click "Run workflow"**

The workflow will:
- Generate a changelog from recent commits
- Create a GitHub release with detailed notes
- Build and push Docker images automatically
- Update release notes with Docker image references

### Automatic Workflows

Most workflows run automatically:

- **CI/CD**: Runs on every push and PR
- **tldraw parity & lint**: Runs on pushes to `main` and every PR
- **Security**: Runs weekly and on PRs
- **Dependabot**: Automatically handles dependency updates

### Manual Triggers

You can manually trigger workflows:

```bash
# Using GitHub CLI
gh workflow run ci-cd.yml
gh workflow run release.yml --field version=1.0.0 --field release_type=minor
```

## 🔧 Configuration

### Environment Variables

The workflows use these secrets (if needed):

- `SNYK_TOKEN`: For Snyk security scanning (optional)
- `GITHUB_TOKEN`: Automatically provided by GitHub

### Docker Images

Per-service images are built and pushed to GHCR on each tagged release.
The namespace uses `-` as a separator (not `/`); there is no `engine`
image — the hub's reverse proxy is the upstream `nginx:alpine`.

- `ghcr.io/vppillai/diagram-tools-hub-tldraw:latest`
- `ghcr.io/vppillai/diagram-tools-hub-tldraw:vX.Y.Z`
- `ghcr.io/vppillai/diagram-tools-hub-whiteboard:latest`
- `ghcr.io/vppillai/diagram-tools-hub-whiteboard:vX.Y.Z`

### Branch Protection

Recommended branch protection rules:

1. **Require status checks** to pass before merging
2. **Require pull request reviews**
3. **Require up-to-date branches**
4. **Include administrators**

## 📊 Monitoring

### Workflow Status

- Check the **Actions** tab for workflow status
- View logs for detailed information
- Set up notifications for failed workflows

### Security Alerts

- **Security tab** shows vulnerability scan results
- **Dependabot alerts** for dependency vulnerabilities
- **Code scanning** results from Trivy

### Release Tracking

- **Releases page** shows all published releases
- **Docker images** are automatically tagged
- **Changelog** is generated from commits

## 🛠️ Customization

### Adding Custom Steps

Edit the workflow files to add:
- Custom testing steps
- Deployment to your servers
- Notification systems
- Custom security checks

### Environment-Specific Deployments

Modify the deployment jobs to:
- Deploy to staging on `develop` branch
- Deploy to production on releases
- Add environment-specific configurations

### Security Enhancements

Add additional security tools:
- CodeQL analysis
- Container image signing
- SBOM generation
- Compliance scanning

## 🚨 Troubleshooting

### Common Issues

1. **Workflow fails on Docker build**
   - Check Dockerfile syntax
   - Verify build context
   - Check for missing files

2. **Security scan fails**
   - Review vulnerability reports
   - Update dependencies
   - Fix security issues

3. **Release creation fails**
   - Check version format
   - Verify GitHub token permissions
   - Review release notes generation

### Getting Help

- Check workflow logs for detailed error messages
- Review GitHub Actions documentation
- Check security tab for vulnerability details
- Review Dependabot alerts for dependency issues

## 📈 Best Practices

1. **Regular Releases**: Create releases regularly for better tracking
2. **Security Updates**: Review and merge security updates promptly
3. **Testing**: Ensure all workflows pass before merging
4. **Documentation**: Keep this documentation updated
5. **Monitoring**: Set up alerts for failed workflows

---

For more information, see the [GitHub Actions documentation](https://docs.github.com/en/actions). 