# Integration Guide: Woo Happy Studio 1.6.7

This document describes the process of integrating WooCommerce and MySQL features from `v1.5.5-woo-mysql` into Studio `1.6.7-beta1` to create `woo-happy-studio-1.6.7`.

## Overview

The goal was to combine the latest Wizard Hat Toolkit changes (WooCommerce and MySQL features) with the latest Studio version (1.6.7-beta1) to create a new release branch.

## Starting Points

- **Base Studio Version**: `1.6.7-beta1` tag
- **Custom Features Source**: `v1.5.5-woo-mysql` tag
- **Target Branch**: `woo-happy-studio-1.6.7`

## Integration Strategy

### Phase 1: Establish Clean Baseline

1. **Create branch from Studio tag**:
   ```bash
   git checkout -b woo-happy-studio-1.6.7 1.6.7-beta1
   ```

2. **Verify baseline works**:
   ```bash
   npm start
   ```
   - Confirmed: Clean 1.6.7-beta1 runs successfully

### Phase 2: Add Custom Files Only

**Critical Rule**: Do NOT modify core Studio files during initial merge. Only bring in additional files.

1. **Extract additional files from v1.5.5-woo-mysql**:
   - `src/modules/woocommerce/` directory (renamed from `woo-commerce`)
   - `src/modules/mysql-support/` directory
   - Any other new files that don't exist in 1.6.7-beta1

2. **Directory rename**:
   - Renamed `woo-commerce` → `woocommerce` for consistency

3. **Commit additional files**:
   ```bash
   git add src/modules/woocommerce/ src/modules/mysql-support/
   git commit -m "Add WooCommerce and MySQL support modules"
   ```

### Phase 3: Integration Points

After adding the additional files, we needed to integrate them into the Studio architecture:

#### 3.1 Content Tabs Integration

**File**: `src/components/site-content-tabs.tsx`

- Added import: `import { WizardHatToolkit } from 'src/modules/woocommerce';`
- Added render condition: `{ name === 'wizard-hat-toolkit' && <WizardHatToolkit /> }`

#### 3.2 Tab Definition

**File**: `src/hooks/use-content-tabs.tsx`

- Added `'wizard-hat-toolkit'` to the `TabName` type
- Added tab definition:
  ```typescript
  {
    name: 'wizard-hat-toolkit',
    order: 7,
    title: __( 'Wizard Hat Toolkit' ),
  }
  ```

#### 3.3 IPC Handlers

**File**: `src/ipc-handlers.ts`

**New handlers added**:
- `validateRepositoryPath` - Validates local repository path
- `saveRepositoryPath` - Saves repository path to user data
- `getRepositoryPath` - Retrieves saved repository path
- `installPluginFromLocalRepo` - Installs plugin from local repository
- `getAvailablePluginsFromRepository` - Lists available plugins from repository

**Key changes**:
- Fixed `getAppGlobals` signature to include `_event: IpcMainInvokeEvent` parameter
- Updated `installPluginFromLocalRepo` to use `server.executeWpCliCommand()` directly instead of calling `executeWPCLiInline()` (to avoid circular dependencies)
- Fixed syntax error in `validateRepositoryPath` (extra closing brace)

#### 3.4 Preload Script

**File**: `src/preload.ts`

- Added IPC API exposures for all new repository path handlers
- Added validation to check for null/undefined handlers before exposing

#### 3.5 Storage Types

**File**: `src/storage/storage-types.ts`

- Added `allPluginsRepositoryPath?: string;` to `UserData` interface

#### 3.6 CLI Handlers Fix

**File**: `src/modules/cli/lib/ipc-handlers.ts`

- Added `IpcMainInvokeEvent` parameter to:
  - `isStudioCliInstalled`
  - `installStudioCli`
  - `uninstallStudioCli`

**File**: `src/ipc-handlers.ts`

- Changed from wrapper functions to direct re-export to avoid module loading issues

## Critical Issues and Fixes

### Issue 1: Blank Screen / App Hang

**Symptom**: App starts but shows blank black screen, no UI renders.

**Root Cause**: `getAppGlobals` IPC handler missing required `_event: IpcMainInvokeEvent` parameter.

**Fix**: Updated function signature:
```typescript
// Before
export function getAppGlobals(): AppGlobals

// After
export function getAppGlobals(_event: IpcMainInvokeEvent): AppGlobals
```

**Lesson**: All IPC handlers must accept `IpcMainInvokeEvent` as the first parameter, even if unused.

### Issue 2: Syntax Error in validateRepositoryPath

**Symptom**: "object null is not iterable" error in renderer.

**Root Cause**: Extra closing brace in try-catch block:
```typescript
// Wrong
return { ... };
} catch ( error ) {  // Extra brace here

// Correct
return { ... };
} catch ( error ) {
```

**Fix**: Removed extra closing brace.

### Issue 3: React Hooks Violation

**Symptom**: "Rendered more hooks than during the previous render" error.

**Root Cause**: Early return before hooks in `RepositorySetup` component:
```typescript
// Wrong
if ( ! isOpen ) {
  return null;  // Hooks called after this
}
useIpcListener(...);

// Correct
useIpcListener(...);  // Hooks first
if ( ! isOpen ) {
  return null;
}
```

**Fix**: Moved all hooks before conditional returns.

