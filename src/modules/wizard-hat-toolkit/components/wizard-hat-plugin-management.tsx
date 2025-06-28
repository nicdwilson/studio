import { __ } from '@wordpress/i18n';
import { useI18n } from '@wordpress/react-i18n';
import { Button, Card, CheckboxControl, Spinner, TextControl } from '@wordpress/components';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getIpcApi } from 'src/lib/get-ipc-api';
import { useSiteDetails } from 'src/hooks/use-site-details';

interface PluginOption {
	label: string;
	value: string;
	type: 'public' | 'premium';
	repository?: string;
}

// Quick Install plugins (WordPress.org)
const QUICK_INSTALL_PLUGINS: PluginOption[] = [
	{ label: 'WooCommerce', value: 'woocommerce', type: 'public' },
	{ label: 'WooCommerce Payments', value: 'woocommerce-payments', type: 'public' },
	{ label: 'WooCommerce Gateway Stripe', value: 'woocommerce-gateway-stripe', type: 'public' },
	{ label: 'WooCommerce PayPal Payments', value: 'woocommerce-paypal-payments', type: 'public' },
	{ label: 'WooCommerce Square', value: 'woocommerce-square', type: 'public' },
	{ label: 'WP Crontrol', value: 'wp-crontrol', type: 'public' },
];

// Quick Install marketplace plugins
const QUICK_INSTALL_MARKETPLACE_PLUGINS: PluginOption[] = [
	{
		label: 'WooCommerce Subscriptions',
		value: 'woocommerce-subscriptions',
		type: 'premium',
		repository: 'https://github.com/woocommerce/all-plugins',
	},
	{
		label: 'AutomateWoo',
		value: 'automatewoo',
		type: 'premium',
		repository: 'https://github.com/woocommerce/all-plugins',
	},
];

