import { Button, Card, Modal, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { useState, useEffect } from 'react';
import { getIpcApi } from 'src/lib/get-ipc-api';
import { useIpcListener } from 'src/hooks/use-ipc-listener';

interface RepositorySetupProps {
	isOpen: boolean;
	onClose: () => void;
}

export function RepositorySetup( { isOpen, onClose }: RepositorySetupProps ) {
	const { __ } = useI18n();
	const [ repositoryPath, setRepositoryPath ] = useState( '' );
	const [ isValidating, setIsValidating ] = useState( false );
	const [ validationError, setValidationError ] = useState< string | null >( null );
	const [ validationSuccess, setValidationSuccess ] = useState( false );

	// All hooks must be called before any conditional returns
	useIpcListener( 'repository-path-validated', ( _, data ) => {
		if ( data.valid ) {
			setValidationSuccess( true );
			setValidationError( null );
			setIsValidating( false );
		} else {
			setValidationSuccess( false );
			setValidationError( data.error || __( 'Invalid repository path' ) );
			setIsValidating( false );
		}
	} );

	useIpcListener( 'repository-path-saved', ( _, data ) => {
		if ( data.success ) {
			onClose();
		} else {
			setValidationError( data.error || __( 'Failed to save repository path' ) );
		}
	} );

	// Don't render if not open (after all hooks)
	if ( ! isOpen ) {
		return null;
	}

	const handlePathChange = ( value: string ) => {
		setRepositoryPath( value );
		setValidationError( null );
		setValidationSuccess( false );
	};

	const handleValidate = async () => {
		if ( ! repositoryPath.trim() ) {
			setValidationError( __( 'Please enter a repository path' ) );
			return;
		}

		setIsValidating( true );
		setValidationError( null );
		setValidationSuccess( false );

		getIpcApi().validateRepositoryPath( repositoryPath );
	};

	const handleSave = async () => {
		if ( ! validationSuccess ) {
			setValidationError( __( 'Please validate the repository path first' ) );
			return;
		}

		getIpcApi().saveRepositoryPath( repositoryPath );
	};

	const handleBrowse = async () => {
		try {
			const result = await getIpcApi().showOpenFolderDialog(
				__( 'Select all-plugins repository folder' ),
				repositoryPath || ''
			);
			if ( result?.path ) {
				setRepositoryPath( result.path );
				setValidationError( null );
				setValidationSuccess( false );
			}
		} catch ( error ) {
			console.error( 'Error browsing for folder:', error );
		}
	};

	return (
		<Modal
			title={ __( 'Repository Setup Required' ) }
			onRequestClose={ () => {} }
			isDismissible={ false }
			className="repository-setup-modal"
		>
			<div className="space-y-6" style={ { maxWidth: '600px', padding: '20px' } }>
				<p className="text-sm text-gray-600">
					{ __(
						'Before using the plugin manager, you need to set up your local copy of the all-plugins repository.'
					) }
				</p>

				<Card className="p-4 bg-blue-50">
					<h3 className="text-base font-medium mb-3">{ __( 'Step-by-Step Instructions:' ) }</h3>
					<ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
						<li>
							<strong>{ __( 'Open Terminal:' ) }</strong>{ ' ' }
							{ __( 'Open the Terminal application on your Mac.' ) }
						</li>
						<li>
							<strong>{ __( 'Clone the repository:' ) }</strong>{ ' ' }
							{ __( 'Navigate to where you want to clone the repository, then run:' ) }
							<br />
							<code className="block mt-1 p-2 bg-gray-200 rounded text-xs">
								git clone https://github.com/woocommerce/all-plugins.git
							</code>
						</li>
						<li>
							<strong>{ __( 'Note the repository path:' ) }</strong>{ ' ' }
							{ __( 'After cloning, note the full path to the repository folder.' ) }
							<br />
							{ __( 'Example:' ) }{ ' ' }
							<code className="text-xs bg-gray-200 px-1 py-0.5 rounded">
								/Users/yourname/all-plugins
							</code>
						</li>
						<li>
							<strong>{ __( 'Enter the path below:' ) }</strong>{ ' ' }
							{ __( 'Paste the full path to your local all-plugins repository.' ) }
						</li>
					</ol>
				</Card>

				<div className="space-y-2">
					<label className="block text-sm font-medium text-gray-700">
						{ __( 'Repository Path:' ) }
					</label>
					<p className="text-xs text-gray-500">
						{ __( 'Example:' ) } /Users/yourname/all-plugins
					</p>
					<div className="flex gap-2">
						<TextControl
							value={ repositoryPath }
							onChange={ handlePathChange }
							placeholder="/Users/yourname/all-plugins"
							className="flex-1"
						/>
						<Button variant="secondary" onClick={ handleBrowse }>
							{ __( 'Browse...' ) }
						</Button>
					</div>
				</div>

				{ validationError && (
					<Card className="p-3 bg-red-50">
						<p className="text-sm text-red-600">{ validationError }</p>
					</Card>
				) }

				{ validationSuccess && (
					<Card className="p-3 bg-green-50">
						<p className="text-sm text-green-600">
							{ __( '✓ Repository path is valid! You can now save and continue.' ) }
						</p>
					</Card>
				) }

				<div className="flex gap-2 justify-end">
					<Button
						variant="secondary"
						onClick={ handleValidate }
						disabled={ isValidating || ! repositoryPath.trim() }
					>
						{ isValidating ? __( 'Validating...' ) : __( 'Validate Path' ) }
					</Button>
					<Button
						variant="primary"
						onClick={ handleSave }
						disabled={ ! validationSuccess }
					>
						{ __( 'Save & Continue' ) }
					</Button>
				</div>
			</div>
		</Modal>
	);
}

