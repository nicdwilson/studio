/**
 * Convert MySQL-specific SQL syntax to SQLite-compatible syntax
 */
export function convertMySqlToSqlite( sql: string ): string {
	let convertedSql = sql;

	// Remove MySQL-specific constants that don't exist in SQLite
	convertedSql = convertedSql.replace( /DB_NAME/g, "'wordpress'" );

	// Convert MySQL-specific data types to SQLite-compatible ones
	convertedSql = convertedSql.replace( /\bTINYINT\b/gi, 'INTEGER' );
	convertedSql = convertedSql.replace( /\bSMALLINT\b/gi, 'INTEGER' );
	convertedSql = convertedSql.replace( /\bMEDIUMINT\b/gi, 'INTEGER' );
	convertedSql = convertedSql.replace( /\bBIGINT\b/gi, 'INTEGER' );
	convertedSql = convertedSql.replace( /\bINT\b/gi, 'INTEGER' );
	convertedSql = convertedSql.replace( /\bVARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT' );
	convertedSql = convertedSql.replace( /\bCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT' );
	convertedSql = convertedSql.replace( /\bLONGTEXT\b/gi, 'TEXT' );
	convertedSql = convertedSql.replace( /\bMEDIUMTEXT\b/gi, 'TEXT' );
	convertedSql = convertedSql.replace( /\bTEXT\s*\(\s*\d+\s*\)/gi, 'TEXT' );
	convertedSql = convertedSql.replace( /\bDATETIME\b/gi, 'TEXT' );
	convertedSql = convertedSql.replace( /\bTIMESTAMP\b/gi, 'TEXT' );
	convertedSql = convertedSql.replace( /\bDECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, 'REAL' );
	convertedSql = convertedSql.replace( /\bFLOAT\b/gi, 'REAL' );
	convertedSql = convertedSql.replace( /\bDOUBLE\b/gi, 'REAL' );

	// Remove UNSIGNED keyword (not supported in SQLite)
	convertedSql = convertedSql.replace( /\bUNSIGNED\b/gi, '' );

	// Remove MySQL-specific options more thoroughly
	convertedSql = convertedSql.replace( /\bENGINE\s*=\s*\w+/gi, '' );
	convertedSql = convertedSql.replace( /\bCHARSET\s*=\s*\w+/gi, '' );
	convertedSql = convertedSql.replace( /\bCOLLATE\s*=\s*\w+/gi, '' );
	convertedSql = convertedSql.replace( /\bAUTO_INCREMENT/gi, 'AUTOINCREMENT' );

	// Convert MySQL-specific functions
	convertedSql = convertedSql.replace( /\bNOW\s*\(\s*\)/gi, "datetime('now')" );
	convertedSql = convertedSql.replace( /\bCURRENT_TIMESTAMP/gi, "datetime('now')" );

	// Remove MySQL-specific syntax that SQLite doesn't support
	convertedSql = convertedSql.replace( /\bON DUPLICATE KEY UPDATE\s+.*?(?=;|$)/gi, '' );
	convertedSql = convertedSql.replace( /\bINSERT IGNORE/gi, 'INSERT OR IGNORE' );
	convertedSql = convertedSql.replace( /\bREPLACE INTO/gi, 'INSERT OR REPLACE INTO' );

	// Clean up any trailing commas in CREATE TABLE statements
	convertedSql = convertedSql.replace( /,(\s*\))/g, '$1' );

	// Clean up multiple spaces and empty lines
	convertedSql = convertedSql.replace( /\s+/g, ' ' );
	convertedSql = convertedSql.replace( /\n\s*\n/g, '\n' );
	convertedSql = convertedSql.replace( /\s+\)/g, ')' );
	convertedSql = convertedSql.replace( /\)\s+DEFAULT\s*;/g, ');' );

	// Remove any empty lines or excessive whitespace
	convertedSql = convertedSql.trim();

	return convertedSql;
}