export function WizardHatPluginManagement() {
	console.log( 'WIZARD HAT PLUGIN MANAGEMENT COMPONENT LOADED - TIMESTAMP:', Date.now() );

	const { __ } = useI18n();
	const { selectedSite } = useSiteDetails();
	const { startServer, loadingServer } = useSiteDetails();
	const [ selectedPlugins, setSelectedPlugins ] = useState< string[] >( [] );
	const [ installing, setInstalling ] = useState( false );
	const [ installationLog, setInstallationLog ] = useState< string[] >( [] );

	// Marketplace functionality
	const [ githubToken, setGithubToken ] = useState( '' );
	const [ tokenValid, setTokenValid ] = useState( false );
	const [ allPremiumPlugins, setAllPremiumPlugins ] = useState< PluginOption[] >( [] );
	const [ loadingPremiumPlugins, setLoadingPremiumPlugins ] = useState( false );
	const [ searchTerm, setSearchTerm ] = useState( '' );
	const [ showSearchResults, setShowSearchResults ] = useState( false );
	const searchRef = useRef< HTMLDivElement >( null );

	// Click outside handler to close search results
	useEffect( () => {
		const handleClickOutside = ( event: MouseEvent ) => {
			if ( searchRef.current && ! searchRef.current.contains( event.target as Node ) ) {
				setShowSearchResults( false );
			}
		};

		document.addEventListener( 'mousedown', handleClickOutside );
		return () => {
			document.removeEventListener( 'mousedown', handleClickOutside );
		};
	}, [] );

	// Load GitHub token for marketplace functionality
	useEffect( () => {
		const savedToken = localStorage.getItem( 'wizard-hat-github-token' );
		if ( savedToken ) {
			setGithubToken( savedToken );
			validateToken( savedToken );
		}
	}, [] );

	if ( ! selectedSite ) {
		return (
			<div className="space-y-8">
				<div className="max-w-3xl px-8">
					<h2 className="text-xl font-semibold text-gray-900 mb-4">
						{ __( 'Plugin Management' ) }
					</h2>
					<p className="text-gray-600 mb-6">{ __( 'Please select a site to manage plugins.' ) }</p>
				</div>
			</div>
		);
	}

	const isLoading = selectedSite?.id ? loadingServer[ selectedSite.id ] : false;

	const validateToken = async ( token: string ) => {
		try {
			if ( token.length === 0 ) {
				setTokenValid( false );
				return;
			}

			const result = await getIpcApi().validateGitHubToken( token );

			if ( result.valid ) {
				setTokenValid( true );
				await loadPremiumPlugins( token );
			} else {
				setTokenValid( false );
				setAllPremiumPlugins( [] );
			}
		} catch ( error ) {
			console.error( 'Token validation error:', error );
			setTokenValid( false );
			setAllPremiumPlugins( [] );
		}
	};

	const loadPremiumPlugins = async ( token: string ) => {
		setLoadingPremiumPlugins( true );
		try {
			const result = await getIpcApi().getAvailablePremiumPlugins( token );

			if ( result.success && result.plugins ) {
				const premiumOptions: PluginOption[] = result.plugins.map( ( plugin ) => ( {
					label: plugin.label,
					value: plugin.name,
					type: 'premium' as const,
					repository: 'https://github.com/woocommerce/all-plugins',
				} ) );

				setAllPremiumPlugins( premiumOptions );
			} else {
				setAllPremiumPlugins( [] );
			}
		} catch ( error ) {
			console.error( 'Error loading premium plugins:', error );
			setAllPremiumPlugins( [] );
		} finally {
			setLoadingPremiumPlugins( false );
		}
	};

	const togglePlugin = ( pluginValue: string ) => {
		setSelectedPlugins( ( prev ) =>
			prev.includes( pluginValue )
				? prev.filter( ( p ) => p !== pluginValue )
				: [ ...prev, pluginValue ]
		);
	};

	const removePlugin = ( pluginValue: string ) => {
		setSelectedPlugins( ( prev ) => prev.filter( ( p ) => p !== pluginValue ) );
	};

	// Filter premium plugins based on search term
	const filteredPremiumPlugins = useMemo( () => {
		if ( searchTerm.length < 3 ) {
			return [];
		}

		const term = searchTerm.toLowerCase();
		return allPremiumPlugins
			.filter(
				( plugin ) =>
					plugin.label.toLowerCase().includes( term ) || plugin.value.toLowerCase().includes( term )
			)
			.filter( ( plugin ) => ! selectedPlugins.includes( plugin.value ) )
			.slice( 0, 10 );
	}, [ searchTerm, allPremiumPlugins, selectedPlugins ] );

	const handleSearchChange = useCallback( ( value: string ) => {
		setSearchTerm( value );
		if ( value.length >= 3 ) {
			setShowSearchResults( true );
		} else {
			setShowSearchResults( false );
		}
	}, [] );

	const addPremiumPluginFromSearch = ( pluginValue: string ) => {
		if ( ! selectedPlugins.includes( pluginValue ) ) {
			setSelectedPlugins( ( prev ) => [ ...prev, pluginValue ] );
			setSearchTerm( '' );
			setShowSearchResults( false );
		}
	};

	const installSelectedPlugins = async () => {
		if ( selectedPlugins.length === 0 ) return;

		setInstalling( true );
		setInstallationLog( [] );

		try {
			// Ensure site is running
			if ( ! selectedSite.running ) {
				await startServer( selectedSite.id );
			}

			const allPlugins = [
				...QUICK_INSTALL_PLUGINS,
				...QUICK_INSTALL_MARKETPLACE_PLUGINS,
				...allPremiumPlugins,
			];
			const pluginsToInstall = allPlugins.filter( ( plugin ) =>
				selectedPlugins.includes( plugin.value )
			);

			setInstallationLog( ( prev ) => [
				...prev,
				`🚀 Starting installation of ${ pluginsToInstall.length } plugins...`,
			] );

			const results = {
				success: [] as string[],
				failed: [] as Array< { plugin: string; error: string } >,
			};

			for ( const plugin of pluginsToInstall ) {
				try {
					setInstallationLog( ( prev ) => [ ...prev, `📦 Installing ${ plugin.label }...` ] );

					if ( plugin.type === 'premium' ) {
						if ( ! githubToken ) {
							throw new Error( 'GitHub token required for premium plugins' );
						}

						const result = await getIpcApi().installPluginFromPrivateRepo( {
							siteId: selectedSite.id,
							repositoryUrl: plugin.repository!,
							githubToken,
							pluginName: plugin.value,
						} );

						if ( ! result.success ) {
							throw new Error( result.error || 'Failed to install premium plugin' );
						}

						results.success.push( plugin.label );
						setInstallationLog( ( prev ) => [
							...prev,
							`✅ ${ plugin.label } installed successfully`,
						] );
					} else {
						const result = await getIpcApi().executeWPCLiInline( {
							siteId: selectedSite.id,
							args: `plugin install ${ plugin.value } --activate`,
						} );

						if ( result.exitCode === 0 ) {
							results.success.push( plugin.label );
							setInstallationLog( ( prev ) => [
								...prev,
								`✅ ${ plugin.label } installed successfully`,
							] );
						} else {
							results.failed.push( { plugin: plugin.label, error: result.stderr } );
							setInstallationLog( ( prev ) => [
								...prev,
								`❌ ${ plugin.label } failed: ${ result.stderr }`,
							] );
						}
					}
				} catch ( error ) {
					console.error( `Error installing ${ plugin.label }:`, error );
					results.failed.push( {
						plugin: plugin.label,
						error: error instanceof Error ? error.message : String( error ),
					} );
					setInstallationLog( ( prev ) => [
						...prev,
						`❌ ${ plugin.label } failed: ${
							error instanceof Error ? error.message : String( error )
						}`,
					] );
				}
			}

			// Show final results
			if ( results.success.length > 0 ) {
				setInstallationLog( ( prev ) => [
					...prev,
					`\n✅ Successfully installed: ${ results.success.join( ', ' ) }`,
				] );
			}
			if ( results.failed.length > 0 ) {
				setInstallationLog( ( prev ) => [
					...prev,
					`\n❌ Failed to install: ${ results.failed.map( ( f ) => f.plugin ).join( ', ' ) }`,
				] );
			}
		} catch ( error ) {
			console.error( 'Error during plugin installation:', error );
			setInstallationLog( ( prev ) => [
				...prev,
				`❌ Installation failed: ${ error instanceof Error ? error.message : String( error ) }`,
			] );
		} finally {
			setInstalling( false );
		}
	};

	return (
		<div className="space-y-8">
			<div className="max-w-3xl px-8">
				<h2 className="text-xl font-semibold text-gray-900 mb-4">{ __( 'Plugin Management' ) }</h2>
				<p className="text-gray-600 mb-6">
					{ __(
						'Install and manage WooCommerce plugins. Configure your GitHub token in the Tools tab for marketplace plugins.'
					) }
				</p>
			</div>

			{ /* Quick Install Section */ }
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">{ __( 'Quick Install' ) }</h3>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
					{ QUICK_INSTALL_PLUGINS.map( ( plugin ) => (
						<CheckboxControl
							key={ plugin.value }
							label={ plugin.label }
							checked={ selectedPlugins.includes( plugin.value ) }
							onChange={ () => togglePlugin( plugin.value ) }
						/>
					) ) }
					{ QUICK_INSTALL_MARKETPLACE_PLUGINS.map( ( plugin ) => (
						<CheckboxControl
							key={ plugin.value }
							label={ plugin.label }
							checked={ selectedPlugins.includes( plugin.value ) }
							onChange={ () => togglePlugin( plugin.value ) }
							disabled={ ! tokenValid }
						/>
					) ) }
				</div>
				{ ! tokenValid && (
					<p className="text-sm text-gray-500 mt-2">
						{ __( 'Configure your GitHub token in the Tools tab to install marketplace plugins.' ) }
					</p>
				) }
			</Card>

			{ /* Marketplace Section */ }
			<Card className="p-6">
				<h3 className="text-lg font-medium text-gray-900 mb-4">{ __( 'Marketplace' ) }</h3>

				{ tokenValid ? (
					<div className="space-y-4" ref={ searchRef }>
						<TextControl
							label={ __( 'Search plugins (type 3+ characters)' ) }
							value={ searchTerm }
							onChange={ handleSearchChange }
							placeholder={ __( 'Search for marketplace plugins...' ) }
							disabled={ loadingPremiumPlugins }
							onFocus={ () => {
								if ( searchTerm.length >= 3 ) {
									setShowSearchResults( true );
								}
							} }
						/>

						{ /* Search Results */ }
						{ showSearchResults && (
							<div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto bg-white shadow-lg">
								{ filteredPremiumPlugins.length > 0 ? (
									<div className="divide-y divide-gray-100">
										{ filteredPremiumPlugins.map( ( plugin ) => (
											<div
												key={ plugin.value }
												className="flex items-center justify-between p-3 hover:bg-blue-50 cursor-pointer transition-colors"
												onClick={ () => addPremiumPluginFromSearch( plugin.value ) }
											>
												<div className="flex-1">
													<div className="font-medium text-gray-900">{ plugin.label }</div>
													<div className="text-sm text-gray-500">{ plugin.value }</div>
												</div>
												<Button
													variant="tertiary"
													size="small"
													onClick={ ( e: React.MouseEvent ) => {
														e.stopPropagation();
														addPremiumPluginFromSearch( plugin.value );
													} }
												>
													{ __( 'Add' ) }
												</Button>
											</div>
										) ) }
									</div>
								) : searchTerm.length >= 3 ? (
									<div className="p-4 text-center text-gray-500">
										{ __( 'No plugins found matching your search.' ) }
									</div>
								) : null }
							</div>
						) }

						{ loadingPremiumPlugins && (
							<div className="flex items-center gap-2 text-sm text-gray-600">
								<Spinner />
								{ __( 'Loading marketplace plugins...' ) }
							</div>
						) }

						{ ! loadingPremiumPlugins && allPremiumPlugins.length > 0 && (
							<div className="text-sm text-gray-500">
								{ __( 'Available marketplace plugins:' ) } { allPremiumPlugins.length }
							</div>
						) }
					</div>
				) : (
					<div className="text-center py-8">
						<p className="text-gray-600 mb-4">
							{ __( 'Configure your GitHub token in the Tools tab to access the marketplace.' ) }
						</p>
						<Button
							variant="secondary"
							onClick={ () => {
								// This would ideally navigate to the Tools tab
								// For now, we'll just show a message
								getIpcApi().showNotification( {
									title: __( 'Tools Tab' ),
									body: __( 'Please go to the Tools tab to configure your GitHub token.' ),
								} );
							} }
						>
							{ __( 'Go to Tools Tab' ) }
						</Button>
					</div>
				) }
			</Card>

			{ /* Selected Plugins List */ }
			{ selectedPlugins.length > 0 && (
				<Card className="p-6">
					<h3 className="text-lg font-medium text-gray-900 mb-4">
						{ __( 'Selected Plugins' ) } ({ selectedPlugins.length })
					</h3>
					<div className="space-y-2">
						{ selectedPlugins.map( ( pluginValue ) => {
							const allPlugins = [
								...QUICK_INSTALL_PLUGINS,
								...QUICK_INSTALL_MARKETPLACE_PLUGINS,
								...allPremiumPlugins,
							];
							const plugin = allPlugins.find( ( p ) => p.value === pluginValue );
							return (
								<div
									key={ pluginValue }
									className="flex items-center justify-between p-2 bg-gray-50 rounded"
								>
									<span className="text-sm">
										{ plugin?.label || pluginValue }
										{ plugin?.type === 'premium' && (
											<span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
												{ __( 'Premium' ) }
											</span>
										) }
									</span>
									<Button
										variant="tertiary"
										size="small"
										onClick={ () => removePlugin( pluginValue ) }
									>
										{ __( 'Remove' ) }
									</Button>
								</div>
							);
						} ) }
					</div>

					<div className="mt-4">
						<Button
							variant="primary"
							onClick={ installSelectedPlugins }
							disabled={ isLoading || installing }
							className="w-full"
						>
							{ installing ? (
								<div className="flex items-center gap-2">
									<Spinner />
									{ __( 'Installing...' ) }
								</div>
							) : (
								__( 'Install Selected Plugins' )
							) }
						</Button>
					</div>
				</Card>
			) }

			{ /* Installation Log */ }
			{ installationLog.length > 0 && (
				<Card className="p-6">
					<h3 className="text-lg font-medium text-gray-900 mb-4">{ __( 'Installation Log' ) }</h3>
					<div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
						<pre className="text-sm text-gray-800 whitespace-pre-wrap">
							{ installationLog.join( '\n' ) }
						</pre>
					</div>
				</Card>
			) }

			{ /* Information Section */ }
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
				<h3 className="text-lg font-medium text-blue-900 mb-2">
					{ __( 'Plugin Installation Information' ) }
				</h3>
				<ul className="text-blue-800 space-y-2">
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
							{ __( 'WordPress.org plugins are installed from the official repository' ) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>
							{ __( 'Marketplace plugins require a valid GitHub token (configure in Tools tab)' ) }
						</span>
					</li>
					<li className="flex items-start">
						<span className="font-medium mr-2">•</span>
						<span>{ __( 'All plugins will be installed and activated automatically' ) }</span>
					</li>
				</ul>
			</div>
		</div>
	);
}
