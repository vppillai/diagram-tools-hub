# GitHub Actions for Diagram Tools Hub

This repository includes comprehensive GitHub Actions workflows for CI/CD, security scanning, and release management.

## 🚀 Available Workflows

### 1. CI/CD Pipeline (`ci-cd.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main`
- Release publication

**Features:**
- ✅ Build and test TLDraw application
- ✅ Validate Docker Compose configuration
- ✅ Security scanning with Trivy
- ✅ Build and push Docker images to GitHub Container Registry
- ✅ Automatic release notes generation
- ✅ Staging and production deployment hooks

### 2. Release Management (`release.yml`)

**Manual trigger** with customizable inputs:
- Version number (e.g., 1.0.0)
- Release type (patch, minor, major)
- Prerelease flag

**Features:**
- ✅ Automated changelog generation
- ✅ Release notes with Docker image references
- ✅ Quick start instructions
- ✅ Feature highlights

### 3. Dependabot Automation (`dependabot.yml`)

**Triggers:**
- Dependabot pull requests

**Features:**
- ✅ Auto-approve dependency updates
- ✅ Enable auto-merge for security patches
- ✅ Automated testing
- ✅ PR comments with status

### 4. Security Scanning (`security.yml`)

**Triggers:**
- Weekly scheduled scans (Mondays at 2 AM)
- Push to main branch
- Pull requests

**Features:**
- ✅ Trivy vulnerability scanning
- ✅ Snyk security analysis
- ✅ OWASP ZAP web application scanning
- ✅ Secret detection with TruffleHog
- ✅ Bandit Python security linting
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
- Trigger Docker image builds
- Update release notes with Docker image references

### Automatic Workflows

Most workflows run automatically:

- **CI/CD**: Runs on every push and PR
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

Images are automatically built and pushed to:
- `ghcr.io/vppillai/diagram-tools-hub/tldraw:latest`
- `ghcr.io/vppillai/diagram-tools-hub/engine:latest`
- Tagged versions: `ghcr.io/vppillai/diagram-tools-hub/tldraw:v1.0.0`

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