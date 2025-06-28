import { convertMySqlToSqlite } from '../sqlite-conversion';

describe('convertMySqlToSqlite', () => {
	it('should replace DB_NAME constant with wordpress string', () => {
		const mysqlSql = "SELECT * FROM wp_options WHERE option_name = 'siteurl' AND option_value LIKE CONCAT('%', DB_NAME, '%')";
		const expected = "SELECT * FROM wp_options WHERE option_name = 'siteurl' AND option_value LIKE CONCAT('%', 'wordpress', '%')";
		expect(convertMySqlToSqlite(mysqlSql)).toBe(expected);
	});

	it('should convert MySQL data types to SQLite types', () => {
		const mysqlSql = `
			CREATE TABLE wp_test (
				id INT AUTO_INCREMENT PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				description LONGTEXT,
				price DECIMAL(10,2),
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
		`;
		const expected = `
			CREATE TABLE wp_test (
				id INTEGER AUTOINCREMENT PRIMARY KEY,
				name TEXT NOT NULL,
				description TEXT,
				price REAL,
				created_at TEXT DEFAULT datetime('now')
			);
		`;
		expect(convertMySqlToSqlite(mysqlSql)).toBe(expected);
	});

	it('should convert MySQL functions to SQLite functions', () => {
		const mysqlSql = "INSERT INTO wp_posts (post_date) VALUES (NOW())";
		const expected = "INSERT INTO wp_posts (post_date) VALUES (datetime('now'))";
		expect(convertMySqlToSqlite(mysqlSql)).toBe(expected);
	});

	it('should handle INSERT IGNORE syntax', () => {
		const mysqlSql = "INSERT IGNORE INTO wp_options (option_name, option_value) VALUES ('test', 'value')";
		const expected = "INSERT OR IGNORE INTO wp_options (option_name, option_value) VALUES ('test', 'value')";
		expect(convertMySqlToSqlite(mysqlSql)).toBe(expected);
	});

	it('should handle REPLACE INTO syntax', () => {
		const mysqlSql = "REPLACE INTO wp_options (option_name, option_value) VALUES ('test', 'value')";
		const expected = "INSERT OR REPLACE INTO wp_options (option_name, option_value) VALUES ('test', 'value')";
		expect(convertMySqlToSqlite(mysqlSql)).toBe(expected);
	});

	it('should remove ON DUPLICATE KEY UPDATE clauses', () => {
		const mysqlSql = "INSERT INTO wp_options (option_name, option_value) VALUES ('test', 'value') ON DUPLICATE KEY UPDATE option_value = VALUES(option_value)";
		const expected = "INSERT INTO wp_options (option_name, option_value) VALUES ('test', 'value')";
		expect(convertMySqlToSqlite(mysqlSql)).toBe(expected);
	});

	it('should clean up trailing commas in CREATE TABLE statements', () => {
		const mysqlSql = `
			CREATE TABLE wp_test (
				id INTEGER PRIMARY KEY,
				name TEXT,
			)
		`;
		const expected = `
			CREATE TABLE wp_test (
				id INTEGER PRIMARY KEY,
				name TEXT
			)
		`;
		expect(convertMySqlToSqlite(mysqlSql)).toBe(expected);
	});

	it('should handle complex mixed SQL', () => {
		const mysqlSql = `
			CREATE TABLE wp_woocommerce_order_items (
				order_item_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
				order_item_name LONGTEXT NOT NULL,
				order_item_type VARCHAR(200) NOT NULL DEFAULT '',
				order_id BIGINT UNSIGNED NOT NULL
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
			
			INSERT INTO wp_options (option_name, option_value) VALUES ('woocommerce_db_version', '8.0.0');
		`;
		const expected = `
			CREATE TABLE wp_woocommerce_order_items (
				order_item_id INTEGER AUTOINCREMENT PRIMARY KEY,
				order_item_name TEXT NOT NULL,
				order_item_type TEXT NOT NULL DEFAULT '',
				order_id INTEGER NOT NULL
			);
			
			INSERT INTO wp_options (option_name, option_value) VALUES ('woocommerce_db_version', '8.0.0');
		`;
		expect(convertMySqlToSqlite(mysqlSql)).toBe(expected);
	});
}); 