### Issue 4: WP-CLI Usage Pattern

**Symptom**: Potential circular dependency when calling `executeWPCLiInline` from within `ipc-handlers.ts`.

**Root Cause**: Calling an IPC handler from within the same module can cause module loading issues.

**Fix**: Use `server.executeWpCliCommand()` directly:
```typescript
// Instead of
const result = await executeWPCLiInline(_event, { siteId, args });

// Use
const server = SiteServer.get(siteId);
const result = await server.executeWpCliCommand(args);
```

**Lesson**: When calling WP-CLI from within IPC handlers, use `SiteServer.executeWpCliCommand()` directly rather than the IPC handler wrapper.

### Issue 5: CLI Handler Signatures

**Symptom**: Module loading failures.

**Root Cause**: CLI handlers (`isStudioCliInstalled`, `installStudioCli`, `uninstallStudioCli`) didn't have `IpcMainInvokeEvent` parameter.

**Fix**: Added parameter directly to the source functions in `src/modules/cli/lib/ipc-handlers.ts` rather than wrapping them.

## Key Architectural Changes

### Repository Path Management

**Old Approach** (v1.5.5):
- Used GitHub token for private repository access
- Required token validation and management

**New Approach** (v1.6.7):
- Uses local repository path (e.g., `/Users/username/all-plugins`)
- Path stored in user data (`allPluginsRepositoryPath`)
- Validates path contains `product-packages` directory
- No GitHub token required

### IPC Handler Pattern

All IPC handlers must follow this pattern:
```typescript
export async function handlerName(
  _event: IpcMainInvokeEvent,
  ...otherParams
): Promise<ReturnType> {
  // Implementation
}
```

### Module Structure

```
src/modules/
├── woocommerce/           # WooCommerce functionality
│   ├── components/
│   │   ├── wizard-hat-overview.tsx
│   │   ├── wizard-hat-shop-config.tsx
│   │   ├── wizard-hat-plugin-management.tsx
│   │   ├── wizard-hat-tools.tsx
│   │   ├── wizard-hat-import-blueprint.tsx
│   │   ├── wizard-hat-jurassic-tube.tsx
│   │   └── repository-setup.tsx
│   └── index.tsx
├── mysql-support/         # MySQL functionality
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   └── index.tsx
└── [other core modules]
```

## Testing Checklist

After integration, verify:

- [ ] App starts without blank screen
- [ ] All tabs render correctly
- [ ] Wizard Hat Toolkit tab appears and functions
- [ ] Repository setup modal works
- [ ] Plugin installation from local repo works
- [ ] WP-CLI commands execute correctly
- [ ] No React Hooks violations
- [ ] No console errors in renderer
- [ ] IPC handlers all registered correctly

## Steps for Future Integration (v1.6.7 Final)

When Studio v1.6.7 final is released:

1. **Create new branch from final tag**:
   ```bash
   git checkout -b woo-happy-studio-1.6.7-final 1.6.7
   ```

2. **Cherry-pick or merge integration commits**:
   - Use this guide to re-apply the integration steps
   - Or cherry-pick commits from `woo-happy-studio-1.6.7` branch

3. **Verify all fixes are applied**:
   - Check `getAppGlobals` signature
   - Verify CLI handlers have `IpcMainInvokeEvent` parameter
   - Check for syntax errors in new handlers
   - Ensure hooks are called before conditional returns

4. **Test thoroughly**:
   - Run through the testing checklist above
   - Test all WooCommerce features
   - Test plugin installation workflow
   - Verify repository path management

5. **Update version numbers**:
   - Update `package.json` version to `1.6.7-woo-mysql`
   - Update product name if needed

## Important Notes

### Do NOT Modify Core Files During Initial Merge

When bringing in custom features, only add new files. Integration points (imports, tab definitions, etc.) should be added in separate commits after the files are in place.

### Always Test Baseline First

Before adding custom code, verify the clean Studio version works. This helps isolate issues.

### Watch for Breaking Changes

Studio's architecture may change between versions. Key areas to watch:
- IPC handler patterns
- WP-CLI execution methods
- Component structure
- Hook usage patterns

### Module Loading Issues

If you encounter "object null is not iterable" or similar module loading errors:
1. Check for syntax errors in new handlers
2. Verify all handlers have correct signatures
3. Check for circular dependencies
4. Ensure all exports are valid functions

## Files Modified/Created

### New Files
- `src/modules/woocommerce/` (entire directory)
- `src/modules/mysql-support/` (entire directory)

### Modified Files
- `src/components/site-content-tabs.tsx` - Added WizardHatToolkit import and render
- `src/hooks/use-content-tabs.tsx` - Added wizard-hat-toolkit tab definition
- `src/ipc-handlers.ts` - Added repository path handlers, fixed getAppGlobals
- `src/preload.ts` - Added IPC API exposures for new handlers
- `src/storage/storage-types.ts` - Added allPluginsRepositoryPath field
- `src/modules/cli/lib/ipc-handlers.ts` - Added IpcMainInvokeEvent parameter
- `src/index.ts` - Added defensive checks in setupIpc

## Version Information

- **Studio Base**: 1.6.7-beta1
- **Custom Features From**: v1.5.5-woo-mysql
- **Integration Date**: 2024-12-14
- **Status**: Working

---

**Last Updated**: 2024-12-14

