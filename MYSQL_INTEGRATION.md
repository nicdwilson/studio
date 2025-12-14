# MySQL Integration for Woo-Happy-Studio

This document describes the MySQL integration feature that allows users to create WordPress sites with MySQL databases instead of SQLite.

## Overview

The MySQL integration consists of two main features:
1. **Database Type Display**: Shows whether a site uses MySQL or SQLite in the settings page
2. **MySQL Site Creation**: Allows users to create new sites with MySQL databases

## Architecture

The integration follows the modular architecture pattern established in the project:

### Module Structure
```
src/modules/mysql-support/
├── components/
│   ├── mysql-credentials.tsx      # MySQL credentials configuration
│   ├── database-type-display.tsx  # Shows database type in settings
│   └── mysql-checkbox.tsx         # MySQL checkbox for add site form
├── index.tsx                      # Main module exports
└── README.md                      # Module documentation
```

### Integration Points

#### 1. Settings Page Integration
- **File**: `src/components/content-tab-settings.tsx`
- **Component**: `DatabaseTypeDisplay`
- **Location**: Added as a new row in the site details table
- **Functionality**: Detects and displays whether a site uses MySQL or SQLite

#### 2. Add Site Form Integration
- **File**: `src/components/site-form.tsx`
- **Component**: `MySQLCheckbox`
- **Location**: Added to the advanced settings section
- **Functionality**: Allows users to choose MySQL when creating a new site

#### 3. Backend Integration
- **File**: `src/ipc-handlers.ts`
- **Functions**: 
  - `setupMySQLSite()` - Main MySQL site setup logic
  - `createMySQLDatabase()` - Database creation (placeholder)
  - `updateWpConfigForMySQL()` - Updates wp-config.php
  - `removeSqliteIntegration()` - Removes SQLite files
  - `hasMySQLConfiguration()` - Detects MySQL configuration

## How It Works

### 1. MySQL Site Creation Process

When a user creates a new site with MySQL enabled:

1. **Credential Check**: Verifies MySQL credentials are configured
2. **Database Creation**: Generates a unique database name and creates the database
3. **Configuration Update**: Updates `wp-config.php` with MySQL settings
4. **SQLite Removal**: Removes SQLite integration files (`db.php`, plugins, database directory)
5. **Site Registration**: Registers the site with Studio

### 2. Database Type Detection

The system detects database type by:
1. Reading the site's `wp-config.php` file
2. Checking for MySQL database constants (`DB_HOST`, `DB_NAME`, etc.)
3. Displaying the appropriate database type badge

### 3. Credential Management

MySQL credentials are stored securely in the user data and managed through:
- **Storage**: `UserData.mysqlCredentials` interface
- **IPC Methods**: `saveMySQLCredentials()`, `getMySQLCredentials()`, `clearMySQLCredentials()`
- **UI**: MySQL credentials configuration form

## Integration with Main Fork

This implementation is designed to be easily integratable with the main Studio fork. Here's how to integrate it:

### 1. Required Changes

#### A. Add MySQL Credentials to User Data
```typescript
// In src/storage/storage-types.ts
export interface UserData {
  // ... existing properties
  mysqlCredentials?: {
    host: string;
    port: string;
    username: string;
    password: string;
  };
}
```

#### B. Add IPC Methods
```typescript
// In src/ipc-handlers.ts
export async function saveMySQLCredentials(/* ... */): Promise<void>
export async function getMySQLCredentials(/* ... */): Promise<MySQLCredentials | null>
export async function hasMySQLConfiguration(/* ... */): Promise<boolean>
export async function testMySQLConnection(/* ... */): Promise<{ success: boolean; message: string }>
```

#### C. Update createSite Function
```typescript
// In src/ipc-handlers.ts
export async function createSite(
  event: IpcMainInvokeEvent,
  path: string,
  siteName?: string,
  wpVersion?: string,
  customDomain?: string,
  enableHttps?: boolean,
  siteId?: string,
  useMySQL?: boolean  // New parameter
): Promise<SiteDetails>
```

#### D. Add MySQL Helper Functions
```typescript
// In src/ipc-handlers.ts
async function setupMySQLSite(sitePath: string, siteName: string): Promise<void>
async function createMySQLDatabase(credentials: MySQLCredentials, databaseName: string): Promise<void>
async function updateWpConfigForMySQL(sitePath: string, credentials: MySQLCredentials, databaseName: string): Promise<void>
async function removeSqliteIntegration(sitePath: string): Promise<void>
```

### 2. UI Components

#### A. Database Type Display
```typescript
// src/modules/mysql-support/components/database-type-display.tsx
export function DatabaseTypeDisplay({ siteId, sitePath }: DatabaseTypeDisplayProps)
```

