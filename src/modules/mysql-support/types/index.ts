export interface MySQLCredentials {
	host: string;
	port: string;
	username: string;
	password: string;
}

export interface MySQLConnectionTestResult {
	success: boolean;
	message: string;
}

export interface MySQLDatabaseConfig {
	credentials: MySQLCredentials;
	databaseName: string;
}

export interface MySQLSiteConfig {
	sitePath: string;
	siteName: string;
	siteId: string;
	databaseName: string;
} 