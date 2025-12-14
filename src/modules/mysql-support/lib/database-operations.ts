import * as nodePath from 'path';
import * as fsExtra from 'fs-extra';
import { MySQLCredentials, MySQLDatabaseConfig } from '../types';

/**
 * Creates a MySQL database using the provided credentials
 */
export async function createMySQLDatabase( 
	credentials: MySQLCredentials,
	databaseName: string 
): Promise< void > {
	console.log( `[MySQL] Creating database ${ databaseName } on ${ credentials.host }:${ credentials.port }` );
	
	try {
		// Import mysql2 dynamically to avoid issues if not installed
		const mysql = await import( 'mysql2/promise' );
		
		// Create connection without specifying database (to create it)
		const connection = await mysql.createConnection( {
			host: credentials.host,
			port: parseInt( credentials.port ),
			user: credentials.username,
			password: credentials.password,
		} );
		
		// Create the database
		await connection.execute( `CREATE DATABASE IF NOT EXISTS \`${ databaseName }\`` );
		console.log( `[MySQL] Successfully created database: ${ databaseName }` );
		
		// Close the connection
		await connection.end();
		
	} catch ( error ) {
		console.error( `[MySQL] Failed to create database ${ databaseName }:`, error );
		throw new Error( `Failed to create MySQL database: ${ error instanceof Error ? error.message : 'Unknown error' }` );
	}
}

/**
 * Drops a MySQL database if it exists
 */
export async function dropMySQLDatabase( 
	credentials: MySQLCredentials,
	databaseName: string 
): Promise< void > {
	console.log( `[MySQL] Dropping database ${ databaseName } on ${ credentials.host }:${ credentials.port }` );
	
	try {
		// Import mysql2 dynamically to avoid issues if not installed
		const mysql = await import( 'mysql2/promise' );
		
		// Create connection without specifying database (to drop it)
		const connection = await mysql.createConnection( {
			host: credentials.host,
			port: parseInt( credentials.port ),
			user: credentials.username,
			password: credentials.password,
		} );
		
		// Drop the database
		await connection.execute( `DROP DATABASE IF EXISTS \`${ databaseName }\`` );
		console.log( `[MySQL] Successfully dropped database: ${ databaseName }` );
		
		// Close the connection
		await connection.end();
		
	} catch ( error ) {
		console.error( `[MySQL] Failed to drop database ${ databaseName }:`, error );
		throw new Error( `Failed to drop MySQL database: ${ error instanceof Error ? error.message : 'Unknown error' }` );
	}
}

/**
 * Tests MySQL connection with provided credentials
 */
export async function testMySQLConnection( credentials: MySQLCredentials ): Promise< { success: boolean; message: string } > {
	try {
		const mysql = await import( 'mysql2/promise' );
		
		const connection = await mysql.createConnection( {
			host: credentials.host,
			port: parseInt( credentials.port ),
			user: credentials.username,
			password: credentials.password,
		} );
		
		// Test the connection
		await connection.ping();
		await connection.end();
		
		return {
			success: true,
			message: `Successfully connected to MySQL server at ${ credentials.host }:${ credentials.port }`
		};
		
	} catch ( error ) {
		return {
			success: false,
			message: `Failed to connect to MySQL: ${ error instanceof Error ? error.message : 'Unknown error' }`
		};
	}
}

/**
 * Generates a unique database name for a site
 */
export function generateDatabaseName( siteName: string ): string {
	const timestamp = Date.now();
	const sanitizedName = siteName
		.toLowerCase()
		.replace( /[^a-z0-9]/g, '_' )
		.replace( /_+/g, '_' )
		.replace( /^_|_$/g, '' );
	
	return `wp_${ sanitizedName }_${ timestamp }`;
}

/**
 * Extracts MySQL configuration from wp-config.php
 */
export async function extractMySQLConfigFromWpConfig( sitePath: string ): Promise< {
	databaseName: string;
	host: string;
	port: string;
	username: string;
	password: string;
} | null > {
	const wpConfigPath = nodePath.join( sitePath, 'wp-config.php' );
	
	// Check if wp-config.php exists
	if ( ! ( await fsExtra.pathExists( wpConfigPath ) ) ) {
		return null;
	}
	
	try {
		// Read wp-config.php to check if it's using MySQL
		const wpConfigContent = await fsExtra.readFile( wpConfigPath, 'utf8' );
		
		// Check if this is a MySQL configuration by looking for MySQL host
		const mysqlHostMatch = wpConfigContent.match( /define\s*\(\s*['"]DB_HOST['"]\s*,\s*['"]([^'"]+):(\d+)['"]\s*\)/ );
		
		if ( ! mysqlHostMatch ) {
			return null;
		}
		
		const host = mysqlHostMatch[ 1 ];
		const port = mysqlHostMatch[ 2 ];
		
		// Extract database name
		const dbNameMatch = wpConfigContent.match( /define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]+)['"]\s*\)/ );
		if ( ! dbNameMatch ) {
			return null;
		}
		
		const databaseName = dbNameMatch[ 1 ];
		
		// Extract username and password
		const dbUserMatch = wpConfigContent.match( /define\s*\(\s*['"]DB_USER['"]\s*,\s*['"]([^'"]+)['"]\s*\)/ );
		const dbPasswordMatch = wpConfigContent.match( /define\s*\(\s*['"]DB_PASSWORD['"]\s*,\s*['"]([^'"]+)['"]\s*\)/ );
		
		if ( ! dbUserMatch || ! dbPasswordMatch ) {
			return null;
		}
		
		const username = dbUserMatch[ 1 ];
		const password = dbPasswordMatch[ 1 ];
		
		return {
			databaseName,
			host,
			port,
			username,
			password
		};
		
	} catch ( error ) {
		console.error( `[MySQL] Error extracting MySQL config from wp-config.php:`, error );
		return null;
	}
} 