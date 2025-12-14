import { Button, TextControl, Card } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { useState, useEffect } from 'react';
import { useSiteDetails } from 'src/hooks/use-site-details';
import { getIpcApi } from 'src/lib/get-ipc-api';

export function WizardHatTools() {
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const [ githubToken, setGithubToken ] = useState( '' );
	const [ tokenValid, setTokenValid ] = useState( false );

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

	useEffect( () => {
		// Load saved GitHub token
		const savedToken = localStorage.getItem( 'wizard-hat-github-token' );
		if ( savedToken ) {
			setGithubToken( savedToken );
			validateToken( savedToken );
		}
	}, [] );

	const validateToken = async ( token: string ) => {
		try {
			if ( token.length === 0 ) {
				setTokenValid( false );
				return;
			}

			console.log( '🚀🚀🚀 VALIDATING GITHUB TOKEN VIA IPC 🚀🚀🚀' );

			// Use the new IPC handler for token validation
			const result = await getIpcApi().validateGitHubToken( token );

			console.log( '🚀🚀🚀 TOKEN VALIDATION RESULT:', result );

			if ( result.valid ) {
				console.log( 'GitHub token validated for user:', result.user );
				setTokenValid( true );
			} else {
				console.error( 'GitHub token validation failed:', result.error );
				setTokenValid( false );
			}
		} catch ( error ) {
			console.error( 'Token validation error:', error );
			setTokenValid( false );
		}
	};

	const handleTokenChange = ( token: string ) => {
		setGithubToken( token );
		localStorage.setItem( 'wizard-hat-github-token', token );
		validateToken( token );
	};

	const removeGitHubToken = () => {
		setGithubToken( '' );
		setTokenValid( false );
		localStorage.removeItem( 'wizard-hat-github-token' );
		getIpcApi().showNotification( {
			title: __( 'Success' ),
			body: __( 'GitHub token removed' ),
		} );
	};

	return (
		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">{ __( 'Tools' ) }</h2>
				<p className="text-gray-600 mb-6">
					{ __( 'Various tools and utilities for WooCommerce development and testing.' ) }
				</p>
			</div>

			{ /* GitHub Token Section */ }
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{ __( 'GitHub Token (for Premium Plugins)' ) }
				</h3>
				<p className="text-gray-600 mb-4">
					{ __(
						'Some plugins require access to private GitHub repositories. Enter your GitHub token with "repo" scope to access premium plugins.'
					) }
				</p>

				{ tokenValid ? (
					<div className="space-y-3">
						<p className="text-green-600 text-sm">{ __( '✓ Token is valid' ) }</p>
						<Button variant="secondary" onClick={ removeGitHubToken }>
							{ __( 'Remove GitHub Token' ) }
						</Button>
					</div>
				) : (
					<div className="flex gap-4 items-end">
						<TextControl
							type="password"
							label={ __( 'GitHub Token' ) }
							value={ githubToken }
							onChange={ handleTokenChange }
							placeholder="ghp_..."
							className="flex-1"
						/>
						<Button
							variant="secondary"
							onClick={ () => getIpcApi().openURL( 'https://github.com/settings/tokens/new' ) }
						>
							{ __( 'Create Token' ) }
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
	);
}