#### B. MySQL Checkbox
```typescript
// src/modules/mysql-support/components/mysql-checkbox.tsx
export function MySQLCheckbox({ checked, onChange, disabled }: MySQLCheckboxProps)
```

#### C. MySQL Credentials Form
```typescript
// src/modules/mysql-support/components/mysql-credentials.tsx
export function MySQLCredentials()
```

### 3. Hook Updates

#### A. Update useSiteDetails
```typescript
// In src/hooks/use-site-details.tsx
const createSite = useCallback(
  async (
    path: string,
    siteName?: string,
    wpVersion?: string,
    customDomain?: string,
    enableHttps?: boolean,
    useMySQL?: boolean,  // New parameter
    callback?: (site: SiteDetails) => Promise<void>
  ) => Promise<SiteDetails | void>
)
```

#### B. Update useAddSite
```typescript
// In src/hooks/use-add-site.ts
const [ useMySQL, setUseMySQL ] = useState( false );
// Add to return object and dependency arrays
```

### 4. Form Integration

#### A. Update SiteForm Props
```typescript
// In src/components/site-form.tsx
interface SiteFormProps {
  // ... existing props
  useMySQL?: boolean;
  setUseMySQL?: (use: boolean) => void;
}
```

#### B. Add MySQL Checkbox to Form
```typescript
// In src/components/site-form.tsx advanced settings section
{ setUseMySQL && (
  <div className="mt-4">
    <MySQLCheckbox
      checked={ useMySQL }
      onChange={ setUseMySQL }
      disabled={ false }
    />
  </div>
) }
```

## Configuration

### MySQL Credentials Setup

1. Navigate to the MySQL tab in Studio
2. Configure MySQL server credentials:
   - Host (default: localhost)
   - Port (default: 3306)
   - Username
   - Password
3. Test the connection
4. Save credentials

### Site Creation with MySQL

1. Click "Add site"
2. Fill in site details
3. Expand "Advanced settings"
4. Check "Use MySQL database"
5. Verify credentials are configured (green checkmark)
6. Create the site

## Database Naming Convention

MySQL databases are named using the pattern:
```
wp_{site_name_lowercase}_{timestamp}
```

Example: `wp_my_website_1703123456789`

## Error Handling

The system includes comprehensive error handling:

1. **Missing Credentials**: Shows notification to configure MySQL credentials
2. **Connection Failures**: Displays error messages with details
3. **Configuration Errors**: Logs errors and provides user feedback
4. **File System Errors**: Handles permission and file access issues

## Security Considerations

1. **Credential Storage**: MySQL credentials are stored in user data (consider encryption for production)
2. **Database Permissions**: MySQL user should have CREATE DATABASE permissions
3. **Network Security**: MySQL server should be properly secured
4. **File Permissions**: Ensure proper file permissions for wp-config.php

## Future Enhancements

1. **Real MySQL Client**: Replace placeholder with actual MySQL client library
2. **Database Management**: Add database backup/restore functionality
3. **Connection Pooling**: Implement connection pooling for better performance
4. **Advanced Configuration**: Support for MySQL configuration options
5. **Migration Tools**: Tools to migrate existing SQLite sites to MySQL

## Testing

### Manual Testing Checklist

- [ ] Configure MySQL credentials
- [ ] Create new site with MySQL enabled
- [ ] Verify wp-config.php contains MySQL settings
- [ ] Verify SQLite files are removed
- [ ] Check database type display in settings
- [ ] Test site functionality
- [ ] Verify database connection works

### Automated Testing

Consider adding tests for:
- MySQL credential validation
- Database creation process
- Configuration file updates
- SQLite file removal
- Error handling scenarios

## Troubleshooting

### Common Issues

1. **"MySQL credentials not configured"**
   - Configure credentials in MySQL tab
   - Verify credentials are saved

2. **"Database creation failed"**
   - Check MySQL server is running
   - Verify user has CREATE DATABASE permissions
   - Check network connectivity

3. **"wp-config.php not found"**
   - Ensure WordPress is properly installed
   - Check file permissions

4. **"SQLite files not removed"**
   - Check file permissions
   - Manually remove SQLite integration files

### Debug Logs

Enable debug logging to see detailed MySQL integration logs:
```typescript
console.log( '[MySQL] Creating database...' );
console.log( '[MySQL] Updated wp-config.php...' );
console.log( '[MySQL] Removed SQLite files...' );
```

## Contributing

When contributing to the MySQL integration:

1. Follow the modular architecture pattern
2. Add comprehensive error handling
3. Include user-friendly error messages
4. Test with both MySQL and SQLite configurations
5. Update documentation for any changes
6. Consider backward compatibility

## License

This MySQL integration follows the same license as the main Studio project. 