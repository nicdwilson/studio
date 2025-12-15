import { Button, Card, Spinner, Notice } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { useState, useEffect, useCallback } from 'react';
import { download, copy } from '@wordpress/icons';
import { useSiteDetails } from 'src/hooks/use-site-details';
import { getIpcApi } from 'src/lib/get-ipc-api';

interface BlueprintStep {
	step: string;
	pluginData?: {
		resource: string;
		slug: string;
	};
	themeData?: {
		resource: string;
		slug: string;
	};
	options?: any;
	sql?: {
		resource: string;
		name?: string;
		contents?: string;
	};
}

interface BlueprintFile {
	landingPage?: string;
	steps: BlueprintStep[];
}

interface ImportResult {
	step: string;
	success: boolean;
	message: string;
}

export function WizardHatImportBlueprint() {
	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const [ selectedFile, setSelectedFile ] = useState< string | null >( null );
	const [ blueprintData, setBlueprintData ] = useState< BlueprintFile | null >( null );
	const [ isValidating, setIsValidating ] = useState( false );
	const [ isImporting, setIsImporting ] = useState( false );
	const [ importResults, setImportResults ] = useState< ImportResult[] >( [] );
	const [ error, setError ] = useState< string | null >( null );
	const [ githubToken, setGithubToken ] = useState( '' );

	// Load GitHub token for premium plugins
	useEffect( () => {
		const savedToken = localStorage.getItem( 'wizard-hat-github-token' );
		if ( savedToken ) {
			setGithubToken( savedToken );
		}
	}, [] );

	if ( ! selectedSite ) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">{ __( 'Import Woo Blueprint' ) }</h2>
				<p className="text-gray-600 mb-6">
					{ __( 'Please select a site to import a Woo Blueprint.' ) }
				</p>
				</div>
			</div>
		);
	}

	const handleFileSelect = async () => {
		try {
			const result = await getIpcApi().showOpenFileDialog( __( 'Select Woo Blueprint File' ), '', [
				{ name: 'JSON Files', extensions: [ 'json' ] },
			] );

			if ( result ) {
				setSelectedFile( result.path );
				setError( null );
				setImportResults( [] );
				await validateBlueprintFile( result.path );
			}
		} catch ( error ) {
			console.error( 'Error selecting file:', error );
			setError( __( 'Failed to select file. Please try again.' ) );
		}
	};

	const validateBlueprintFile = async ( filePath: string ) => {
		setIsValidating( true );
		setError( null );

		try {
			const fileContent = await getIpcApi().getFileContent( filePath );

			// The getFileContent function already handles encoding and BOM removal
			// and returns a string directly
			let fileContentString: string = fileContent;

			// Remove BOM (Byte Order Mark) if present (extra safety)
			fileContentString = fileContentString.replace( /^\uFEFF/, '' );

			// Check for common JSON issues
			const trimmedContent = fileContentString.trim();
			if ( ! trimmedContent.startsWith( '{' ) ) {
				// Show the actual characters and their codes for debugging
				const firstChars = trimmedContent.substring( 0, 20 );
				const charCodes = Array.from( firstChars )
					.map( ( char ) => char.charCodeAt( 0 ) )
					.join( ',' );
				throw new Error(
					`Invalid JSON format: File must start with '{'. Found: "${ firstChars }" (char codes: ${ charCodes })`
				);
			}

			if ( ! trimmedContent.endsWith( '}' ) ) {
				throw new Error(
					`Invalid JSON format: File must end with '}'. Found: "...${ trimmedContent.substring(
						trimmedContent.length - 20
					) }"`
				);
			}

			let blueprint: BlueprintFile;
			try {
				blueprint = JSON.parse( fileContentString ) as BlueprintFile;
			} catch ( parseError ) {
				// Provide more detailed JSON parsing error information
				const errorMessage =
					parseError instanceof Error ? parseError.message : 'Unknown JSON parsing error';
				const firstLine = fileContentString.split( '\n' )[ 0 ];
				throw new Error(
					`JSON parsing error: ${ errorMessage }\n\nFirst line of file: "${ firstLine }"`
				);
			}

			// Basic validation
			if ( ! blueprint.steps || ! Array.isArray( blueprint.steps ) ) {
				throw new Error( __( 'Invalid Woo Blueprint format: missing or invalid steps array' ) );
			}

			// Check for required WooCommerce version
			const hasWooCommerce = blueprint.steps.some(
				( step ) => step.step === 'installPlugin' && step.pluginData?.slug === 'woocommerce'
			);

			if ( ! hasWooCommerce ) {
				setError(
					__(
						'This Woo Blueprint does not include WooCommerce installation. Please ensure WooCommerce is already installed on your site.'
					)
				);
			}

			setBlueprintData( blueprint );
		} catch ( error ) {
			console.error( 'Error validating Woo Blueprint:', error );
			setError(
				error instanceof Error ? error.message : __( 'Failed to validate Woo Blueprint file' )
			);
			setBlueprintData( null );
		} finally {
			setIsValidating( false );
		}
	};

	const handleImport = async () => {
		if ( ! selectedFile || ! blueprintData ) {
			return;
		}

		setIsImporting( true );
		setImportResults( [] );
		setError( null );

		try {
			const result = await getIpcApi().importWooCommerceBlueprint( {
				siteId: selectedSite.id,
				blueprintPath: selectedFile,
				githubToken: githubToken || undefined,
			} );

			if ( result.success ) {
				setImportResults( result.results || [] );
				getIpcApi().showNotification( {
					title: __( 'Success' ),
					body: __( 'Woo Blueprint imported successfully!' ),
				} );
			} else {
				setError( result.error || __( 'Import failed' ) );
				setImportResults( result.results || [] );
			}
		} catch ( error ) {
			console.error( 'Error importing Woo Blueprint:', error );
			setError( error instanceof Error ? error.message : __( 'Failed to import Woo Blueprint' ) );
		} finally {
			setIsImporting( false );
		}
	};

	const getStepSummary = () => {
		if ( ! blueprintData ) return null;

		const summary = {
			plugins: 0,
			themes: 0,
			options: 0,
			sql: 0,
		};

		blueprintData.steps.forEach( ( step ) => {
			switch ( step.step ) {
				case 'installPlugin':
					summary.plugins++;
					break;
				case 'installTheme':
					summary.themes++;
					break;
				case 'setSiteOptions':
					summary.options++;
					break;
				case 'runSql':
					summary.sql++;
					break;
			}
		} );

		return summary;
	};

	const stepSummary = getStepSummary();

	const formatImportResultsAsText = useCallback( ( results: ImportResult[] ): string => {
		const lines: string[] = [];
		lines.push( '=== Woo Blueprint Import Results ===' );
		lines.push( '' );
		lines.push( `Date: ${ new Date().toLocaleString() }` );
		lines.push( `Site: ${ selectedSite?.name || 'Unknown' }` );
		lines.push( '' );
		lines.push( '--- Results ---' );
		lines.push( '' );

		results.forEach( ( result, index ) => {
			const status = result.success ? '✓ SUCCESS' : '✗ FAILED';
			lines.push( `${ index + 1 }. [${ status }] ${ result.step }` );
			lines.push( `   ${ result.message }` );
			lines.push( '' );
		} );

		lines.push( '--- Summary ---' );
		lines.push( '' );
		const successful = results.filter( ( r ) => r.success ).length;
		const failed = results.filter( ( r ) => ! r.success ).length;
		lines.push( `Total Steps: ${ results.length }` );
		lines.push( `Successful: ${ successful }` );
		lines.push( `Failed: ${ failed }` );
		lines.push( '' );
		lines.push( '=== End of Import Results ===' );

		return lines.join( '\n' );
	}, [ selectedSite?.name ] );

	return (
		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">{ __( 'Import Woo Blueprint' ) }</h2>
				<p className="text-gray-600 mb-6">
					{ __(
						'Import a Woo Blueprint to automatically configure your site with plugins, themes, and settings.'
					) }
				</p>
			</div>

			{ /* File Selection */ }
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">
					{ __( 'Select Woo Blueprint File' ) }
				</h3>

				<div className="space-y-4">
					<Button
						variant="secondary"
						onClick={ handleFileSelect }
						disabled={ isValidating || isImporting }
					>
						{ selectedFile ? __( 'Change File' ) : __( 'Choose Woo Blueprint File' ) }
					</Button>

					{ selectedFile && (
						<div className="text-sm text-gray-600">
							{ __( 'Selected file:' ) } { selectedFile }
						</div>
					) }

					{ isValidating && (
						<div className="flex items-center gap-2 text-sm text-gray-600">
							<Spinner />
							{ __( 'Validating Woo Blueprint file...' ) }
						</div>
					) }
				</div>
			</Card>

			{ /* Woo Blueprint Summary */ }
			{ blueprintData && stepSummary && (
				<Card className="p-6">
					<h3 className="text-lg font-medium text-gray-900 mb-4">{ __( 'Woo Blueprint Summary' ) }</h3>

					<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
						<div className="text-center p-3 bg-blue-50 rounded-lg">
							<div className="text-2xl font-bold text-blue-600">{ stepSummary.plugins }</div>
							<div className="text-sm text-gray-600">{ __( 'Plugins' ) }</div>
						</div>
						<div className="text-center p-3 bg-green-50 rounded-lg">
							<div className="text-2xl font-bold text-green-600">{ stepSummary.themes }</div>
							<div className="text-sm text-gray-600">{ __( 'Themes' ) }</div>
						</div>
						<div className="text-center p-3 bg-yellow-50 rounded-lg">
							<div className="text-2xl font-bold text-yellow-600">{ stepSummary.options }</div>
							<div className="text-sm text-gray-600">{ __( 'Settings' ) }</div>
						</div>
						<div className="text-center p-3 bg-purple-50 rounded-lg">
							<div className="text-2xl font-bold text-purple-600">{ stepSummary.sql }</div>
							<div className="text-sm text-gray-600">{ __( 'SQL Queries' ) }</div>
						</div>
					</div>

					{ blueprintData.landingPage && (
						<div className="mt-4 p-3 bg-gray-50 rounded-lg">
							<div className="text-sm font-medium text-gray-700">{ __( 'Landing Page:' ) }</div>
							<div className="text-sm text-gray-600">{ blueprintData.landingPage }</div>
						</div>
					) }
				</Card>
			) }

			{ /* Error Display */ }
			{ error && (
				<Notice status="error" isDismissible={ false }>
					{ error }
				</Notice>
			) }

			{ /* Import Button */ }
			{ blueprintData && (
				<Card className="p-6">
					<div className="flex items-center justify-between">
						<div>
							<h3 className="text-lg font-medium text-gray-900 mb-2">
								{ __( 'Ready to Import' ) }
							</h3>
							<p className="text-sm text-gray-600">
								{ __( 'This will install and configure all components in the Woo Blueprint.' ) }
							</p>
						</div>
						<Button variant="primary" onClick={ handleImport } disabled={ isImporting }>
							{ isImporting ? (
								<div className="flex items-center gap-2">
									<Spinner />
									{ __( 'Importing...' ) }
								</div>
							) : (
								__( 'Import Woo Blueprint' )
							) }
						</Button>
					</div>
				</Card>
			) }

			{ /* Import Results */ }
			{ importResults.length > 0 && (
				<Card className="p-6">
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-lg font-medium text-gray-900">{ __( 'Import Results' ) }</h3>
						<div className="flex items-center gap-2">
							<Button
								variant="secondary"
								icon={ copy }
								onClick={ async () => {
									const logText = formatImportResultsAsText( importResults );
									await getIpcApi().copyText( logText );
									getIpcApi().showNotification( {
										title: __( 'Copied to clipboard' ),
										body: __( 'Import results copied to clipboard' ),
									} );
								} }
							>
								{ __( 'Copy Log' ) }
							</Button>
							<Button
								variant="secondary"
								icon={ download }
								onClick={ async () => {
									const logText = formatImportResultsAsText( importResults );
									const timestamp = new Date().toISOString().replace( /[:.]/g, '-' );
									const defaultFileName = `woo-blueprint-import-${ timestamp }.txt`;

									try {
										const filePath = await getIpcApi().showSaveAsDialog( {
											defaultPath: defaultFileName,
											filters: [
												{ name: 'Text Files', extensions: [ 'txt' ] },
												{ name: 'All Files', extensions: [ '*' ] },
											],
										} );

										if ( filePath ) {
											const result = await getIpcApi().writeFile( filePath, logText );
											if ( result.success ) {
												getIpcApi().showNotification( {
													title: __( 'File saved' ),
													body: __( 'Import results saved successfully' ),
												} );
											} else {
												getIpcApi().showNotification( {
													title: __( 'Error' ),
													body: result.error || __( 'Failed to save file' ),
												} );
											}
										}
									} catch ( error ) {
										console.error( 'Error saving file:', error );
										getIpcApi().showNotification( {
											title: __( 'Error' ),
											body: error instanceof Error ? error.message : __( 'Failed to save file' ),
										} );
									}
								} }
							>
								{ __( 'Save Log' ) }
							</Button>
						</div>
					</div>

					<div className="space-y-2 max-h-60 overflow-y-auto">
						{ importResults.map( ( result, index ) => (
							<div
								key={ index }
								className={ `p-3 rounded-lg ${
									result.success
										? 'bg-green-50 border border-green-200'
										: 'bg-red-50 border border-red-200'
								}` }
							>
								<div className="flex items-center gap-2">
									<div
										className={ `w-2 h-2 rounded-full ${
											result.success ? 'bg-green-500' : 'bg-red-500'
										}` }
									/>
									<div className="flex-1">
										<div className="text-sm font-medium text-gray-900">{ result.step }</div>
										<div className="text-sm text-gray-600">{ result.message }</div>
									</div>
								</div>
							</div>
						) ) }
					</div>

					{ /* Summary */ }
					<div className="mt-4 pt-4 border-t border-gray-200">
						<div className="text-sm text-gray-600">
							{ __( 'Completed:' ) } { importResults.filter( ( r ) => r.success ).length }/
							{ importResults.length } { __( 'steps' ) }
						</div>
					</div>
				</Card>
			) }

			{ /* Information */ }
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
				<h3 className="text-lg font-medium text-blue-900 mb-2">
					{ __( 'About WooCommerce Blueprints' ) }
				</h3>
				<ul className="text-blue-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
							{ __( 'Woo Blueprints can install WordPress.org and premium WooCommerce plugins' ) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
							{ __( 'Premium plugins require a valid GitHub token (configure in Tools tab)' ) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
							{ __( 'Themes, WooCommerce settings, and database configurations will be applied' ) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{ __( 'Ensure WooCommerce is installed before importing blueprints' ) }</span>
					</li>
				</ul>
			</div>
		</div>
	);
}
