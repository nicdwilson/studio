import { Button, Card } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { useState, useEffect } from 'react';
import { useSiteDetails } from 'src/hooks/use-site-details';
import { getIpcApi } from 'src/lib/get-ipc-api';
import { RepositorySetup } from './repository-setup';

export function WizardHatTools() {
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const [ repositoryPath, setRepositoryPath ] = useState< string | null >( null );
	const [ showRepositorySetup, setShowRepositorySetup ] = useState( false );

	useEffect( () => {
		void checkRepositoryPath();
	}, [] );

	const checkRepositoryPath = async () => {
		try {
			// Ensure IPC API is available
			if ( ! window.ipcApi ) {
				console.warn( 'IPC API not available yet' );
				return;
			}
			const result = await getIpcApi().getRepositoryPath();
			if ( result.configured && result.path ) {
				setRepositoryPath( result.path );
			} else {
				setRepositoryPath( null );
			}
		} catch ( error ) {
			console.error( 'Error checking repository path:', error );
			setRepositoryPath( null );
		}
	};

	const removeRepositoryPath = async () => {
		try {
			await getIpcApi().saveRepositoryPath( '' );
			setRepositoryPath( null );
			getIpcApi().showNotification( {
				title: __( 'Success' ),
				body: __( 'Repository path removed' ),
			} );
		} catch ( error ) {
			console.error( 'Error removing repository path:', error );
		}
	};

	if ( ! selectedSite ) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl px-8">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">{ __( 'Tools' ) }</h2>
					<p className="text-gray-600 mb-6">{ __( 'Please select a site to access tools.' ) }</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<RepositorySetup
				isOpen={ showRepositorySetup }
				onClose={ async () => {
					setShowRepositorySetup( false );
					await checkRepositoryPath();
				} }
			/>

		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">{ __( 'Tools' ) }</h2>
				<p className="text-gray-600 mb-6">
					{ __( 'Various tools and utilities for WooCommerce development and testing.' ) }
				</p>
			</div>

				{ /* Repository Path Section */ }
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
						{ __( 'Local Repository Path (for Premium Plugins)' ) }
				</h3>
				<p className="text-gray-600 mb-4">
					{ __(
							'Premium plugins are installed from a local clone of the all-plugins repository. Configure the path to your local repository to access premium plugins.'
					) }
				</p>

					{ repositoryPath ? (
					<div className="space-y-3">
							<div className="p-3 bg-green-50 border border-green-200 rounded">
								<p className="text-sm text-green-800 font-medium mb-1">
									{ __( '✓ Repository path is configured' ) }
								</p>
								<p className="text-xs text-green-700 break-all">{ repositoryPath }</p>
							</div>
							<div className="flex gap-2">
								<Button variant="secondary" onClick={ () => setShowRepositorySetup( true ) }>
									{ __( 'Change Path' ) }
								</Button>
								<Button variant="secondary" onClick={ removeRepositoryPath }>
									{ __( 'Remove Path' ) }
						</Button>
							</div>
					</div>
				) : (
						<div className="space-y-3">
							<p className="text-sm text-gray-600">
								{ __( 'No repository path configured. Click the button below to set it up.' ) }
							</p>
							<Button variant="primary" onClick={ () => setShowRepositorySetup( true ) }>
								{ __( 'Configure Repository Path' ) }
						</Button>
					</div>
				) }
			</Card>

			{ /* Additional Tools Section */ }
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">{ __( 'Additional Tools' ) }</h3>
				<p className="text-gray-600 mb-4">
					{ __( 'More tools and utilities will be added here in the future.' ) }
				</p>
			</Card>
		</div>
		</>
	);
}
