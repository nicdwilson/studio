import * as nodePath from 'path';
import * as fsExtra from 'fs-extra';
import { MySQLCredentials } from '../types';

/**
 * Updates wp-config.php to use MySQL instead of SQLite
 */
export async function updateWpConfigForMySQL( 
	sitePath: string, 
	credentials: MySQLCredentials,
	databaseName: string 
): Promise< void > {
	const wpConfigPath = nodePath.join( sitePath, 'wp-config.php' );
	
	// Wait for wp-config.php to be created (WordPress installation might still be in progress)
	let attempts = 0;
	const maxAttempts = 10;
	
	while ( attempts < maxAttempts ) {
		if ( await fsExtra.pathExists( wpConfigPath ) ) {
			break;
		}
		
		console.log( `[MySQL] wp-config.php not found, waiting... (attempt ${ attempts + 1 }/${ maxAttempts })` );
		await new Promise( resolve => setTimeout( resolve, 1000 ) );
		attempts++;
	}
	
	if ( ! ( await fsExtra.pathExists( wpConfigPath ) ) ) {
		throw new Error( 'wp-config.php not found after waiting for WordPress installation' );
	}
	
	console.log( `[MySQL] Found wp-config.php, reading content...` );
	
	// Read the current wp-config.php content
	let wpConfigContent = await fsExtra.readFile( wpConfigPath, 'utf8' );
	
	console.log( `[MySQL] Current wp-config.php content (first 500 chars):`, wpConfigContent.substring( 0, 500 ) );
	
	// Replace SQLite database configuration with MySQL
	const mysqlConfig = `// ** MySQL settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', '${ databaseName }' );

/** MySQL database username */
define( 'DB_USER', '${ credentials.username }' );

/** MySQL database password */
define( 'DB_PASSWORD', '${ credentials.password }' );

/** MySQL hostname */
define( 'DB_HOST', '${ credentials.host }:${ credentials.port }' );

/** Database Charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8' );

/** The Database Collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );`;

	// Remove SQLite-specific defines and replace with MySQL config
	wpConfigContent = wpConfigContent
		// Remove SQLite-specific defines
		.replace( /\/\*\* SQLite database file \*\/\s*define\s*\(\s*['"]DB_FILE['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		.replace( /\/\*\* SQLite database directory \*\/\s*define\s*\(\s*['"]DB_DIR['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		.replace( /\/\*\* SQLite database table prefix \*\/\s*define\s*\(\s*['"]DB_TABLE_PREFIX['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		.replace( /\/\*\* SQLite database version \*\/\s*define\s*\(\s*['"]DB_VERSION['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		.replace( /\/\*\* SQLite database charset \*\/\s*define\s*\(\s*['"]DB_CHARSET['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		.replace( /\/\*\* SQLite database collate \*\/\s*define\s*\(\s*['"]DB_COLLATE['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		// Remove any existing MySQL config
		.replace( /\/\*\* MySQL settings[^*]*\*\/\s*\/\*\* The name of the database for WordPress \*\/\s*define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*\/\*\* MySQL database username \*\/\s*define\s*\(\s*['"]DB_USER['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*\/\*\* MySQL database password \*\/\s*define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*\/\*\* MySQL hostname \*\/\s*define\s*\(\s*['"]DB_HOST['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*\/\*\* Database Charset to use in creating database tables\. \*\/\s*define\s*\(\s*['"]DB_CHARSET['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*\/\*\* The Database Collate type\. Don't change this if in doubt\. \*\/\s*define\s*\(\s*['"]DB_COLLATE['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		// Remove any existing DB_* defines
		.replace( /define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		.replace( /define\s*\(\s*['"]DB_USER['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		.replace( /define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		.replace( /define\s*\(\s*['"]DB_HOST['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		.replace( /define\s*\(\s*['"]DB_CHARSET['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' )
		.replace( /define\s*\(\s*['"]DB_COLLATE['"]\s*,\s*['"][^'"]*['"]\s*\)\s*;\s*/g, '' );

	// Find the position to insert MySQL config (after the WordPress settings comment block)
	const wpSettingsMatch = wpConfigContent.match( /(\/\*\*\s*WordPress Database Table prefix\.\s*\*\/\s*\$table_prefix\s*=\s*['"][^'"]*['"]\s*;\s*)/ );
	
	if ( wpSettingsMatch ) {
		// Insert MySQL config after the table prefix definition
		const insertPosition = wpConfigContent.indexOf( wpSettingsMatch[ 1 ] ) + wpSettingsMatch[ 1 ].length;
		wpConfigContent = wpConfigContent.slice( 0, insertPosition ) + '\n\n' + mysqlConfig + '\n\n' + wpConfigContent.slice( insertPosition );
	} else {
		// Fallback: insert after the first comment block
		const firstCommentMatch = wpConfigContent.match( /(\/\*\*\s*[^*]*\*\/\s*)/ );
		if ( firstCommentMatch ) {
			const insertPosition = wpConfigContent.indexOf( firstCommentMatch[ 1 ] ) + firstCommentMatch[ 1 ].length;
			wpConfigContent = wpConfigContent.slice( 0, insertPosition ) + '\n\n' + mysqlConfig + '\n\n' + wpConfigContent.slice( insertPosition );
		} else {
			// Last resort: prepend to the file
			wpConfigContent = '<?php\n\n' + mysqlConfig + '\n\n' + wpConfigContent.replace( /^<\?php\s*/, '' );
		}
	}

	// Write the updated wp-config.php
	await fsExtra.writeFile( wpConfigPath, wpConfigContent, 'utf8' );
	
	console.log( `[MySQL] Final wp-config.php content (first 500 chars):`, wpConfigContent.substring( 0, 500 ) );
	console.log( `[MySQL] Successfully updated wp-config.php for MySQL` );
}

/**
 * Removes SQLite integration files and folders
 */
export async function removeSqliteIntegration( sitePath: string ): Promise< void > {
	console.log( `[MySQL] Starting SQLite integration removal for: ${ sitePath }` );
	
	// Remove db.php (SQLite handler)
	const dbPhpPath = nodePath.join( sitePath, 'wp-content', 'db.php' );
	if ( await fsExtra.pathExists( dbPhpPath ) ) {
		await fsExtra.remove( dbPhpPath );
		console.log( `[MySQL] Removed db.php (SQLite handler)` );
	}
	
	// Remove SQLite integration plugin from mu-plugins
	const muPluginsPath = nodePath.join( sitePath, 'wp-content', 'mu-plugins' );
	if ( await fsExtra.pathExists( muPluginsPath ) ) {
		const sqliteIntegrationPath = nodePath.join( muPluginsPath, 'sqlite-database-integration' );
		const sqliteIntegrationPath2 = nodePath.join( muPluginsPath, 'sqlite-integration' );
		
		if ( await fsExtra.pathExists( sqliteIntegrationPath ) ) {
			await fsExtra.remove( sqliteIntegrationPath );
			console.log( `[MySQL] Removed SQLite integration plugin from mu-plugins: sqlite-database-integration` );
		}
		
		if ( await fsExtra.pathExists( sqliteIntegrationPath2 ) ) {
			await fsExtra.remove( sqliteIntegrationPath2 );
			console.log( `[MySQL] Removed SQLite integration plugin from mu-plugins: sqlite-integration` );
		}
	}
	
	// Remove SQLite integration plugin from plugins (if exists)
	const pluginsPath = nodePath.join( sitePath, 'wp-content', 'plugins' );
	if ( await fsExtra.pathExists( pluginsPath ) ) {
		const sqlitePluginPath = nodePath.join( pluginsPath, 'sqlite-database-integration' );
		if ( await fsExtra.pathExists( sqlitePluginPath ) ) {
			await fsExtra.remove( sqlitePluginPath );
			console.log( `[MySQL] Removed SQLite integration plugin from plugins` );
		} else {
			console.log( `[MySQL] SQLite plugin not found in plugins, skipping removal` );
		}
	}
	
	// Remove SQLite database directory
	const databasePath = nodePath.join( sitePath, 'database' );
	if ( await fsExtra.pathExists( databasePath ) ) {
		await fsExtra.remove( databasePath );
		console.log( `[MySQL] Removed SQLite database directory` );
	}
	
	console.log( `[MySQL] SQLite integration removal completed` );
} 