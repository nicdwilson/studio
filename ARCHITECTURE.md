# Woo-Happy-Studio Architecture Documentation

## Overview

Woo-Happy-Studio is a modular extension of WordPress.com Studio that adds WooCommerce and MySQL support capabilities. This document outlines the architecture, module structure, and integration patterns used in the project.

## Architecture Principles

- **Modular Design**: Features are organized into self-contained modules
- **Feature Flags**: Easy enable/disable of functionality
- **Clean Separation**: Clear boundaries between different feature areas
- **Maintainability**: Easy to port to new Studio releases
- **Scalability**: Simple to add new features

## Module Structure

```
src/modules/
├── woocommerce/           # WooCommerce functionality
│   ├── components/         # WooCommerce UI components
│   │   ├── wizard-hat-overview.tsx
│   │   ├── wizard-hat-shop-config.tsx
│   │   ├── wizard-hat-plugin-management.tsx
│   │   ├── wizard-hat-tools.tsx
│   │   ├── wizard-hat-import-blueprint.tsx
│   │   └── repository-setup.tsx
│   └── index.tsx          # Main module entry point
├── mysql-support/          # MySQL functionality
│   ├── components/         # MySQL UI components
│   │   └── mysql-credentials.tsx
│   ├── hooks/             # MySQL-related hooks
│   ├── lib/               # MySQL utilities
│   ├── types/             # MySQL type definitions
│   └── index.tsx          # Main module entry point
└── [other core modules]   # Studio core functionality
```

## Module Integration

### Main Integration Point

The primary integration point is `src/components/site-content-tabs.tsx`, which:

1. Imports modules conditionally based on feature flags
2. Renders modules in appropriate tabs
3. Handles module lifecycle and state management

```typescript
import { WizardHatToolkit } from 'src/modules/woocommerce';
import { MySQLSupport } from 'src/modules/mysql-support';

// In the render method:
{ name === 'wizard-hat-toolkit' && <WizardHatToolkit /> }
{ name === 'mysql-credentials' && <MySQLSupport /> }
```

### Feature Flags

Feature flags are managed in `src/lib/feature-flags.ts`:

```typescript
export const FEATURE_FLAGS = {
  WOOCOMMERCE_ENABLED: true,
  MYSQL_ENABLED: true,
} as const;
```

## WooCommerce Module

### Purpose
Provides comprehensive WooCommerce toolkit functionality including:
- Shop configuration and switching
- Plugin management
- Import/export tools
- Development utilities

### Structure
- **Tab-based UI**: Multiple tabs for different WooCommerce features
- **Context Provider**: Manages tab state and navigation
- **Component Library**: Reusable WooCommerce-specific components

### Key Components
- `WizardHatToolkit`: Main container component
- `WizardHatOverview`: Dashboard and overview
- `WizardHatShopConfig`: Shop configuration interface
- `WizardHatPluginManagement`: Plugin management tools
- `WizardHatTools`: Development and utility tools
- `WizardHatImportBlueprint`: Import/export functionality
- `RepositorySetup`: Modal for configuring local all-plugins repository path

## MySQL Support Module

### Purpose
Provides MySQL database configuration and management capabilities:
- Database credentials management
- Connection testing
- Configuration persistence

### Structure
- **Single Page Interface**: Focused on MySQL configuration
- **Form-based UI**: Clean, simple interface for database setup
- **Validation**: Input validation and error handling

### Key Components
- `MySQLSupport`: Main container component
- `MySQLCredentials`: Database configuration form
- Custom hooks for MySQL operations
- Type definitions for MySQL data structures

## Development Workflow

### Adding New Features

1. **Create Module Structure**:
   ```
   src/modules/new-feature/
   ├── components/
   ├── hooks/
   ├── lib/
   ├── types/
   └── index.tsx
   ```

2. **Export Main Component**:
   ```typescript
   // src/modules/new-feature/index.tsx
   export function NewFeature() {
     // Component implementation
   }
   ```

3. **Add Feature Flag**:
   ```typescript
   // src/lib/feature-flags.ts
   export const FEATURE_FLAGS = {
     NEW_FEATURE_ENABLED: true,
   } as const;
   ```

4. **Integrate in UI**:
   ```typescript
   // src/components/site-content-tabs.tsx
   import { NewFeature } from 'src/modules/new-feature';
   
   // Add to tab rendering
   { name === 'new-feature' && <NewFeature /> }
   ```

### Module Best Practices

1. **Self-Contained**: Each module should be independent
2. **Clear Exports**: Export only what's needed externally
3. **Type Safety**: Use TypeScript for all new code
4. **Consistent Structure**: Follow established patterns
5. **Documentation**: Document complex logic and APIs

## Integration with Studio

### Tab Integration
Modules are integrated through the Studio tab system:
- Tabs are defined in `src/hooks/use-content-tabs.ts`
- Module components are rendered in `site-content-tabs.tsx`
- Tab state is managed by Studio's tab system

### State Management
- **Local State**: Use React hooks for component-specific state
- **Global State**: Use Studio's existing state management patterns
- **Persistence**: Use Studio's storage mechanisms

### Styling
- **Tailwind CSS**: Use Studio's Tailwind configuration
- **WordPress Components**: Leverage `@wordpress/components` for UI
- **Consistent Design**: Follow Studio's design patterns

## Migration Strategy

### From Old Architecture
The project successfully migrated from:
- `src/modules/wizard-hat-toolkit/` → `src/modules/woocommerce/`
- `src/modules/mysql-credentials/` → `src/modules/mysql-support/`

### Benefits Achieved
- **Cleaner Structure**: Better organization and separation
- **Easier Maintenance**: Modular design simplifies updates
- **Better Scalability**: Easy to add new features
- **Improved Portability**: Easier to port to new Studio releases

## Testing

### Module Testing
- Each module should have its own test suite
- Test components in isolation
- Mock dependencies appropriately
- Test integration points

### Integration Testing
- Test module integration with Studio
- Verify tab functionality
- Test feature flag behavior
- Validate state management

## Deployment

### Build Process
- Modules are bundled with the main application
- Feature flags control module inclusion
- No separate deployment needed

### Release Process
- Follow Studio's release process
- Update feature flags as needed
- Test module functionality in release builds

## Future Considerations

### Planned Enhancements
- Additional WooCommerce features
- Enhanced MySQL management
- Performance optimizations
- Additional module types

### Scalability
- Support for more module types
- Dynamic module loading
- Plugin architecture
- External module support

## Contributing

### Development Setup
1. Follow Studio's development setup
2. Understand the modular architecture
3. Use established patterns
4. Test thoroughly

### Code Standards
- Follow Studio's coding standards
- Use TypeScript for all new code
- Write comprehensive tests
- Document complex logic

### Module Development
- Keep modules self-contained
- Follow established patterns
- Use feature flags for new features
- Test integration points

---

*This documentation should be updated as the architecture evolves.* 