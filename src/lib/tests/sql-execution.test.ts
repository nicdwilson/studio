import fs from 'fs';
import nodePath from 'path';
import { convertMySqlToSqlite } from '../sqlite-conversion';

// Mock the TEMP_DIR and fs.promises
const mockTempDir = '/tmp/test';
const mockFsPromises = {
	mkdir: jest.fn(),
	writeFile: jest.fn(),
	unlink: jest.fn(),
};

jest.mock( 'fs', () => ( {
	promises: mockFsPromises,
} ) );

jest.mock( 'path', () => ( {
	join: jest.fn( ( ...args ) => args.join( '/' ) ),
} ) );

describe( 'SQL Execution with Temporary Files', () => {
	beforeEach( () => {
		jest.clearAllMocks();
	} );

	it( 'should convert MySQL SQL to SQLite-compatible SQL', () => {
		const mysqlSql = `
			INSERT INTO wp_options (option_name, option_value) 
			VALUES ('test_option', 'a:3:{s:5:"title";s:9:"Flat rate";s:10:"tax_status";s:7:"taxable";s:4:"cost";s:2:"10";}')
			ON DUPLICATE KEY UPDATE option_value = VALUES(option_value);
		`;

		const result = convertMySqlToSqlite( mysqlSql );

		// Should remove ON DUPLICATE KEY UPDATE clause
		expect( result ).not.toContain( 'ON DUPLICATE KEY UPDATE' );

		// Should preserve the core INSERT statement
		expect( result ).toContain( 'INSERT INTO wp_options' );
		expect( result ).toContain( 'test_option' );
		expect( result ).toContain( 'a:3:{s:5:"title";s:9:"Flat rate"' );
	} );

	it( 'should handle complex SQL with special characters', () => {
		const complexSql = `
			INSERT INTO wp_options (option_name, option_value, autoload) 
			VALUES ('woocommerce_flat_rate_24_settings', 'a:3:{s:5:"title";s:9:"Flat rate";s:10:"tax_status";s:7:"taxable";s:4:"cost";s:2:"10";}', 'yes');
		`;

		const result = convertMySqlToSqlite( complexSql );

		// Should not contain any MySQL-specific syntax
		expect( result ).not.toContain( 'ON DUPLICATE KEY UPDATE' );
		expect( result ).not.toContain( 'ENGINE=' );
		expect( result ).not.toContain( 'CHARSET=' );

		// Should preserve the complex data
		expect( result ).toContain( 'woocommerce_flat_rate_24_settings' );
		expect( result ).toContain( 'a:3:{s:5:"title";s:9:"Flat rate"' );
	} );

	it( 'should handle DB_NAME constant replacement', () => {
		const sqlWithDbName =
			"SELECT * FROM wp_options WHERE option_value LIKE CONCAT('%', DB_NAME, '%')";
		const result = convertMySqlToSqlite( sqlWithDbName );
		expect( result ).toBe(
			"SELECT * FROM wp_options WHERE option_value LIKE CONCAT('%', 'wordpress', '%')"
		);
	} );
} );
