import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { useState, useEffect } from 'react';
import { Button, Card, TextControl, Notice } from '@wordpress/components';
import { getIpcApi } from 'src/lib/get-ipc-api';

interface MySQLCredentials {
	host: string;
	port: string;
	username: string;
	password: string;
}

export function MySQLCredentials() {
	const { __ } = useI18n();
	const [ credentials, setCredentials ] = useState< MySQLCredentials >( {
		host: 'localhost',
		port: '3306',
		username: '',
		password: '',
	} );
	const [ isSaving, setIsSaving ] = useState( false );
	const [ isTesting, setIsTesting ] = useState( false );
	const [ testResult, setTestResult ] = useState< { success: boolean; message: string } | null >( null );
	const [ savedCredentials, setSavedCredentials ] = useState< MySQLCredentials | null >( null );

	// Load saved credentials on component mount
	useEffect( () => {
		loadSavedCredentials();
	}, [] );

	const loadSavedCredentials = async () => {
		try {
			const saved = await getIpcApi().getMySQLCredentials();
			if ( saved ) {
				setSavedCredentials( saved );
				setCredentials( saved );
			}
		} catch ( error ) {
			console.error( 'Error loading MySQL credentials:', error );
		}
	};

	const handleSave = async () => {
		setIsSaving( true );
		setTestResult( null );

		try {
			await getIpcApi().saveMySQLCredentials( credentials );
			setSavedCredentials( credentials );
			getIpcApi().showNotification( {
				title: __( 'Success' ),
				body: __( 'MySQL credentials saved successfully.' ),
			} );
		} catch ( error ) {
			console.error( 'Error saving MySQL credentials:', error );
			getIpcApi().showErrorMessageBox( {
				title: __( 'Error' ),
				message: __( 'Failed to save MySQL credentials. Please try again.' ),
				error,
			} );
		} finally {
			setIsSaving( false );
		}
	};

	const handleTest = async () => {
		setIsTesting( true );
		setTestResult( null );

		try {
			const result = await getIpcApi().testMySQLConnection( credentials );
			setTestResult( {
				success: result.success,
				message: result.message,
			} );

			if ( result.success ) {
				getIpcApi().showNotification( {
					title: __( 'Success' ),
					body: __( 'MySQL connection test successful!' ),
				} );
			}
		} catch ( error ) {
			console.error( 'Error testing MySQL connection:', error );
			setTestResult( {
				success: false,
				message: __( 'Connection test failed. Please check your credentials.' ),
			} );
		} finally {
			setIsTesting( false );
		}
	};

	const handleClear = async () => {
		try {
			await getIpcApi().clearMySQLCredentials();
			setSavedCredentials( null );
			setCredentials( {
				host: 'localhost',
				port: '3306',
				username: '',
				password: '',
			} );
			setTestResult( null );
			getIpcApi().showNotification( {
				title: __( 'Success' ),
				body: __( 'MySQL credentials cleared successfully.' ),
			} );
		} catch ( error ) {
			console.error( 'Error clearing MySQL credentials:', error );
			getIpcApi().showErrorMessageBox( {
				title: __( 'Error' ),
				message: __( 'Failed to clear MySQL credentials. Please try again.' ),
				error,
			} );
		}
	};

	return (
		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">
					{ __( 'MySQL Database Credentials' ) }
				</h2>
				<p className="text-gray-600 mb-6">
					{ __(
						'Configure MySQL database credentials for creating new sites with MySQL instead of SQLite. These credentials will be used for all sites created with MySQL option.'
					) }
				</p>
			</div>

			<Card className="p-6 max-w-2xl mx-8">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{ __( 'Database Connection Settings' ) }
				</h3>

				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-4">
						<TextControl
							label={ __( 'Host' ) }
							value={ credentials.host }
							onChange={ ( host ) => setCredentials( { ...credentials, host } ) }
							placeholder="localhost"
							help={ __( 'MySQL server hostname or IP address' ) }
						/>
						<TextControl
							label={ __( 'Port' ) }
							value={ credentials.port }
							onChange={ ( port ) => setCredentials( { ...credentials, port } ) }
							placeholder="3306"
							help={ __( 'MySQL server port number' ) }
						/>
					</div>

					<TextControl
						label={ __( 'Username' ) }
						value={ credentials.username }
						onChange={ ( username ) => setCredentials( { ...credentials, username } ) }
						placeholder="mysql_user"
						help={ __( 'MySQL database username' ) }
					/>

					<TextControl
						label={ __( 'Password' ) }
						type="password"
						value={ credentials.password }
						onChange={ ( password ) => setCredentials( { ...credentials, password } ) }
						placeholder="••••••••"
						help={ __( 'MySQL database password' ) }
					/>
				</div>

				{ testResult && (
					<Notice
						status={ testResult.success ? 'success' : 'error' }
						className="mt-4"
						isDismissible={ false }
					>
						{ testResult.message }
					</Notice>
				) }

				<div className="flex gap-3 mt-6">
					<Button
						variant="primary"
						onClick={ handleSave }
						isBusy={ isSaving }
						disabled={ isSaving || isTesting }
					>
						{ isSaving ? __( 'Saving...' ) : __( 'Save Credentials' ) }
					</Button>

					<Button
						variant="secondary"
						onClick={ handleTest }
						isBusy={ isTesting }
						disabled={ isSaving || isTesting }
					>
						{ isTesting ? __( 'Testing...' ) : __( 'Test Connection' ) }
					</Button>

					{ savedCredentials && (
						<Button
							variant="tertiary"
							onClick={ handleClear }
							disabled={ isSaving || isTesting }
						>
							{ __( 'Clear Credentials' ) }
						</Button>
					) }
				</div>
			</Card>

			{ savedCredentials && (
				<Card className="p-6 max-w-2xl mx-8">
					<h3 className="text-lg font-medium text-gray-900 mb-4">
						{ __( 'Current Configuration' ) }
					</h3>
					<div className="space-y-2 text-sm text-gray-600">
						<div>
							<strong>{ __( 'Host' ) }:</strong> { savedCredentials.host }:{ savedCredentials.port }
						</div>
						<div>
							<strong>{ __( 'Username' ) }:</strong> { savedCredentials.username }
						</div>
						<div>
							<strong>{ __( 'Status' ) }:</strong>{ ' ' }
							<span className="text-green-600 font-medium">
								{ __( 'Configured' ) }
							</span>
						</div>
					</div>
				</Card>
			) }

			<div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mx-8">
				<h3 className="text-lg font-medium text-blue-900 mb-2">
					{ __( 'How to Use MySQL Credentials' ) }
				</h3>
				<ol className="text-blue-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">1.</span>
						<span>
							{ __(
								'Configure your MySQL server and create a database user with appropriate permissions'
							) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">2.</span>
						<span>
							{ __(
								'Enter your MySQL credentials above and test the connection to ensure it works'
							) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">3.</span>
						<span>
							{ __(
								'When creating a new site, select the MySQL option to use these credentials'
							) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">4.</span>
						<span>
							{ __(
								'Studio will automatically create the database and configure WordPress to use MySQL'
							) }
						</span>
					</li>
				</ol>
			</div>

			<div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mx-8">
				<h3 className="text-lg font-medium text-yellow-900 mb-2">
					{ __( 'Important Notes' ) }
				</h3>
				<ul className="text-yellow-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
							{ __(
								'MySQL credentials are stored securely and used only for site creation'
							) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
							{ __(
								'Each new site will create its own database using these credentials'
							) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
							{ __(
								'Make sure your MySQL user has CREATE DATABASE permissions'
							) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
							{ __(
								'Existing sites using SQLite will continue to work normally'
							) }
						</span>
					</li>
				</ul>
			</div>
		</div>
	);
} 