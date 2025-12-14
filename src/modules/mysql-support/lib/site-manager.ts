import { SiteServer } from '../../../site-server';
import { loadUserData } from 'src/storage/user-data';
import { MySQLCredentials } from '../types';
import { createMySQLDatabase, dropMySQLDatabase, generateDatabaseName, extractMySQLConfigFromWpConfig } from './database-operations';
import { updateWpConfigForMySQL, removeSqliteIntegration } from './wp-config-manager';

/**
 * Sets up a WordPress site to use MySQL instead of SQLite
 */
export async function setupMySQLSite( sitePath: string, siteName: string, siteId: string ): Promise< void > {
	console.log( `[MySQL] Starting MySQL setup for site: ${ siteName } at path: ${ sitePath }` );
	
	try {
		// Get MySQL credentials
		const userData = await loadUserData();
		const credentials = userData.mysqlCredentials;
		
		if ( ! credentials ) {
			throw new Error( 'MySQL credentials not configured. Please configure MySQL credentials in the MySQL tab.' );
		}
		
		console.log( `[MySQL] Found credentials for host: ${ credentials.host }:${ credentials.port }` );
		
		// Generate unique database name
		const databaseName = generateDatabaseName( siteName );
		console.log( `[MySQL] Generated database name: ${ databaseName }` );
		
		// Create the MySQL database
		await createMySQLDatabase( credentials, databaseName );
		
		// Wait a bit for WordPress to be fully set up
		console.log( `[MySQL] Waiting for WordPress to be fully set up...` );
		await new Promise( resolve => setTimeout( resolve, 2000 ) );
		
		// Update wp-config.php with MySQL settings
		await updateWpConfigForMySQL( sitePath, credentials, databaseName );
		
		// Remove SQLite integration files
		await removeSqliteIntegration( sitePath );
		
		console.log( `[MySQL] Successfully configured site ${ siteName } to use MySQL database ${ databaseName }` );
		
		// Restart the server to pick up the new MySQL configuration
		console.log( `[MySQL] Restarting server for site ${ siteId } to apply MySQL configuration...` );
		
		try {
			const server = SiteServer.get( siteId );
			if ( server ) {
				// Stop the server
				await server.stop();
				console.log( `[MySQL] Server stopped successfully` );
				
				// Wait longer for the server to fully stop and for MySQL config to settle
				console.log( `[MySQL] Waiting for server to fully stop and MySQL config to settle...` );
				await new Promise( resolve => setTimeout( resolve, 5000 ) );
				
				// Start the server again with a timeout
				console.log( `[MySQL] Starting server with MySQL configuration...` );
				const startPromise = server.start();
				const timeoutPromise = new Promise( ( _, reject ) => 
					setTimeout( () => reject( new Error( 'Server start timeout' ) ), 30000 )
				);
				
				await Promise.race( [ startPromise, timeoutPromise ] );
				console.log( `[MySQL] Server restarted successfully with MySQL configuration` );
			} else {
				console.log( `[MySQL] Server not found for site ${ siteId }, skipping restart` );
			}
		} catch ( error ) {
			console.error( `[MySQL] Failed to restart server:`, error );
			console.log( `[MySQL] MySQL setup was successful. You may need to manually restart the server.` );
			// Don't throw here as the MySQL setup was successful
		}
		
	} catch ( error ) {
		console.error( '[MySQL] Error setting up MySQL site:', error );
		throw error;
	}
}

/**
 * Checks if a site uses MySQL and drops the database if it exists
 */
export async function dropMySQLDatabaseIfExists( sitePath: string ): Promise< void > {
	console.log( `[MySQL] Checking if site uses MySQL for cleanup: ${ sitePath }` );
	
	// Extract MySQL configuration from wp-config.php
	const mysqlConfig = await extractMySQLConfigFromWpConfig( sitePath );
	
	if ( ! mysqlConfig ) {
		console.log( `[MySQL] No MySQL configuration found in wp-config.php, skipping database drop` );
		return;
	}
	
	console.log( `[MySQL] Found MySQL configuration for database: ${ mysqlConfig.databaseName }` );
	
	// Get MySQL credentials from user data (for connection)
	const userData = await loadUserData();
	const credentials = userData.mysqlCredentials;
	
	if ( ! credentials ) {
		console.log( `[MySQL] No MySQL credentials configured, skipping database drop` );
		return;
	}
	
	// Drop the database
	await dropMySQLDatabase( credentials, mysqlConfig.databaseName );
} 