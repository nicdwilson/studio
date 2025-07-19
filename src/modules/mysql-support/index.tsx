import React from 'react';
import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { MySQLCredentials } from './components/mysql-credentials';

export function MySQLSupport() {
	const { __ } = useI18n();
	
	return (
		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">
					{ __( 'MySQL Database Support' ) }
				</h2>
				<p className="text-gray-600 mb-6">
					{ __(
						'Configure MySQL database support for creating WordPress sites with MySQL instead of SQLite.'
					) }
				</p>
			</div>
			<MySQLCredentials />
		</div>
	);
}

// Export individual components for use in other modules
export { MySQLCredentials } from './components/mysql-credentials';
