import { useI18n } from '@wordpress/react-i18n';
import { useEffect, useState } from 'react';
import { getIpcApi } from 'src/lib/get-ipc-api';

interface DatabaseTypeDisplayProps {
	siteId: string;
	sitePath: string;
}

export function DatabaseTypeDisplay({ siteId, sitePath }: DatabaseTypeDisplayProps) {
	const { __ } = useI18n();
	const [ databaseType, setDatabaseType ] = useState<'mysql' | 'sqlite' | 'loading'>('loading');

	useEffect(() => {
		const detectDatabaseType = async () => {
			try {
				// Check if the site has MySQL configuration
				const hasMySQLConfig = await getIpcApi().hasMySQLConfiguration(siteId);
				setDatabaseType(hasMySQLConfig ? 'mysql' : 'sqlite');
			} catch (error) {
				console.error('Error detecting database type:', error);
				setDatabaseType('sqlite'); // Default to SQLite on error
			}
		};

		detectDatabaseType();
	}, [siteId]);

	if (databaseType === 'loading') {
		return <span className="text-a8c-gray-50">{ __('Detecting...') }</span>;
	}

	return (
		<div className="flex items-center gap-2">
			<span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
				databaseType === 'mysql' 
					? 'bg-blue-100 text-blue-800' 
					: 'bg-gray-100 text-gray-800'
			}`}>
				{databaseType === 'mysql' ? 'MySQL' : 'SQLite'}
			</span>
			{databaseType === 'mysql' && (
				<span className="text-a8c-gray-50 text-xs">
					{ __('External database') }
				</span>
			)}
		</div>
	);
} 