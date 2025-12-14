# MySQL Support Module

A modular implementation of MySQL database support for WordPress Studio, designed for easy integration into the main WordPress Studio release.

## Architecture Overview

The MySQL support module is fully modularized with clear separation of concerns:

```
src/modules/mysql-support/
├── components/           # React UI components
├── hooks/               # React hooks for state management
├── lib/                 # Core business logic
├── types/               # TypeScript type definitions
└── index.tsx           # Main module exports
```

## Module Structure

### Components (`/components/`)
- **`MySQLCheckbox`** - Checkbox for enabling MySQL in site creation form
- **`DatabaseTypeDisplay`** - Shows database type in site details
- **`MySQLCredentials`** - Form for managing MySQL connection settings

### Hooks (`/hooks/`)
- **`useMySQLState`** - Manages MySQL state in add site form

### Library (`/lib/`)
- **`database-operations.ts`** - MySQL database CRUD operations
- **`wp-config-manager.ts`** - WordPress configuration file management
- **`site-manager.ts`** - High-level site setup and cleanup operations

### Types (`/types/`)
- **`MySQLCredentials`** - Database connection credentials
- **`MySQLConnectionTestResult`** - Connection test results
- **`MySQLDatabaseConfig`** - Database configuration
- **`MySQLSiteConfig`** - Site-specific MySQL configuration

## Integration Points

### Frontend Integration
The module integrates with existing Studio components:

1. **Site Form** - `MySQLCheckbox` added to advanced settings
2. **Site Details** - `DatabaseTypeDisplay` shows database type
3. **Settings Tab** - `MySQLCredentials` component for configuration

### Backend Integration
The module provides functions that integrate with existing IPC handlers:

1. **Site Creation** - `setupMySQLSite()` called from `createSite` handler
2. **Site Deletion** - `dropMySQLDatabaseIfExists()` called from `deleteSite` handler
3. **Credential Management** - IPC methods for saving/loading credentials

## Usage Examples

### Using the Module in Components
```tsx
import { MySQLCheckbox, useMySQLState } from 'src/modules/mysql-support';

function MyComponent() {
  const { useMySQL, setUseMySQL } = useMySQLState();
  
  return (
    <MySQLCheckbox 
      checked={useMySQL} 
      onChange={setUseMySQL} 
    />
  );
}
```

### Using Database Operations
```tsx
import { createMySQLDatabase, testMySQLConnection } from 'src/modules/mysql-support';

// Test connection
const result = await testMySQLConnection(credentials);

// Create database
await createMySQLDatabase(credentials, 'my_database');
```

### Using Site Management
```tsx
import { setupMySQLSite, dropMySQLDatabaseIfExists } from 'src/modules/mysql-support';

// Setup MySQL site
await setupMySQLSite('/path/to/site', 'My Site', 'site-id');

// Cleanup on deletion
await dropMySQLDatabaseIfExists('/path/to/site');
```

## Dependencies

### Required Dependencies
- `mysql2` - MySQL client library (dynamically imported)
- `fs-extra` - File system operations
- `@wordpress/components` - UI components
- `@wordpress/i18n` - Internationalization

### Optional Dependencies
- None - all dependencies are either core Studio dependencies or dynamically imported

## Configuration

### MySQL Credentials Storage
Credentials are stored in the user data under `mysqlCredentials`:
```typescript
interface UserData {
  // ... other fields
  mysqlCredentials?: {
    host: string;
    port: string;
    username: string;
    password: string;
  };
}
```

### Database Naming Convention
Databases are automatically named using the pattern:
```
wp_{sanitized_site_name}_{timestamp}
```

Example: `wp_my_wordpress_site_1752907160097`

## Error Handling

The module implements comprehensive error handling:

1. **Graceful Degradation** - Database operations don't block site creation/deletion
2. **Detailed Logging** - All operations are logged with `[MySQL]` prefix
3. **User Feedback** - Errors are displayed via Studio's notification system
4. **Connection Testing** - Credentials can be tested before use

## Testing

### Manual Testing Checklist
- [ ] MySQL credentials can be saved and loaded
- [ ] Connection test works with valid credentials
- [ ] MySQL sites are created with proper database
- [ ] wp-config.php is correctly updated
- [ ] SQLite integration files are removed
- [ ] Server restarts properly after MySQL setup
- [ ] MySQL databases are dropped on site deletion
- [ ] SQLite sites work normally (no interference)

### Integration Testing
The module is designed to be non-intrusive:
- SQLite sites continue to work unchanged
- MySQL features are opt-in via checkbox
- No breaking changes to existing functionality

## Migration to WordPress Studio

### Files to Include
1. Entire `src/modules/mysql-support/` directory
2. Updated `src/storage/storage-types.ts` (add `mysqlCredentials` field)
3. Updated IPC handlers (integrate MySQL functions)
4. Updated preload.ts (add MySQL IPC methods)
5. Updated component imports (add MySQL components)

### Integration Steps
1. Copy the module directory to WordPress Studio
2. Update storage types to include MySQL credentials
3. Integrate MySQL functions into existing IPC handlers
4. Add MySQL components to existing UI components
5. Update package.json to include `mysql2` dependency
6. Test all functionality end-to-end

### Backward Compatibility
- All existing functionality remains unchanged
- MySQL features are opt-in only
- No breaking changes to existing APIs
- Graceful fallback if MySQL is not configured

## Future Enhancements

### Potential Improvements
1. **Database Management UI** - View/manage created databases
2. **Connection Pooling** - Optimize database connections
3. **Backup Integration** - MySQL-specific backup strategies
4. **Performance Monitoring** - Database performance metrics
5. **Multi-Database Support** - Support for multiple MySQL servers

### Extension Points
The modular architecture makes it easy to extend:
- Add new database operations in `database-operations.ts`
- Add new UI components in `components/`
- Add new configuration options in `types/`
- Add new site management features in `site-manager.ts` 