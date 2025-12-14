# Woo Happy Studio - Fork Management Strategy

## Overview

This document outlines the strategy for maintaining a fork of the original Studio application with custom WooCommerce and MySQL support features, while keeping the fork in sync with upstream updates.

## Repository Structure

### Remotes
- **`origin`** - Your fork (`nicdwilson/studio`)
- **`upstream`** - Original repository (`Automattic/studio`)

### Branch Strategy
- **`trunk`** - Kept in sync with upstream for easy merging
- **`woo-happy-studio-stable`** - Stable releases with custom features
- **`woo-happy-studio`** - Development branch for new custom features

## Version Naming Convention

### Format
```
{upstream-version}-woo-mysql
```

### Examples
- `1.5.5-woo-mysql` - Based on upstream v1.5.5
- `1.6.0-woo-mysql` - Based on upstream v1.6.0

### Rationale
- Clearly indicates the base upstream version
- Distinguishes from upstream releases
- Makes it easy to track which upstream version the fork is based on

## Custom Features

### WooCommerce Support
- Enhanced site creation with WooCommerce pre-installation
- WooCommerce-specific configurations and optimizations
- Custom blueprints for WooCommerce development environments

### MySQL Support
- MySQL database integration for local development
- MySQL-specific site creation workflows
- Enhanced database management capabilities

## Release Process

### 1. Initial Setup (One-time)
```bash
# Clone your fork
git clone https://github.com/nicdwilson/studio.git
cd studio

# Add upstream remote
git remote add upstream https://github.com/Automattic/studio.git

# Create stable branch for custom features
git checkout -b woo-happy-studio-stable
```

### 2. Regular Release Workflow

#### Step 1: Sync with Upstream
```bash
# Fetch latest upstream changes
git fetch upstream

# Switch to trunk and merge upstream
git checkout trunk
git merge upstream/trunk
git push origin trunk
```

#### Step 2: Update Stable Branch
```bash
# Switch to stable branch
git checkout woo-happy-studio-stable

# Merge trunk (upstream changes)
git merge trunk

# Resolve any conflicts if they occur
# (Custom features should be isolated enough to avoid conflicts)
```

#### Step 3: Update Version and Product Name
```bash
# Edit package.json
# Update version to: {upstream-version}-woo-mysql
# Update productName to: "Woo Happy Studio"

# Example for v1.5.5:
# "version": "1.5.5-woo-mysql"
# "productName": "Woo Happy Studio"
```

#### Step 4: Build and Package
```bash
# Install dependencies (if needed)
npm install

# Build the application
npm run make

# Create universal DMG (if needed)
npm run make:dmg-universal
```

#### Step 5: Create Release
```bash
# Commit version changes
git add package.json package-lock.json
git commit -m "feat: Update version to {version}-woo-mysql"

# Create and push tag
git tag v{version}-woo-mysql
git push origin woo-happy-studio-stable
git push origin v{version}-woo-mysql
```

#### Step 6: Create GitHub Release
1. Go to your fork: https://github.com/nicdwilson/studio
2. Click "Releases" in the right sidebar
3. Click "Create a new release"
4. Select the `v{version}-woo-mysql` tag
5. Add release title: "Woo Happy Studio v{version}-woo-mysql"
6. Add release notes highlighting:
   - Base upstream version
   - Custom features (WooCommerce, MySQL)
   - Any additional customizations
7. Upload the generated artifacts:
   - `out/make/Woo Happy Studio-{version}-woo-mysql-arm64.dmg`
   - `out/make/zip/darwin/arm64/Woo Happy Studio-darwin-arm64-{version}-woo-mysql.zip`

## Development Workflow

### Adding New Custom Features
```bash
# Create feature branch from stable
git checkout woo-happy-studio-stable
git checkout -b feature/new-custom-feature

# Make your changes
# Test thoroughly

# Merge back to stable
git checkout woo-happy-studio-stable
git merge feature/new-custom-feature
git push origin woo-happy-studio-stable
```

### Updating Custom Features
```bash
# Work directly on stable branch or create feature branch
git checkout woo-happy-studio-stable

# Make updates to custom features
# Test changes

# Commit and push
git add .
git commit -m "feat: Update custom feature X"
git push origin woo-happy-studio-stable
```

## Conflict Resolution

### Common Scenarios

#### 1. Upstream Changes to Files You've Modified
- Usually occurs in shared configuration files
- Resolve conflicts manually, keeping your customizations
- Test thoroughly after resolution

#### 2. Upstream Adds New Features You Want
- Merge upstream changes into your stable branch
- Adapt new features to work with your customizations
- Update documentation if needed

#### 3. Upstream Removes Features You Depend On
- Consider if you can maintain the feature in your fork
- Update your custom features to work without the removed feature
- Document the change for future reference

### Best Practices
- Keep custom features isolated in separate modules when possible
- Use feature flags or configuration to enable/disable custom features
- Document any upstream dependencies your custom features have
- Test thoroughly after each upstream merge

## Distribution Strategy

### Target Audience
- Select users who need WooCommerce development capabilities
- Users requiring MySQL database integration
- Internal development teams

### Distribution Methods
1. **GitHub Releases** - Primary distribution method
2. **Private Distribution** - Direct sharing with select users
3. **Internal Repositories** - If using private package repositories

### Security Considerations
- Keep custom features separate from upstream
- Don't expose sensitive configuration in public repositories
- Use environment variables for any API keys or secrets
- Regularly update dependencies for security patches

## Maintenance Tasks

### Regular Maintenance
- **Weekly**: Check for upstream updates
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Review and update custom features
- **On Upstream Release**: Create new fork release

### Dependency Management
```bash
# Update npm dependencies
npm update

# Check for security vulnerabilities
npm audit

# Update specific packages if needed
npm install package-name@latest
```

### Documentation Updates
- Keep this strategy document updated
- Update README.md with custom features
- Maintain changelog for custom features
- Document any breaking changes

## Troubleshooting

### Common Issues

#### Build Failures
1. Check if upstream dependencies changed
2. Verify custom features are compatible with new upstream version
3. Update custom code if needed
4. Test build process step by step

#### Merge Conflicts
1. Identify conflicting files
2. Resolve conflicts manually
3. Test functionality after resolution
4. Commit resolved conflicts

#### Package Issues
1. Clear node_modules and reinstall
2. Check for version conflicts
3. Update to compatible versions
4. Test thoroughly

### Getting Help
- Check upstream issues for similar problems
- Review custom feature documentation
- Test with clean upstream build first
- Document solutions for future reference

## Future Considerations

### Long-term Strategy
- Maintain compatibility with upstream as long as possible
- Consider contributing useful features back to upstream if appropriate
- Plan for potential upstream changes that might affect custom features
- Keep custom features modular for easier maintenance

### Scaling Considerations
- If user base grows, consider automated release processes
- Implement CI/CD for automated testing and building
- Consider creating a separate package for custom features
- Plan for potential upstream feature conflicts

---

## Quick Reference Commands

### Sync with Upstream
```bash
git fetch upstream
git checkout trunk
git merge upstream/trunk
git push origin trunk
```

### Create New Release
```bash
git checkout woo-happy-studio-stable
git merge trunk
# Update version in package.json
npm run make
git tag v{version}-woo-mysql
git push origin woo-happy-studio-stable
git push origin v{version}-woo-mysql
```

### Check Current Status
```bash
git status
git log --oneline -5
git tag -l | grep woo-mysql
```

This strategy ensures you can maintain your custom features while staying current with upstream improvements and security updates. 